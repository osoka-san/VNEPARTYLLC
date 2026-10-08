/** Synthetic offline PostgreSQL-compatible checks. No Supabase endpoint or real Auth is contacted. */
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID as id, createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(new URL("../..", import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), "vne-draft-db-"));
const base = process.env.VNE_R2_BASELINE_DIR || "/workspace/shared/vne-id-migration/candidate";
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => Object.values((await q(s, p))[0])[0];
const results = [];
const pass = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const hash = (s) => createHash("sha256").update(s).digest("hex");
const proposal = await readFile(
  join(root, "docs/questionnaire-drafts/draft_storage_closed_proposal.sql"),
  "utf8",
);
const activation = await readFile(
  join(root, "docs/questionnaire-drafts/draft_activation_separate_approval.sql"),
  "utf8",
);
try {
  const output = await build({
    entryPoints: [join(root, "src/lib/questionnaire-draft.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  await writeFile(join(temp, "contract.mjs"), output.outputFiles[0].text);
  const { emptyDraftPayload, parseDraftPayload } = await import(
    pathToFileURL(join(temp, "contract.mjs"))
  );
  await db.exec(
    (await readFile(join(root, "tests/db/supabase-stub.sql"), "utf8")).replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    ),
  );
  await db.exec(
    "alter table auth.users add column email_confirmed_at timestamptz,add column raw_user_meta_data jsonb default '{}';",
  );
  await db.exec(
    "begin;" + (await readFile(join(base, "restricted_test_baseline.sql"), "utf8")) + "commit;",
  );
  await db.exec(
    "begin;" + (await readFile(join(base, "id_trace_extension.sql"), "utf8")) + "commit;",
  );
  await db.exec(
    await readFile(join(root, "docs/backend-r2/membership_questionnaire_proposal.sql"), "utf8"),
  );
  await db.exec(
    await readFile(
      join(root, "docs/backend-r2/membership_questionnaire_activation_proposal.sql"),
      "utf8",
    ),
  );
  await db.exec(proposal.replace(/commit;\s*$/, "rollback;"));
  assert.equal(await one("select to_regclass('private.questionnaire_drafts')"), null);
  pass("Closed DDL fully rolls back; no table or draft access remains");
  await db.exec(proposal);
  const closed = await q(
    "select rolname,has_table_privilege(oid,'private.questionnaire_drafts','SELECT,INSERT,UPDATE,DELETE') allowed from pg_roles where rolname in ('anon','authenticated','service_role')",
  );
  assert.ok(closed.every((r) => !r.allowed));
  assert.equal(
    await one(
      "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='private' and p.proname like '%questionnaire_draft%' and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'EXECUTE')",
    ),
    0,
  );
  assert.equal(
    await one(
      "select relrowsecurity from pg_class where oid='private.questionnaire_drafts'::regclass",
    ),
    true,
  );
  pass(
    "New table has RLS; closed functions/table grant no PUBLIC, anon, authenticated or service-role access",
  );
  await db.exec(activation.replace(/commit;\s*$/, "rollback;"));
  assert.equal(
    await one("select to_regprocedure('public.vne_read_my_questionnaire_draft()')"),
    null,
  );
  assert.equal(
    await one(
      "select has_function_privilege('authenticated','public.vne_submit_membership_questionnaire(jsonb)','EXECUTE')",
    ),
    true,
  );
  const stage = await readFile(
    join(root, "docs/questionnaire-drafts/draft_activation_stage.sql"),
    "utf8",
  );
  const cutover = await readFile(
    join(root, "docs/questionnaire-drafts/draft_activation_cutover.sql"),
    "utf8",
  );
  await db.exec(stage);
  assert.equal(
    await one(
      "select has_function_privilege('authenticated','public.vne_submit_membership_questionnaire(jsonb)','EXECUTE')",
    ),
    true,
  );
  await db.exec(cutover);
  assert.equal(
    await one(
      "select has_function_privilege('authenticated','public.vne_submit_membership_questionnaire(jsonb)','EXECUTE')",
    ),
    false,
  );
  const acl = await q(
    "select r.rolname,p.proname,has_function_privilege(r.oid,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='public' and p.proname in ('vne_read_my_questionnaire_draft','vne_save_my_questionnaire_draft','vne_submit_membership_questionnaire_with_draft') and r.rolname in ('anon','authenticated','service_role')",
  );
  assert.equal(acl.length, 9);
  assert.ok(acl.every((r) => r.allowed === (r.rolname === "authenticated")));
  pass(
    "Separate activation rolls back safely; only three exact owner-checked wrappers gain authenticated EXECUTE, old submit bypass is retired",
  );
  const user = id(),
    other = id(),
    session = id(),
    otherSession = id();
  for (const [u, s] of [
    [user, session],
    [other, otherSession],
  ]) {
    await q("insert into auth.users(id,email) values($1,$2)", [u, "synthetic@invalid.test"]);
    await q(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",
      [s, u],
    );
  }
  const claims = async (u = user, s = session, extra = {}) =>
    q("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: u, session_id: s, role: "authenticated", ...extra }),
    ]);
  const payload = emptyDraftPayload();
  payload.name = "SYNTHETIC";
  payload.contact = "unfinished@";
  payload.questionnaire.answers.interests.useCustom = true;
  payload.questionnaire.answers.interests.custom = "ещё не законченный ответ из семи слов";
  payload.questionnaire.answers.interests.manual = ["Свой", ""];
  payload.questionnaire.ratings.social_energy = 67;
  payload.resumeSection = "contact";
  const command = {
    expectedOwnerUserId: user,
    creationIssuedAt: new Date().toISOString(),
    id: id(),
    expectedVersion: 0,
    mutationId: id(),
    payload,
  };
  const save = async (c = command) =>
    one("select public.vne_save_my_questionnaire_draft($1::jsonb)", [JSON.stringify(c)]);
  const read = async () => one("select public.vne_read_my_questionnaire_draft()");
  const cases = [payload, emptyDraftPayload()];
  for (const mutate of [
    (p) => (p.questionnaire.mode = null),
    (p) => (p.resumeSection = null),
    (p) => (p.questionnaire.age = 0),
    (p) => (p.questionnaire.age = 101),
    (p) => (p.questionnaire.age = "67"),
    (p) => (p.questionnaire.age = 6.7),
    (p) => (p.name = "🦋".repeat(41)),
    (p) => (p.questionnaire.answers.interests.custom = "🦋".repeat(61)),
    (p) => (p.questionnaire.answers.interests.selected = ["Музыка и звук", "Музыка и звук"]),
    (p) => (p.questionnaire.answers.interests.selected = ["unknown"]),
    (p) => (p.questionnaire.ratings.extra = 10),
    (p) => (p.ownerUserId = other),
    (p) => (p.consent = true),
    (p) => (p.questionnaire.answers.interests.custom = "a\u0001"),
    (p) => (p.event = "invalid?private"),
    (p) => (p.questionnaire.answers.interests.manual = ["", "", "", ""]),
  ]) {
    const v = structuredClone(payload);
    mutate(v);
    cases.push(v);
  }
  for (const p of cases)
    assert.equal(
      await one("select private.questionnaire_draft_payload_valid($1::jsonb)", [JSON.stringify(p)]),
      parseDraftPayload(p) !== null,
    );
  pass(
    "SQL/TypeScript validators agree on partial input, both modes, missing fields and 16 malformed/oversized/foreign-key mutations",
  );
  await claims();
  await db.exec("set role authenticated");
  assert.deepEqual((({ creationIssuedAt, ...rest }) => rest)(await read()), {
    ownerUserId: user,
    draft: null,
    submitted: false,
  });
  await assert.rejects(q("select * from private.questionnaire_drafts"), /permission denied/);
  await assert.rejects(q("select private.questionnaire_draft_read()"), /permission denied/);
  await assert.rejects(
    q("select public.vne_submit_membership_questionnaire('{}'::jsonb)"),
    /permission denied/,
  );
  const first = await save();
  assert.equal(first.ok, true);
  assert.deepEqual(first.draft.payload, payload);
  assert.equal(first.draft.version, 1);
  assert.equal(Date.parse(first.draft.expiresAt) - Date.parse(first.draft.savedAt), 67 * 86400000);
  assert.deepEqual((await read()).draft, first.draft);
  assert.deepEqual(await save(), first);
  assert.deepEqual((await read()).draft, first.draft);
  pass(
    "Authenticated owner saves incomplete draft; reload round-trips both modes/progress; TTL exactly 67×24h; reads/replays do not renew expiry",
  );
  const changed = {
    ...command,
    expectedVersion: 1,
    mutationId: id(),
    payload: { ...payload, name: "DEVICE TWO" },
  };
  const second = await save(changed);
  assert.equal(second.draft.version, 2);
  assert.deepEqual(
    await save({ ...changed, mutationId: id(), payload: { ...payload, name: "STALE" } }),
    { ok: false, reason: "conflict" },
  );
  assert.deepEqual(await save(command), { ok: false, reason: "conflict" });
  assert.deepEqual((await read()).draft, second.draft);
  assert.deepEqual(await save({ ...command, id: id() }), { ok: false, reason: "conflict" });
  pass(
    "Old saves/retries and competing new drafts cannot replace a newer version; one draft per owner",
  );
  await claims(other, otherSession);
  assert.deepEqual((({ creationIssuedAt, ...rest }) => rest)(await read()), {
    ownerUserId: other,
    draft: null,
    submitted: false,
  });
  assert.deepEqual(await save(command), { ok: false, reason: "session_changed" });
  const otherCommand = { ...command, expectedOwnerUserId: other, id: id(), mutationId: id() };
  const otherDraft = await save(otherCommand);
  assert.equal(otherDraft.ownerUserId, other);
  await claims();
  assert.equal((await read()).draft.payload.name, "DEVICE TWO");
  pass(
    "Ownership comes from verified session; foreign accounts cannot read or write another account's draft, including session switch in flight",
  );
  const def = await (async () => {
    await db.exec("reset role");
    const d = await one("select private.r2_questionnaire_definition()");
    await db.exec("set role authenticated");
    return d;
  })();
  const submission = {
    idempotencyKey: command.id,
    intake: {
      displayName: "SYNTHETIC",
      email: "synthetic@invalid.test",
      telegramUsername: "synthetic_user",
      eventSlug: null,
    },
    questionnaire: {
      version: 3,
      questions: def.questions.map((d) => ({
        id: d.id,
        label: d.question,
        answers: [{ text: d.options[0], source: "choice" }],
      })),
      ratings: def.ratings.map((d) => ({
        id: d.id,
        label: d.question,
        minLabel: d.minLabel,
        maxLabel: d.maxLabel,
        value: 67,
      })),
      age: 29,
    },
    consentVersion: "draft-2026-09",
  };
  const submit = async (reference = { id: command.id, version: 2 }, c = submission) =>
    one("select public.vne_submit_membership_questionnaire_with_draft($1::jsonb,$2::jsonb)", [
      JSON.stringify(c),
      JSON.stringify(reference),
    ]);
  assert.deepEqual(await submit({ id: command.id, version: 1 }), { ok: false, reason: "conflict" });
  const invalid = structuredClone(submission);
  invalid.questionnaire.questions = [];
  await assert.rejects(submit(undefined, invalid), /invalid_draft_submission/);
  assert.equal((await read()).draft.version, 2);
  pass(
    "Submission still requires full final questionnaire/consent and exact draft version; failures leave draft intact",
  );
  await db.exec("reset role");
  await db.exec(
    "create function private.synthetic_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_audit_failure'; end $$;create trigger synthetic_audit_failure before insert on private.audit_log for each row execute function private.synthetic_audit_failure();",
  );
  await db.exec("set role authenticated");
  await assert.rejects(submit(), /synthetic_audit_failure/);
  assert.equal((await read()).draft.version, 2);
  await db.exec("reset role");
  assert.equal(await one("select count(*)::int from public.membership_requests"), 0);
  await db.exec(
    "drop trigger synthetic_audit_failure on private.audit_log;drop function private.synthetic_audit_failure();set role authenticated;",
  );
  const submitted = await submit();
  assert.equal(submitted.ok, true);
  assert.equal(submitted.outcome, "created");
  assert.deepEqual((({ creationIssuedAt, ...rest }) => rest)(await read()), {
    ownerUserId: user,
    draft: null,
    submitted: true,
  });
  const replay = await submit();
  assert.equal(replay.outcome, "replay");
  assert.deepEqual(replay.receipt, submitted.receipt);
  assert.deepEqual(await save({ ...changed, expectedVersion: 2, mutationId: id() }), {
    ok: false,
    reason: "submitted",
  });
  assert.deepEqual(await save({ ...command, id: id(), mutationId: id() }), {
    ok: false,
    reason: "submitted",
  });
  await db.exec("reset role");
  assert.equal(
    await one("select count(*)::int from private.questionnaire_drafts where owner_user_id=$1", [
      user,
    ]),
    0,
  );
  assert.equal(await one("select count(*)::int from public.membership_requests"), 1);
  assert.equal(await one("select count(*)::int from private.audit_log"), 1);
  assert.equal(await one("select count(*)::int from private.outbox"), 0);
  pass(
    "Forced audit failure rolls back submission and deletion; success atomically clears draft; replay keeps same request/correlation; late saves cannot resurrect",
  );
  await q(
    "update private.questionnaire_drafts set saved_at=statement_timestamp()-interval '1608 hours',expires_at=statement_timestamp() where owner_user_id=$1",
    [other],
  );
  await claims(other, otherSession);
  await db.exec("set role authenticated");
  assert.equal((await read()).draft, null);
  assert.deepEqual(await save({ ...otherCommand, expectedVersion: 1, mutationId: id() }), {
    ok: false,
    reason: "expired",
  });
  await db.exec("reset role");
  assert.equal(
    await one("select to_regprocedure('private.purge_expired_questionnaire_drafts(integer)')"),
    null,
  );
  assert.equal(
    await one("select count(*)::int from private.questionnaire_drafts where owner_user_id=$1", [
      other,
    ]),
    1,
  );
  const retainedPayload = await one(
    "select payload from private.questionnaire_drafts where owner_user_id=$1 and id=$2",
    [other, otherCommand.id],
  );
  await db.exec("set role authenticated");
  const fresh = await save({ ...otherCommand, id: id(), mutationId: id() });
  assert.equal(fresh.ok, true);
  for (let i = 0; i < 3; i++) assert.deepEqual((await read()).draft, fresh.draft);
  await db.exec("reset role");
  assert.equal(
    await one("select count(*)::int from private.questionnaire_drafts where owner_user_id=$1", [
      other,
    ]),
    2,
  );
  assert.equal(
    await one(
      "select count(*)::int from private.questionnaire_drafts where owner_user_id=$1 and is_current",
      [other],
    ),
    1,
  );
  assert.deepEqual(
    await one(
      "select payload from private.questionnaire_drafts where owner_user_id=$1 and id=$2 and not is_current",
      [other, otherCommand.id],
    ),
    retainedPayload,
  );
  await db.exec("set role authenticated");
  pass(
    "Expiry hides data without deletion; explicit new save retains old expired row, creates only one current row, and repeated views create nothing",
  );
  for (const extra of [
    { role: "anon" },
    { is_anonymous: true },
    { session_id: id() },
    { session_id: session },
    { sub: id() },
  ]) {
    await claims(other, otherSession, extra);
    await assert.rejects(read(), /forbidden/);
    await assert.rejects(save(otherCommand), /forbidden/);
  }
  for (const role of ["anon", "service_role"]) {
    await db.exec("reset role");
    await claims();
    await db.exec("set role " + role);
    await assert.rejects(read(), /permission denied/);
  }
  await db.exec("reset role");
  await q("delete from auth.sessions where id=$1", [otherSession]);
  await claims(other, otherSession);
  await db.exec("set role authenticated");
  await assert.rejects(read(), /forbidden/);
  pass("Missing/foreign/revoked/anonymous sessions and anon/service-role execution fail closed");
  await db.exec("reset role");
  const replacementSession = id();
  await q("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')", [
    replacementSession,
    other,
  ]);
  await claims(other, replacementSession);
  await db.exec("set role authenticated");
  assert.deepEqual((await read()).draft, fresh.draft);
  pass("A new valid session for the same account resumes the saved draft without renewing expiry");
  const otherSubmitted = await submit(
    { id: fresh.draft.id, version: fresh.draft.version },
    { ...submission, idempotencyKey: fresh.draft.id },
  );
  assert.equal(otherSubmitted.ok, true);
  await db.exec("reset role");
  assert.equal(
    await one("select count(*)::int from private.questionnaire_drafts where owner_user_id=$1", [
      other,
    ]),
    1,
  );
  assert.deepEqual(
    await one("select payload from private.questionnaire_drafts where owner_user_id=$1 and id=$2", [
      other,
      otherCommand.id,
    ]),
    retainedPayload,
  );
  pass(
    "Successful submission deletes only its current draft; retained expired rows are not physically removed",
  );
  await db.exec("reset role");
  const counts = (
    await q(
      "select (select count(*)::int from public.membership_requests) requests,(select count(*)::int from private.audit_log) audits,(select count(*)::int from private.outbox) outbox,(select count(*)::int from public.invites) invites,(select count(*)::int from private.member_admission) admission,(select count(*)::int from public.applications) applications",
    )
  )[0];
  assert.deepEqual(counts, {
    requests: 2,
    audits: 2,
    outbox: 0,
    invites: 0,
    admission: 0,
    applications: 0,
  });
  const daily = await readFile(
    join(root, "docs/questionnaire-drafts/draft_daily_purge.sql"),
    "utf8",
  );
  // The real extension/daemon is unavailable in PGlite. Stub only its registration API;
  // execute the exact production purge function and ACL SQL with real table rows.
  const cronStub = `create schema cron;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,username text default current_user,active boolean default true);
    create function cron.schedule(_name text,_schedule text,_command text) returns bigint language plpgsql as $stub$
    declare result bigint;begin insert into cron.job(jobname,schedule,command) values(_name,_schedule,_command) returning jobid into result;return result;end $stub$;`;
  await db.exec(daily.replace("create extension pg_cron with schema pg_catalog;", cronStub));
  const jobs = await q("select jobname,schedule,command,username,active from cron.job");
  assert.deepEqual(jobs, [
    {
      jobname: "vne-questionnaire-drafts-expiry-daily",
      schedule: "0 3 * * *",
      command: "SELECT private.purge_expired_questionnaire_drafts(1000);",
      username: "postgres",
      active: true,
    },
  ]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(await one("select has_schema_privilege($1,'cron','USAGE')", [role]), false);
    assert.equal(
      await one(
        "select has_function_privilege($1,'private.purge_expired_questionnaire_drafts(integer)','EXECUTE')",
        [role],
      ),
      false,
    );
  }
  // Existing expired row contains only synthetic data and is due for the approved purge.
  assert.equal(await one("select private.purge_expired_questionnaire_drafts(1000)"), 1);
  assert.equal(await one("select private.purge_expired_questionnaire_drafts(1000)"), 0);
  assert.equal(await one("select count(*)::int from public.membership_requests"), 2);
  pass(
    "Daily 03:00 UTC job registration/ACL SQL passes with offline cron stub; exact purge deletes expired draft only and is idempotent",
  );
  // Model an original first-create intent from 68 days ago (unchanged payload/id/mutation).
  // After physical row deletion it must not regain a new 67-day lifetime.
  const retryOwner = id(),
    retrySession = id();
  await q("insert into auth.users(id,email) values($1,'synthetic-retry@invalid.test')", [
    retryOwner,
  ]);
  await q("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')", [
    retrySession,
    retryOwner,
  ]);
  const oldIntent = {
    ...command,
    expectedOwnerUserId: retryOwner,
    id: id(),
    mutationId: id(),
    creationIssuedAt: new Date(Date.now() - 68 * 86400000).toISOString(),
  };
  await claims(retryOwner, retrySession);
  await db.exec("set role authenticated");
  assert.deepEqual(await save(oldIntent), { ok: false, reason: "expired" });
  const newIntent = {
    ...oldIntent,
    id: id(),
    mutationId: id(),
    creationIssuedAt: (await read()).creationIssuedAt,
  };
  const activeDraft = await save(newIntent);
  assert.equal(activeDraft.ok, true);
  await db.exec("reset role");
  assert.equal(await one("select private.purge_expired_questionnaire_drafts(1000)"), 0);
  assert.equal(
    await one("select count(*)::int from private.questionnaire_drafts where owner_user_id=$1", [
      retryOwner,
    ]),
    1,
  );
  pass(
    "A purged/absent draft cannot be resurrected by stale first-create issuance; explicit fresh issuance saves and unexpired drafts survive purge",
  );
  await writeFile(
    join(root, "docs/questionnaire-drafts/evidence/offline-db.json"),
    JSON.stringify(
      {
        type: "offline-synthetic-only",
        testedAt: new Date().toISOString(),
        base: "c0ad4b246f7b5a38887c63f0a06caed986cef5ff",
        proposalSha256: hash(proposal),
        activationSha256: hash(activation),
        tests: results,
        counts,
        limitations: [
          "PGlite is single-session; real multi-connection PostgreSQL race tests not run",
          "Auth/JWT, PostgREST and live project ACLs are not verified",
          "Nothing applied to a remote database",
          "Cron registration uses an offline stub; real extension/daemon remains an activation check",
        ],
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await db.close();
  await rm(temp, { recursive: true, force: true });
}
