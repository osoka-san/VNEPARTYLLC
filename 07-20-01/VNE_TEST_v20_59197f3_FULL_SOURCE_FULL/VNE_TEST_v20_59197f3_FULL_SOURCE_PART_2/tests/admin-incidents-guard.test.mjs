import { test } from "node:test";
import assert from "node:assert/strict";
import guard, { TEST_PROJECT, TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
const ADMIN = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6",
  GUEST = "2b321688-f5fe-4099-9de2-f316bf07c3d3";
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
const functions = { "/_serverFn/incidents": { name: "incidentAction", method: "POST" } };
function setup(id = ADMIN) {
  let count = 0;
  const worker = guard(
    {
      fetch: async () => {
        count++;
        return new Response("MOCK ONLY");
      },
    },
    { projectId: TEST_PROJECT, functions, assets: [], previews: {} },
    async () => ({ allowed: !!id, userId: id, cookies: [] }),
  );
  return { worker, count: () => count };
}
function request(path, method = "GET", origin = TEST_ORIGIN) {
  return new Request(TEST_ORIGIN + path, {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
}
test("two pages and one transport remain default-off before network/worker dispatch", async () => {
  for (const path of ["/admin/violations", "/admin/intakes", "/_serverFn/incidents"]) {
    const s = setup();
    assert.equal(
      (
        await s.worker.fetch(
          request(path, path.includes("_serverFn") ? "POST" : "GET"),
          { ...env, VNE_INCIDENTS_MODE: undefined },
          {},
        )
      ).status,
      404,
    );
    assert.equal(s.count(), 0);
  }
});
test("only exact ADMIN_TEST may reach proposed pages/transport in this TEST rollout", async () => {
  for (const id of [ADMIN, GUEST, "00000000-0000-4000-8000-000000000001", null]) {
    const s = setup(id);
    assert.equal(
      (await s.worker.fetch(request("/admin/intakes"), env, {})).status,
      id === ADMIN ? 200 : id === null ? 303 : 403,
    );
    assert.equal(
      (await s.worker.fetch(request("/_serverFn/incidents", "POST"), env, {})).status,
      id === ADMIN ? 200 : id === null ? 401 : 403,
    );
  }
});
test("new transport requires POST and same origin and has no-cache/no-frame response", async () => {
  const s = setup();
  assert.equal((await s.worker.fetch(request("/_serverFn/incidents"), env, {})).status, 405);
  assert.equal(
    (
      await s.worker.fetch(
        request("/_serverFn/incidents", "POST", "https://foreign.invalid"),
        env,
        {},
      )
    ).status,
    403,
  );
  const r = await s.worker.fetch(request("/_serverFn/incidents", "POST"), env, {});
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
});
test("no CMS/team/payment/scanner-write surface enabled", async () => {
  const s = setup();
  for (const p of [
    "/admin",
    "/admin/users",
    "/admin/payments",
    "/api/site-admin/accounts",
    "/scanner/redeem",
  ])
    assert.equal((await s.worker.fetch(request(p), env, {})).status, 404);
});
