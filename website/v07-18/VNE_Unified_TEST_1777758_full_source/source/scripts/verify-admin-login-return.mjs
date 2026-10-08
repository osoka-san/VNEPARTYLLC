// No network or real sessions: validate actual compiled login expressions and guard outcomes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import guard, { TEST_PROJECT, TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
const { code } = await transform(await readFile("test-stand/routes/login.tsx", "utf8"), {
  loader: "tsx",
});
const validateExpression = code.match(/validateSearch: ([\s\S]*?),\n\s*component:/)?.[1];
assert.ok(validateExpression);
const validate = runInNewContext("(" + validateExpression + ")");
const redirectExpression = code.match(/redirect: ([^\n]+)\n/)?.[1];
assert.ok(redirectExpression);
const destination = (email, next) =>
  runInNewContext(redirectExpression, { next, form: { get: () => email } });
const paths = ["/admin/mfa", "/scanner/mfa", "/admin/violations", "/admin/intakes"];
for (const target of paths) {
  assert.equal(validate({ next: target }).next, target);
  assert.equal(destination("ADMIN_TEST", validate({ next: target }).next), target);
  assert.equal(destination("synthetic@example.invalid", target), target);
}
for (const next of [
  undefined,
  null,
  [],
  ["/admin/intakes"],
  {},
  "/admin",
  "/member",
  "/admin/intakes/",
  "/admin/intakes?x=1",
  "//evil.invalid",
  "https://evil.invalid",
  "/admin/../admin/intakes",
  "/admin%2Fintakes",
  "/admin/intakes\n",
]) {
  assert.equal(Object.keys(validate({ next })).length, 0, "invalid next rejected");
  assert.equal(destination("ADMIN_TEST", validate({ next }).next), "/admin/mfa");
}
assert.equal(destination("synthetic@example.invalid", undefined), "/apply");
const ADMIN = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6",
  SCANNER = "1e7259c2-ad13-43a1-b34b-cba71533e844";
const env = {
  VNE_TEST_VARIANT: "questionnaire-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_INCIDENTS_MODE: "test",
};
for (const target of ["/admin/violations", "/admin/intakes"])
  for (const userId of [null, SCANNER, ADMIN]) {
    let dispatched = 0;
    const w = guard(
      {
        fetch: async () => {
          dispatched++;
          return new Response("synthetic");
        },
      },
      {
        projectId: TEST_PROJECT,
        functions: { "/_serverFn/action": { name: "incidentAction", method: "POST" } },
        assets: [],
      },
      async () => ({ allowed: !!userId, userId, cookies: [] }),
    );
    const r = await w.fetch(
      new Request(TEST_ORIGIN + target, { headers: { "sec-fetch-site": "cross-site" } }),
      env,
      {},
    );
    assert.equal(r.status, userId === ADMIN ? 200 : userId ? 403 : 303);
    if (!userId) assert.equal(r.headers.get("location"), "/login?next=" + target);
    if (userId === SCANNER) {
      const html = await r.text();
      assert.ok(html.includes("ADMIN_TEST"));
      assert.ok(html.includes("/login?next=" + target));
      assert.ok(html.includes("Сменить аккаунт"));
    }
    assert.equal(dispatched, userId === ADMIN ? 1 : 0);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    const api = await w.fetch(
      new Request(TEST_ORIGIN + "/_serverFn/action", {
        method: "POST",
        headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
        body: "{}",
      }),
      env,
      {},
    );
    assert.equal(api.status, userId === ADMIN ? 200 : userId ? 403 : 401);
    if (userId !== ADMIN)
      assert.equal(
        await api.text(),
        "TEST access unavailable",
        "API does not become an HTML/account redirect",
      );
  }
console.log(
  JSON.stringify({
    status: "PASS",
    exactFourReturnPaths: true,
    invalidArraysAndExternalURLsRejected: true,
    adminAliasPreservesExplicitTarget: true,
    sameUuid403AndApiBoundaries: true,
    network: "none",
  }),
);
