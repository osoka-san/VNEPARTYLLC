// Exercise the installed browser serializer, never hand-written JSON headers/body.
// No network, credentials, real sessions or real MFA changes.
import assert from "node:assert/strict";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { serverFnFetcher } from "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import guard, { TEST_ORIGIN, TEST_SUPABASE, TEST_PROJECT } from "../test-stand/guard.mjs";
import { emptyActionInput } from "../src/lib/auth/empty-action-input.ts";
const admin = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6";
const scanner = "1e7259c2-ad13-43a1-b34b-cba71533e844";
const env = {
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_TEST_VARIANT: "questionnaire-only",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_TEST_ADMIN_MFA: "enabled",
  VNE_TEST_SCANNER_MFA: "enabled",
};
let userId = admin,
  dispatched = 0;
const functions = Object.fromEntries(
  ["beginAdminMfaEnrollment", "beginScannerMfaEnrollment", "signOut"].map((name) => [
    "/_serverFn/" + name,
    { name, method: "POST" },
  ]),
);
const worker = guard(
  {
    fetch: async () => {
      dispatched++;
      return Response.json({ result: { ok: true } });
    },
  },
  { projectId: TEST_PROJECT, functions, assets: [] },
  async () => ({ allowed: !!userId, userId, cookies: [] }),
);
async function send(name, data, origin = TEST_ORIGIN, crossSite = false) {
  let observed;
  try {
    await runWithStartContext({ startOptions: {} }, () =>
      serverFnFetcher(
        TEST_ORIGIN + "/_serverFn/" + name,
        [{ method: "POST", data }],
        async (url, init) => {
          const headers = new Headers(init.headers);
          observed = { contentType: headers.get("content-type"), bytes: init.body?.length ?? 0 };
          headers.set("origin", origin);
          headers.set("sec-fetch-site", crossSite ? "cross-site" : "same-origin");
          const response = await worker.fetch(new Request(url, { ...init, headers }), env, {});
          observed.status = response.status;
          return response;
        },
      ),
    );
  } catch (error) {
    if (!observed || observed.status === 200) throw error;
  }
  return observed;
}
for (const name of Object.values(functions).map((x) => x.name)) {
  userId = name.includes("Scanner") ? scanner : admin;
  const before = dispatched;
  assert.deepEqual(await send(name, undefined), { contentType: null, bytes: 0, status: 415 });
  assert.equal(dispatched, before, "old no-argument request fails before dispatch");
  const fixed = await send(name, {});
  assert.equal(fixed.contentType, "application/json");
  assert.ok(fixed.bytes > 0);
  assert.equal(fixed.status, 200);
  assert.equal(dispatched, before + 1);
  for (const [origin, crossSite] of [
    ["https://untrusted.invalid", false],
    [TEST_ORIGIN, true],
  ]) {
    assert.equal((await send(name, {}, origin, crossSite)).status, 403);
    assert.equal(dispatched, before + 1);
  }
  userId = null;
  assert.equal((await send(name, {})).status, 401);
  assert.equal(dispatched, before + 1);
}
for (const [path, user] of [
  ["/admin/mfa", scanner],
  ["/scanner/mfa", admin],
]) {
  userId = user;
  const before = dispatched;
  const response = await worker.fetch(new Request(TEST_ORIGIN + path), env, {});
  assert.equal(response.status, 403);
  assert.equal(dispatched, before);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(await response.text(), new RegExp("/login\\?next=" + path));
}
for (const input of [undefined, null, [], { unexpected: true }, "", 1])
  assert.throws(() => emptyActionInput(input));
assert.deepEqual(emptyActionInput({}), {});
console.log(
  JSON.stringify({
    status: "PASS",
    oldBrowserWire415: true,
    explicitEmptyObjectProducesJSON: true,
    csrfAndIdentityGuardsUnchanged: true,
    accountSwitch403Preserved: true,
    network: "none",
  }),
);
