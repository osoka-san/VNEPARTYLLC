/** Offline only. PGlite is not Supabase Auth/PostgREST or multi-session PostgreSQL.
 * Requires existing locked dependencies and reviewed baseline files; never connects to a service.
 * Optional paths: VNE_R2_BASELINE_DIR, VNE_R2_EVIDENCE_PATH.
 */
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID as id, createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselineDir =
  process.env.VNE_R2_BASELINE_DIR || "/workspace/shared/vne-id-migration/candidate";
const sqlPath = join(root, "docs/backend-r2/membership_questionnaire_proposal.sql");
const evidencePath =
  process.env.VNE_R2_EVIDENCE_PATH || join(root, "docs/backend-r2/evidence/questionnaire-db.json");
const temporary = await mkdtemp(join(tmpdir(), "vne-r2-db-"));
const results = [];
let invalidCases = 0;
const pass = (name) => {
  results.push(name);
  console.log(`PASS ${name}`);
};
const hash = (s) => createHash("sha256").update(s).digest("hex");
// Execute the actual TypeScript canonicalizer without adding dependencies or changing build files.
for (const name of ["questionnaire", "questionnaire-submission", "questionnaire-contract"]) {
  const source = await readFile(join(root, `src/lib/${name}.ts`), "utf8");
  const output = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from "\.\/(questionnaire(?:-submission)?)"/g, 'from "./$1.mjs"');
  await writeFile(join(temporary, `${name}.mjs`), output);
}
const { QUESTIONNAIRE_QUESTIONS: questions, QUESTIONNAIRE_RATING_QUESTIONS: ratings } =
  await import(pathToFileURL(join(temporary, "questionnaire.mjs")));
const { parseQuestionnaireSnapshot } = await import(
  pathToFileURL(join(temporary, "questionnaire-contract.mjs"))
);
const wire = (answer = "Свой ответ") => ({
  questionnaireVersion: 3,
  questionnaire: questions.map(({ id: questionId, question, options }) => ({
    questionId,
    question,
    answers: [
      { answer: options[0], source: "choice" },
      { answer: options[1], source: "choice" },
      { answer, source: "custom" },
    ],
  })),
  ratings: { social_energy: 1, evening_pace: 50, spontaneity: 100 },
  age: 29,
});
const command = (answer) => {
  const parsed = parseQuestionnaireSnapshot(wire(answer));
  assert.equal(parsed.ok, true);
  return {
    idempotencyKey: id(),
    intake: {
      displayName: "SYNTHETIC PERSON",
      email: "contact@synthetic.invalid",
      telegramUsername: "synthetic_user",
      eventSlug: null,
    },
    questionnaire: parsed.snapshot,
    consentVersion: "draft-2026-09",
  };
};
const copy = (v) => structuredClone(v);
const db = new PGlite();
const q = async (sql, args) => (await db.query(sql, args)).rows;
const scalar = async (sql, args) => Object.values((await q(sql, args))[0])[0];
const baseline = await readFile(join(baselineDir, "restricted_test_baseline.sql"), "utf8");
const extension = await readFile(join(baselineDir, "id_trace_extension.sql"), "utf8");
const proposal = await readFile(sqlPath, "utf8");
try {
  await db.exec(
    (await readFile(join(root, "tests/db/supabase-stub.sql"), "utf8")).replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    ),
  );
  await db.exec(
    "alter table auth.users add column email_confirmed_at timestamptz, add column raw_user_meta_data jsonb default '{}';",
  );
  await db.exec("begin;" + baseline + "commit;");
  await db.exec("begin;" + extension + "commit;");
  const legacy = id();
  await q(
    "insert into public.membership_requests(id,email,display_name,telegram_username) values($1,$2,$3,$4)",
    [legacy, "contact@synthetic.invalid", "SYNTHETIC LEGACY", "legacy_user"],
  );
  const legacyBefore = (
    await q("select * from public.membership_requests where id=$1", [legacy])
  )[0];
  const indexBefore = await scalar(
    "select pg_get_indexdef('public.membership_requests_pending_email_uq'::regclass)",
  );
  // Demonstrate transactional DDL rollback independently of the successful application.
  await db.exec(proposal.replace(/commit;\s*$/, "rollback;"));
  assert.equal(
    await scalar(
      "select count(*)::int from information_schema.columns where table_schema='public' and table_name='membership_requests' and column_name='owner_user_id'",
    ),
    0,
  );
  assert.equal(
    await scalar("select pg_get_indexdef('public.membership_requests_pending_email_uq'::regclass)"),
    indexBefore,
  );
  assert.deepEqual(
    (await q("select * from public.membership_requests where id=$1", [legacy]))[0],
    legacyBefore,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'r2_%' or p.proname like 'membership_questionnaire_%')",
    ),
    0,
  );
  pass("DDL transaction rollback restores columns, index, functions and legacy row");
  // Review preflight rejects an unreviewed index shape; the failed transaction is fully rolled back.
  await db.exec(
    "begin; drop index public.membership_requests_pending_email_uq; create unique index membership_requests_pending_email_uq on public.membership_requests(email) where status='pending';",
  );
  await assert.rejects(db.exec(proposal.replace(/^begin;$/m, "")), /baseline_index_drift/);
  await db.exec("rollback;");
  assert.equal(
    await scalar("select pg_get_indexdef('public.membership_requests_pending_email_uq'::regclass)"),
    indexBefore,
  );
  pass("Index drift preflight aborts safely without changing baseline");
  await db.exec(proposal);
  const after = (await q("select * from public.membership_requests where id=$1", [legacy]))[0];
  for (const [k, v] of Object.entries(legacyBefore)) assert.deepEqual(after[k], v);
  for (const k of ["owner_user_id", "questionnaire_snapshot", "idempotency_key", "correlation_id"])
    assert.equal(after[k], null);
  pass("Existing unowned legacy request remains unchanged and unlinked");
  const acl =
    await q(`select r.rolname,has_table_privilege(r.oid,'public.membership_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed
    from pg_roles r where r.rolname in ('anon','authenticated','service_role')`);
  assert.ok(acl.every((r) => !r.allowed));
  assert.equal(
    await scalar(
      `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='private' and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'EXECUTE')`,
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from pg_policies where schemaname='public' and tablename='membership_requests'",
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select relrowsecurity from pg_class where oid='public.membership_requests'::regclass",
    ),
    true,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%questionnaire%'`,
    ),
    0,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and (p.proname like 'r2_%' or p.proname like 'membership_questionnaire_%') and a.grantee=0 and a.privilege_type='EXECUTE'`,
    ),
    0,
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(q("select * from public.membership_requests"), /permission denied/);
    await assert.rejects(
      q("select private.membership_questionnaire_list_own()"),
      /permission denied/,
    );
    await assert.rejects(
      q("update public.membership_requests set display_name='changed'"),
      /permission denied/,
    );
    await db.exec("reset role");
  }
  pass(
    "PUBLIC and API roles remain closed; actual role reads/writes/RPC denied; no wrappers or policies",
  );
  const definition = await scalar("select private.r2_questionnaire_definition()");
  assert.deepEqual(definition, { questions, ratings });
  pass(
    "Frozen SQL question labels/options/scale meanings exactly match current TypeScript v3 definition",
  );
  const user = id(),
    other = id(),
    staff = id(),
    session = id(),
    otherSession = id(),
    staffSession = id();
  const makeUser = async (u, s) => {
    await q("insert into auth.users(id,email) values($1,$2)", [
      u,
      "auth-" + u + "@synthetic.invalid",
    ]);
    await q(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",
      [s, u],
    );
  };
  await makeUser(user, session);
  await makeUser(other, otherSession);
  await makeUser(staff, staffSession);
  const as = async (u = user, s = session, extra = {}) =>
    q("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: u, session_id: s, role: "authenticated", aal: "aal1", ...extra }),
    ]);
  const submit = async (c) =>
    scalar("select private.membership_questionnaire_submit($1::jsonb)", [JSON.stringify(c)]);
  const read = async (requestId) =>
    scalar("select private.membership_questionnaire_read_own($1)", [requestId]);
  const list = async () => scalar("select private.membership_questionnaire_list_own()");
  const valid = async (c) =>
    scalar("select private.r2_membership_command_valid($1::jsonb)", [JSON.stringify(c)]);
  const counts = async () =>
    (
      await q(`select (select count(*)::int from public.membership_requests) requests,
    (select count(*)::int from private.audit_log) audits,(select count(*)::int from private.outbox) outbox,
    (select count(*)::int from public.invites) invites,(select count(*)::int from private.member_admission) admission,
    (select count(*)::int from public.applications) applications,(select count(*)::int from public.staff_assignments) roles`)
    )[0];
  await as();
  const full = command();
  // Maximum complete shape: 7 questions × 3 independent 120-code-unit answers = 2,520 text units.
  const maxWire = wire();
  maxWire.questionnaire.forEach((x) => {
    x.answers = [
      { answer: "😀".repeat(60), source: "manual" },
      { answer: "я".repeat(120), source: "manual" },
      { answer: "z".repeat(120), source: "custom" },
    ];
  });
  maxWire.age = 100;
  const maxParsed = parseQuestionnaireSnapshot(maxWire);
  assert.equal(maxParsed.ok, true);
  full.questionnaire = maxParsed.snapshot;
  assert.equal(await valid(full), true);
  assert.equal(await scalar("select private.r2_utf16_length($1)", ["😀".repeat(60)]), 120);
  const before = await counts(),
    created = await submit(full),
    afterCreate = await counts();
  assert.equal(created.ok, true);
  assert.equal(created.outcome, "created");
  assert.equal(created.receipt.ownerUserId, user);
  assert.deepEqual(afterCreate, {
    ...before,
    requests: before.requests + 1,
    audits: before.audits + 1,
  });
  const stored = (
    await q("select * from public.membership_requests where id=$1", [created.receipt.requestId])
  )[0];
  assert.deepEqual(stored.questionnaire_snapshot, full.questionnaire);
  assert.equal(stored.questionnaire_snapshot.questions.flatMap((x) => x.answers).length, 21);
  assert.equal(stored.email, full.intake.email);
  assert.notEqual(stored.email, "auth-" + user + "@synthetic.invalid");
  assert.equal(stored.consent_version, "draft-2026-09");
  assert.equal(stored.consent_method, "web_form_checkbox");
  assert.ok(stored.consent_at);
  const audit = (
    await q(
      "select * from private.audit_log where action='membership_questionnaire.submitted' and object_id=$1",
      [stored.id],
    )
  )[0];
  assert.deepEqual(audit.details, { request_id: stored.id, correlation_id: stored.correlation_id });
  assert.equal(audit.actor, user);
  assert.equal(audit.correlation_id, created.receipt.correlationId);
  pass(
    "Full 7×3 maximum snapshot, consent, request and metadata-only audit saved atomically without truncation",
  );
  pass(
    "Unverified contact email is separate from account identity; no admission/invitation/outbox/event/role writes",
  );
  const replay = await submit(full);
  assert.equal(replay.outcome, "replay");
  assert.deepEqual(replay.receipt, created.receipt);
  assert.deepEqual(await counts(), afterCreate);
  const changed = copy(full);
  changed.questionnaire.age = 99;
  assert.deepEqual(await submit(changed), { ok: false, reason: "conflict" });
  for (const field of ["displayName", "email", "telegramUsername", "eventSlug"]) {
    const c = copy(full);
    c.intake[field] = {
      displayName: "OTHER",
      email: "other@synthetic.invalid",
      telegramUsername: "other_user",
      eventSlug: "other-event",
    }[field];
    assert.deepEqual(await submit(c), { ok: false, reason: "conflict" });
  }
  const newKey = copy(full);
  newKey.idempotencyKey = id();
  assert.deepEqual(await submit(newKey), { ok: false, reason: "conflict" });
  assert.deepEqual(await counts(), afterCreate);
  pass(
    "Owner+key replay preserves ID/correlation with zero new writes; changed payload or new key while pending conflicts",
  );
  assert.deepEqual(await read(stored.id), created.receipt);
  assert.deepEqual(await list(), [created.receipt]);
  await as(other, otherSession);
  assert.equal(await read(stored.id), null);
  assert.equal(await read(legacy), null);
  assert.deepEqual(await list(), []);
  const second = await submit(full);
  assert.equal(second.ok, true);
  assert.notEqual(second.receipt.requestId, stored.id);
  assert.equal(second.receipt.ownerUserId, other);
  assert.equal((await list()).length, 1);
  assert.equal(
    await scalar("select count(*)::int from public.membership_requests where email=$1", [
      full.intake.email,
    ]),
    3,
  );
  await assert.rejects(
    q(
      "insert into public.membership_requests(email,display_name,telegram_username) values($1,$2,$3)",
      [full.intake.email, "SYNTHETIC LEGACY 2", "legacy_two"],
    ),
    /membership_requests_pending_email_uq/,
  );
  pass(
    "Foreign/legacy reads return null; same key/contact independent per owner; legacy email uniqueness preserved",
  );
  await as();
  const bad = [];
  const invalid = (label, mutator) => {
    const x = command();
    mutator(x);
    bad.push([label, x]);
  };
  invalid("owner injection", (x) => (x.ownerUserId = other));
  invalid("status injection", (x) => (x.status = "approved"));
  invalid("command missing key", (x) => delete x.idempotencyKey);
  invalid("malformed key", (x) => (x.idempotencyKey = "wrong"));
  invalid("old consent", (x) => (x.consentVersion = "old"));
  invalid("missing consent", (x) => delete x.consentVersion);
  invalid("questionnaire null", (x) => (x.questionnaire = null));
  invalid("version string", (x) => (x.questionnaire.version = "3"));
  invalid("old version", (x) => (x.questionnaire.version = 2));
  invalid("identity inside snapshot", (x) => (x.questionnaire.ownerUserId = other));
  invalid("six questions", (x) => x.questionnaire.questions.pop());
  invalid("eight questions", (x) =>
    x.questionnaire.questions.push(copy(x.questionnaire.questions[0])),
  );
  invalid("question reordered", (x) => x.questionnaire.questions.reverse());
  invalid(
    "question duplicate",
    (x) => (x.questionnaire.questions[1] = copy(x.questionnaire.questions[0])),
  );
  invalid("spoofed question label", (x) => (x.questionnaire.questions[0].label = "spoof"));
  invalid("unknown question key", (x) => (x.questionnaire.questions[0].status = "approved"));
  invalid("no answers", (x) => (x.questionnaire.questions[0].answers = []));
  invalid("four answers", (x) =>
    x.questionnaire.questions[0].answers.push({ text: "extra", source: "manual" }),
  );
  invalid(
    "two custom answers",
    (x) => (x.questionnaire.questions[0].answers[0] = { text: "extra", source: "custom" }),
  );
  invalid(
    "duplicate choice",
    (x) =>
      (x.questionnaire.questions[0].answers[1] = copy(x.questionnaire.questions[0].answers[0])),
  );
  invalid(
    "unknown choice",
    (x) => (x.questionnaire.questions[0].answers[0].text = "not an option"),
  );
  invalid("unknown source", (x) => (x.questionnaire.questions[0].answers[0].source = "inferred"));
  invalid("answer number", (x) => (x.questionnaire.questions[0].answers[2].text = 5));
  invalid("answer extra key", (x) => (x.questionnaire.questions[0].answers[2].score = 1));
  invalid("empty answer", (x) => (x.questionnaire.questions[0].answers[2].text = ""));
  invalid(
    "over 120 code units",
    (x) => (x.questionnaire.questions[0].answers[2].text = "😀".repeat(61)),
  );
  invalid("six words", (x) => (x.questionnaire.questions[0].answers[2].text = "a b c d e f"));
  invalid("leading space", (x) => (x.questionnaire.questions[0].answers[2].text = " a"));
  invalid("double space", (x) => (x.questionnaire.questions[0].answers[2].text = "a  b"));
  invalid("NBSP noncanonical", (x) => (x.questionnaire.questions[0].answers[2].text = "a\u00a0b"));
  for (const c of ["\u0001", "\n", "\t", "\u007f"])
    invalid(
      "control answer " + c.codePointAt(0),
      (x) => (x.questionnaire.questions[0].answers[2].text = "a" + c + "b"),
    );
  invalid("rating missing", (x) => x.questionnaire.ratings.pop());
  invalid("rating extra", (x) => x.questionnaire.ratings.push(copy(x.questionnaire.ratings[0])));
  invalid("rating label spoof", (x) => (x.questionnaire.ratings[0].label = "spoof"));
  invalid("rating scale spoof", (x) => (x.questionnaire.ratings[0].minLabel = "spoof"));
  invalid("rating string", (x) => (x.questionnaire.ratings[0].value = "1"));
  for (const value of [0, 101, 1.5, null])
    invalid("rating range " + value, (x) => (x.questionnaire.ratings[0].value = value));
  for (const value of [0, 101, 1.5, null, "29"])
    invalid("age range " + value, (x) => (x.questionnaire.age = value));
  invalid("intake missing field", (x) => delete x.intake.eventSlug);
  invalid("intake owner injection", (x) => (x.intake.owner = other));
  invalid("name over UTF16 max", (x) => (x.intake.displayName = "😀".repeat(41)));
  invalid("email bad", (x) => (x.intake.email = "invalid"));
  invalid("email case noncanonical", (x) => (x.intake.email = "UPPER@synthetic.invalid"));
  invalid("email whitespace", (x) => (x.intake.email = "a\uFEFFb@synthetic.invalid"));
  invalid("telegram invalid", (x) => (x.intake.telegramUsername = "@synthetic_user"));
  invalid("event invalid", (x) => (x.intake.eventSlug = "UPPER"));
  invalid("very large answer bounded before UTF16 work", (x) => {
    x.questionnaire.questions[0].answers[2].text = "😀".repeat(100000);
  });
  invalid("very large display name bounded before UTF16 work", (x) => {
    x.intake.displayName = "😀".repeat(100000);
  });
  invalid("very large email bounded before UTF16 work", (x) => {
    x.intake.email = "a".repeat(100000) + "@synthetic.invalid";
  });
  const beforeInvalid = await counts();
  for (const [label, c] of bad) {
    assert.equal(await valid(c), false, label);
    await assert.rejects(submit(c), /invalid_command/, label);
    invalidCases++;
  }
  for (const x of [null, [], {}, false, "text"]) {
    assert.equal(await valid(x), false);
    await assert.rejects(submit(x), /invalid_command/);
    invalidCases++;
  }
  assert.deepEqual(await counts(), beforeInvalid);
  pass(`${invalidCases} malformed/spoofed/boundary commands rejected by DB with zero writes`);
  for (const white of [
    " ",
    "\u00a0",
    "\u1680",
    "\u2000",
    "\u200a",
    "\u2028",
    "\u2029",
    "\u202f",
    "\u205f",
    "\u3000",
    "\uFEFF",
  ]) {
    const parsed = parseQuestionnaireSnapshot(wire(white + "a" + white.repeat(2) + "b" + white));
    assert.equal(parsed.ok, true);
    const c = command();
    c.questionnaire = parsed.snapshot;
    assert.equal(await valid(c), true, "JS whitespace " + white.codePointAt(0));
    assert.equal(
      await scalar("select private.r2_js_normalize($1)", [
        white + "a" + white.repeat(2) + "b" + white,
      ]),
      "a b",
    );
  }
  const min = command();
  min.questionnaire.age = 1;
  assert.equal(await valid(min), true);
  const manual = command();
  manual.questionnaire.questions.forEach(
    (x) =>
      (x.answers = [
        { text: "same", source: "manual" },
        { text: "same", source: "manual" },
      ]),
  );
  assert.equal(await valid(manual), true);
  pass(
    "Canonical TS→SQL parity covers ECMAScript Unicode whitespace, UTF16 maximum, age 1 and permitted repeated manual answers",
  );
  for (const claims of [
    {},
    { sub: user, role: "authenticated" },
    { sub: user, session_id: id(), role: "authenticated" },
    { sub: user, session_id: otherSession, role: "authenticated" },
    { sub: user, session_id: session, role: "anon" },
    { sub: user, session_id: session, role: "service_role" },
    { sub: user, session_id: session, role: "authenticated", is_anonymous: true },
    { sub: "not-uuid", session_id: session, role: "authenticated" },
    { sub: user, session_id: "bad", role: "authenticated" },
  ]) {
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
    await assert.rejects(submit(full), /forbidden/);
    await assert.rejects(list(), /forbidden/);
    await assert.rejects(read(stored.id), /forbidden/);
  }
  await as();
  await q("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session]);
  await assert.rejects(submit(full), /forbidden/);
  await assert.rejects(list(), /forbidden/);
  await q("delete from auth.sessions where id=$1", [session]);
  await assert.rejects(read(stored.id), /forbidden/);
  await q("insert into auth.sessions(id,user_id,not_after) values($1,$2,null)", [session, user]);
  assert.equal((await read(stored.id)).requestId, stored.id);
  pass(
    "Missing/malformed/foreign/anonymous/expired/deleted sessions rejected; real matching nonexpired session required",
  );
  const mutations = {
    id: id(),
    owner_user_id: other,
    idempotency_key: id(),
    correlation_id: id(),
    questionnaire_snapshot: { ...full.questionnaire, age: 80 },
    display_name: "CHANGED",
    email: "changed@synthetic.invalid",
    telegram_username: "changed_user",
    event_slug: "changed-event",
    created_at: "2000-01-01T00:00:00Z",
    consent_version: "old",
    consent_at: "2000-01-01T00:00:00Z",
    consent_method: "other",
  };
  for (const [field, value] of Object.entries(mutations))
    await assert.rejects(
      q(`update public.membership_requests set ${field}=$1 where id=$2`, [
        field === "questionnaire_snapshot" ? JSON.stringify(value) : value,
        stored.id,
      ]),
      /immutable/,
    );
  await assert.rejects(
    q(
      "update public.membership_requests set owner_user_id=null,questionnaire_snapshot=null,idempotency_key=null,correlation_id=null where id=$1",
      [stored.id],
    ),
    /immutable/,
  );
  await assert.rejects(
    q(
      "update public.membership_requests set owner_user_id=$1,questionnaire_snapshot=$2,idempotency_key=$3,correlation_id=$4,consent_version=$5,consent_at=now(),consent_method=$6 where id=$7",
      [
        user,
        JSON.stringify(full.questionnaire),
        id(),
        id(),
        "draft-2026-09",
        "web_form_checkbox",
        legacy,
      ],
    ),
    /legacy_link_forbidden/,
  );
  for (const field of ["invited_user_id", "current_invite_id"])
    await assert.rejects(
      q(`update public.membership_requests set ${field}=$1 where id=$2`, [other, stored.id]),
      /membership_requests_(questionnaire_shape|invite_shape|current_invite_id_fkey)/,
    );
  pass(
    "Immutable original request/owner/snapshot/key/correlation/consent enforced; legacy linking and invitation fields blocked",
  );
  // Give a separate synthetic staff account exactly the baseline prerequisites, then verify rollback at the owned-row guard.
  await q(
    "insert into private.member_admission(user_id,state,source) values($1,'admitted','synthetic-test')",
    [staff],
  );
  await q("insert into public.staff_assignments(user_id,role) values($1,'owner')", [staff]);
  // PGlite lacks pgcrypto; use deterministic synthetic bytes only to reach the invitation constraint, never a service.
  await db.exec(
    "create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('01',n),'hex')$$;",
  );
  await as(staff, staffSession, { aal: "aal2" });
  const beforeLegacyApprove = await counts();
  await assert.rejects(
    q("select private.membership_decide($1,'approved')", [stored.id]),
    /membership_requests_questionnaire_shape/,
  );
  assert.deepEqual(await counts(), beforeLegacyApprove);
  assert.equal(
    await scalar("select status from public.membership_requests where id=$1", [stored.id]),
    "pending",
  );
  pass(
    "Legacy invitation-producing approval aborts atomically with no status/invite/audit/outbox side effects",
  );
  // Inject an audit failure; request, snapshot and consent must roll back together.
  const rollbackUser = id(),
    rollbackSession = id();
  await makeUser(rollbackUser, rollbackSession);
  await as(rollbackUser, rollbackSession);
  await db.exec(
    "create function private.synthetic_reject_audit() returns trigger language plpgsql as $$begin if new.action='membership_questionnaire.submitted' then raise exception 'synthetic_audit_failure'; end if;return new;end$$;create trigger synthetic_reject_audit before insert on private.audit_log for each row execute function private.synthetic_reject_audit();",
  );
  const beforeFail = await counts();
  await assert.rejects(submit(command()), /synthetic_audit_failure/);
  assert.deepEqual(await counts(), beforeFail);
  assert.deepEqual(await list(), []);
  await db.exec(
    "drop trigger synthetic_reject_audit on private.audit_log; drop function private.synthetic_reject_audit();",
  );
  pass(
    "Forced audit failure rolls back request, entire questionnaire and consent without partial persistence",
  );
  await as();
  const rejectOwn = async () =>
    q(
      "update public.membership_requests set status='rejected',reviewed_by=$1,reviewed_at=now(),updated_at=now() where owner_user_id=$1 and status='pending'",
      [user],
    );
  await rejectOwn();
  assert.equal((await read(stored.id)).status, "rejected");
  for (let i = 1; i < 30; i++) {
    const c = command();
    const r = await submit(c);
    assert.equal(r.ok, true);
    await rejectOwn();
  }
  const beforeLimit = await counts();
  assert.deepEqual(await submit(command()), { ok: false, reason: "unavailable" });
  assert.deepEqual(await counts(), beforeLimit);
  const limitedReplay = await submit(full);
  assert.equal(limitedReplay.outcome, "replay");
  assert.equal(limitedReplay.receipt.correlationId, created.receipt.correlationId);
  assert.equal(limitedReplay.receipt.status, "rejected");
  assert.equal((await list()).length, 30);
  pass(
    "Moderation status remains readable; 30/hour new-write limit is owner-scoped and never blocks a valid replay",
  );
  const foreignReplayBefore = await counts();
  await as(other, otherSession);
  assert.equal((await submit(full)).outcome, "replay");
  assert.deepEqual(await counts(), foreignReplayBefore);
  await as();
  // PGlite serializes submissions. This is repeated-queued idempotency evidence, NOT real connection contention.
  const queued = await Promise.all(Array.from({ length: 8 }, () => submit(full)));
  assert.ok(queued.every((x) => x.outcome === "replay" && x.receipt.requestId === stored.id));
  assert.deepEqual(await counts(), foreignReplayBefore);
  pass(
    "Eight queued same-key retries preserve one request/correlation and no extra audit (not multi-session concurrency proof)",
  );
  const indexes = await q(
    "select indexname,indexdef from pg_indexes where schemaname='public' and tablename='membership_requests' order by indexname",
  );
  const evidence = {
    scope: "OFFLINE SYNTHETIC PGLITE ONLY",
    baselineHash: hash(baseline),
    idExtensionHash: hash(extension),
    proposalHash: hash(proposal),
    testsHash: hash(await readFile(fileURLToPath(import.meta.url), "utf8")),
    results,
    invalidCases,
    indexes,
    limitations: [
      "No live DDL/grants/Auth/records/network calls",
      "PGlite test identity stub is not GoTrue/JWT verification",
      "No PostgREST/request-scoped transport/UI/browser E2E",
      "Queued requests are not multi-session contention; real PostgreSQL concurrent same/different key tests remain before activation",
      "No authority to apply this proposal or expose API roles",
      "Draft consent/age and Telegram-first identity policy remain separate activation decisions",
    ],
  };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(
    `ALL PASS: ${results.length} groups; ${invalidCases} invalid commands; offline only.`,
  );
} finally {
  await db.close();
  await rm(temporary, { recursive: true, force: true });
}
