import { test } from "node:test";
import assert from "node:assert/strict";
import guard, { TEST_ORIGIN, TEST_SUPABASE, TEST_PROJECT } from "../../test-stand/guard.mjs";
const SCANNER_A = "1e7259c2-ad13-43a1-b34b-cba71533e844",
  SCANNER_B = "ed2433cb-bc6e-4b23-aa57-000839292ec4",
  MEMBER = "15cbc7a4-92f6-48d8-abb2-ed68f7612271",
  ADMIN = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6",
  GUEST = "2b321688-f5fe-4099-9de2-f316bf07c3d3",
  QA = "996a7a9c-04fc-43f2-9251-7d5a8dd9a92b";
const functions = {
  "/_serverFn/state": { name: "getScannerMfaState", method: "GET" },
  "/_serverFn/enroll": { name: "beginScannerMfaEnrollment", method: "POST" },
  "/_serverFn/verify": { name: "completeScannerMfaChallenge", method: "POST" },
};
const env = {
  VNE_TEST_VARIANT: "questionnaire-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_TEST_SCANNER_MFA: "enabled",
};
function run(userId = SCANNER_A) {
  let calls = 0;
  const worker = guard(
    {
      async fetch() {
        calls++;
        return new Response("SYNTHETIC", { headers: { "Referrer-Policy": "no-referrer" } });
      },
    },
    { projectId: TEST_PROJECT, functions, assets: [] },
    async () => ({ allowed: !!userId, userId, cookies: [] }),
  );
  return { worker, getCalls: () => calls };
}
const req = (path, method = "GET", origin = TEST_ORIGIN) =>
  new Request(TEST_ORIGIN + path, {
    method,
    headers: method === "POST" ? { origin, "Content-Type": "application/json" } : {},
    ...(method === "POST" ? { body: "{}" } : {}),
  });
test("only the exact two scanners reaches setup page and MFA methods", async () => {
  for (const user of [SCANNER_A, SCANNER_B, ADMIN, GUEST, QA, MEMBER, null]) {
    const { worker } = run(user);
    const r = await worker.fetch(req("/scanner/mfa"), env, {});
    assert.equal(r.status, [SCANNER_A, SCANNER_B].includes(user) ? 200 : user ? 403 : 303);
  }
});
test("MFA route is default-off", async () => {
  const { worker, getCalls } = run();
  const r = await worker.fetch(
    req("/scanner/mfa"),
    { ...env, VNE_TEST_SCANNER_MFA: undefined },
    {},
  );
  assert.equal(r.status, 404);
  assert.equal(getCalls(), 0);
});
test("same-origin POST required for enrollment", async () => {
  for (const user of [SCANNER_A, SCANNER_B, ADMIN, GUEST, QA, MEMBER]) {
    const { worker } = run(user);
    assert.equal(
      (await worker.fetch(req("/_serverFn/enroll", "POST"), env, {})).status,
      [SCANNER_A, SCANNER_B].includes(user) ? 200 : 403,
    );
    assert.equal(
      (await worker.fetch(req("/_serverFn/enroll", "POST", "https://untrusted.invalid"), env, {}))
        .status,
      403,
    );
  }
});
test("no role/admin/data route is enabled by MFA bootstrap", async () => {
  const { worker } = run();
  for (const path of [
    "/admin",
    "/admin/violations",
    "/admin/intakes",
    "/auth/reset",
    "/api/site-admin/accounts",
  ])
    assert.equal((await worker.fetch(req(path), env, {})).status, 404);
});
test("guest own questionnaire route remains accessible", async () => {
  for (const user of [GUEST, ADMIN, QA]) {
    const { worker } = run(user);
    assert.equal((await worker.fetch(req("/apply"), env, {})).status, 200);
  }
});
test("MFA response stays no-store/no-referrer", async () => {
  const { worker } = run();
  const r = await worker.fetch(req("/_serverFn/state"), env, {});
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
});

test("third QA account cannot invoke any MFA method", async () => {
  const { worker, getCalls } = run(QA);
  for (const [path, fn] of Object.entries(functions))
    assert.equal((await worker.fetch(req(path, fn.method), env, {})).status, 403);
  assert.equal(getCalls(), 0);
});
