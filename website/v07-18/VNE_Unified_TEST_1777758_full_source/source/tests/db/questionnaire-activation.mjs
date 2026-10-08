/** OFFLINE ONLY: verifies the separate, unapplied access-expansion proposal. */
import { PGlite } from "@electric-sql/pglite";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID as id, createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const base = process.env.VNE_R2_BASELINE_DIR || "/workspace/shared/vne-id-migration/candidate";
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => Object.values((await q(s, p))[0])[0];
const hash = (s) => createHash("sha256").update(s).digest("hex");
const results = [];
const pass = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const persistence = await readFile(
  join(root, "docs/backend-r2/membership_questionnaire_proposal.sql"),
  "utf8",
);
const activation = await readFile(
  join(root, "docs/backend-r2/membership_questionnaire_activation_proposal.sql"),
  "utf8",
);
try {
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
  await db.exec(persistence);
  assert.equal(
    await one(
      "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vne_submit_membership_questionnaire','vne_read_my_membership_questionnaires')",
    ),
    0,
  );
  // The activation also has atomic DDL/ACL rollback and fails on owner drift.
  await db.exec(activation.replace(/commit;\s*$/, "rollback;"));
  assert.equal(
    await one(
      "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vne_submit_membership_questionnaire','vne_read_my_membership_questionnaires')",
    ),
    0,
  );
  await db.exec(
    "begin;alter function private.membership_questionnaire_list_own() owner to service_role;",
  );
  await assert.rejects(db.exec(activation.replace(/^begin;$/m, "")), /activation_owner_mismatch/);
  await db.exec("rollback;");
  pass("Separate activation DDL/ACL rolls back completely and trusted-owner drift fails closed");
  await db.exec(activation);
  const metadata = await q(
    `select p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vne_submit_membership_questionnaire','vne_read_my_membership_questionnaires') order by p.proname`,
  );
  const owner = await one(
    "select pg_get_userbyid(relowner) from pg_class where oid='public.membership_requests'::regclass",
  );
  assert.equal(metadata.length, 2);
  assert.ok(
    metadata.every(
      (p) => p.prosecdef && p.proconfig.includes('search_path=""') && p.owner === owner,
    ),
  );
  const acl = await q(
    `select r.rolname,p.proname,has_function_privilege(r.oid,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='public' and p.proname in ('vne_submit_membership_questionnaire','vne_read_my_membership_questionnaires') and r.rolname in ('anon','authenticated','service_role') order by r.rolname,p.proname`,
  );
  assert.ok(acl.every((x) => x.allowed === (x.rolname === "authenticated")));
  assert.equal(
    await one(
      `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public' and p.proname in ('vne_submit_membership_questionnaire','vne_read_my_membership_questionnaires') and a.grantee=0 and a.privilege_type='EXECUTE'`,
    ),
    0,
  );
  assert.equal(
    await one(
      `select count(*)::int from pg_roles r where r.rolname in ('anon','authenticated','service_role') and (has_schema_privilege(r.oid,'private','USAGE') or has_table_privilege(r.oid,'public.membership_requests','SELECT,INSERT,UPDATE,DELETE'))`,
    ),
    0,
  );
  assert.equal(
    await one(
      `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='private' and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'EXECUTE')`,
    ),
    0,
  );
  pass(
    "Only exact two public wrappers grant authenticated EXECUTE; no PUBLIC/anon/service-role/private/table access",
  );
  pass("Both wrappers use trusted matching owner, SECURITY DEFINER and empty search_path");
  const user = id(),
    other = id(),
    session = id(),
    otherSession = id();
  for (const [u, s] of [
    [user, session],
    [other, otherSession],
  ]) {
    await q("insert into auth.users(id,email) values($1,$2)", [u, u + "@synthetic.invalid"]);
    await q(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",
      [s, u],
    );
  }
  const def = await one("select private.r2_questionnaire_definition()");
  const command = {
    idempotencyKey: id(),
    intake: {
      displayName: "SYNTHETIC",
      email: "contact@synthetic.invalid",
      telegramUsername: "synthetic_user",
      eventSlug: null,
    },
    questionnaire: {
      version: 3,
      questions: def.questions.map((x) => ({
        id: x.id,
        label: x.question,
        answers: [{ text: x.options[0], source: "choice" }],
      })),
      ratings: def.ratings.map((x) => ({
        id: x.id,
        label: x.question,
        minLabel: x.minLabel,
        maxLabel: x.maxLabel,
        value: 50,
      })),
      age: 29,
    },
    consentVersion: "draft-2026-09",
  };
  const claims = async (u = user, s = session, extra = {}) =>
    q("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: u, session_id: s, role: "authenticated", aal: "aal1", ...extra }),
    ]);
  const submit = async (c = command) =>
    one("select public.vne_submit_membership_questionnaire($1::jsonb)", [JSON.stringify(c)]);
  const read = async (request = null) =>
    one("select public.vne_read_my_membership_questionnaires($1)", [request]);
  await claims();
  await db.exec("set role authenticated");
  await assert.rejects(q("select * from public.membership_requests"), /permission denied/);
  await assert.rejects(
    q("select private.membership_questionnaire_list_own()"),
    /permission denied/,
  );
  await assert.rejects(
    q("select private.membership_questionnaire_submit($1::jsonb)", [JSON.stringify(command)]),
    /permission denied/,
  );
  await assert.rejects(
    q("update public.membership_requests set status='approved'"),
    /permission denied/,
  );
  const created = await submit();
  assert.equal(created.ok, true);
  assert.equal(created.receipt.ownerUserId, user);
  assert.deepEqual(await read(), [created.receipt]);
  assert.deepEqual(await read(created.receipt.requestId), [created.receipt]);
  assert.deepEqual(await read(id()), []);
  assert.deepEqual(await one("select public.vne_read_my_membership_questionnaires()"), [
    created.receipt,
  ]);
  const replay = await submit();
  assert.equal(replay.outcome, "replay");
  assert.deepEqual(replay.receipt, created.receipt);
  const changed = structuredClone(command);
  changed.questionnaire.age = 30;
  assert.deepEqual(await submit(changed), { ok: false, reason: "conflict" });
  pass(
    "Actual authenticated role can submit/replay and read receipt arrays while direct table/private access stays denied",
  );
  await claims(other, otherSession);
  assert.deepEqual(await read(created.receipt.requestId), []);
  assert.deepEqual(await read(), []);
  const theirs = await submit();
  assert.equal(theirs.receipt.ownerUserId, other);
  assert.notEqual(theirs.receipt.requestId, created.receipt.requestId);
  assert.deepEqual(await read(), [theirs.receipt]);
  pass(
    "Public read wrapper returns [] for foreign/missing requests and only own singleton/list receipts",
  );
  for (const role of ["anon", "service_role"]) {
    await db.exec("reset role");
    await claims();
    await db.exec("set role " + role);
    await assert.rejects(submit(), /permission denied/);
    await assert.rejects(read(), /permission denied/);
  }
  await db.exec("reset role");
  await db.exec("set role authenticated");
  await q("select set_config('request.jwt.claims','{}',false)");
  await assert.rejects(submit(), /forbidden/);
  await assert.rejects(read(), /forbidden/);
  await claims(user, id());
  await assert.rejects(submit(), /forbidden/);
  await assert.rejects(read(), /forbidden/);
  await claims(user, otherSession);
  await assert.rejects(submit(), /forbidden/);
  await assert.rejects(read(), /forbidden/);
  await claims(user, session, { role: "service_role" });
  await assert.rejects(submit(), /forbidden/);
  await assert.rejects(read(), /forbidden/);
  await claims(user, session, { is_anonymous: true });
  await assert.rejects(submit(), /forbidden/);
  await assert.rejects(read(), /forbidden/);
  await db.exec("reset role");
  await q("delete from auth.sessions where id=$1", [session]);
  await claims();
  await db.exec("set role authenticated");
  await assert.rejects(submit(), /forbidden/);
  await assert.rejects(read(), /forbidden/);
  pass(
    "Anon/service-role execution denied; authenticated missing/foreign/deleted/anonymous session or wrong claim role forbidden",
  );
  await db.exec("reset role");
  const counts = (
    await q(
      `select (select count(*)::int from public.membership_requests) requests,(select count(*)::int from private.audit_log) audits,(select count(*)::int from private.outbox) outbox,(select count(*)::int from public.invites) invites,(select count(*)::int from private.member_admission) admission,(select count(*)::int from public.applications) applications`,
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
  pass(
    "Public wrappers preserve atomic zero-side-effect intake boundary and sanitized receipt projection",
  );
  const evidence = {
    scope: "OFFLINE SYNTHETIC ACCESS-EXPANSION PROPOSAL ONLY; NO APPLY AUTHORIZED",
    persistenceHash: hash(persistence),
    activationHash: hash(activation),
    testsHash: hash(await readFile(fileURLToPath(import.meta.url), "utf8")),
    results,
    metadata,
    acl,
    counts,
    limitations: [
      "Not real Auth JWT or PostgREST gateway testing",
      "No live DDL, grants, Auth changes, accounts or records",
      "No independent PostgreSQL transaction concurrency test",
      "Explicit separate approval and live gates required before applying either proposal",
    ],
  };
  await writeFile(
    process.env.VNE_R2_ACTIVATION_EVIDENCE_PATH ||
      join(root, "docs/backend-r2/evidence/questionnaire-activation.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(`ALL PASS: ${results.length} groups; offline activation proposal only.`);
} finally {
  await db.close();
}
