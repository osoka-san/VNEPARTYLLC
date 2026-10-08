import test from "node:test";
import assert from "node:assert/strict";
import guard, { TEST_PROJECT, TEST_ORIGIN, TEST_SUPABASE } from "../../day07-stand/guard.mjs";
import { TEST_ACCOUNT_IDS } from "../../day07-stand/session.mjs";
import { QR_TEST_ACCOUNT_IDS } from "../../src/lib/admission/test-accounts.ts";
import { PRESENTATION_PATHS, DIAGNOSTICS_PATH } from "../config.mjs";
const admin = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6";
const env = {
  VNE_QR_TEST_ACCOUNT_IDS: QR_TEST_ACCOUNT_IDS.join(","),
  VNE_QR_ADMISSION: "test-explicit-v2",
  VNE_TEST_VARIANT: "qr-admission-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_INCIDENTS_MODE: "test",
  VNE_TEST_ADMIN_MFA: "enabled",
  VNE_TEST_SCANNER_MFA: "enabled",
};
let userId = null,
  calls = 0,
  identities = 0;
const worker = guard(
  {
    async fetch(r) {
      calls++;
      assert.equal(r.headers.get("x-vne-admin"), null);
      return new Response("synthetic");
    },
  },
  {
    projectId: TEST_PROJECT,
    functions: { "/_serverFn/admin": { name: "getAdminMfaState", method: "GET" } },
    assets: ["/assets/app.js", "/media/approved.avif"],
    unified: true,
  },
  async () => {
    identities++;
    return {
      allowed: TEST_ACCOUNT_IDS.includes(userId),
      userId,
      cookies: ["session=refreshed; Secure"],
      requestCookie: "session=fresh",
    };
  },
);
env.ASSETS = {
  fetch: async (request) =>
    new Response("synthetic", {
      headers: {
        "content-type": new URL(request.url).pathname.endsWith(".avif")
          ? "image/avif"
          : "text/javascript",
      },
    }),
};
const get = (path, init = {}, overrides = {}) =>
  worker.fetch(new Request(TEST_ORIGIN + path, init), { ...env, ...overrides }, {});
test("all presentation documents require one of the six existing verified TEST identities", async () => {
  for (const id of [null, "outsider", ...TEST_ACCOUNT_IDS]) {
    userId = id;
    for (const path of PRESENTATION_PATHS) {
      const r = await get(path);
      assert.equal(r.status, TEST_ACCOUNT_IDS.includes(id) ? 200 : 303, `${id} ${path}`);
      assert.equal(r.headers.get("cache-control"), "private, no-store");
      if (!TEST_ACCOUNT_IDS.includes(id)) assert.equal(r.headers.get("location"), "/login");
    }
  }
});
test("diagnostics document + SPA authorization read accept exact ADMIN_TEST only", async () => {
  for (const id of [null, "outsider", ...TEST_ACCOUNT_IDS]) {
    userId = id;
    assert.equal(
      (await get(DIAGNOSTICS_PATH)).status,
      id === admin ? 200 : TEST_ACCOUNT_IDS.includes(id) ? 403 : 303,
    );
    assert.equal(
      (await get("/_serverFn/admin")).status,
      id === admin ? 200 : TEST_ACCOUNT_IDS.includes(id) ? 403 : 401,
    );
  }
});
test("new surfaces are GET/HEAD only, exact paths, no additional backend or query shortcuts", async () => {
  userId = admin;
  for (const path of [...PRESENTATION_PATHS, DIAGNOSTICS_PATH])
    assert.equal(
      (await get(path, { method: "POST", headers: { origin: TEST_ORIGIN } })).status,
      404,
      path,
    );
  for (const path of [
    "/admin/diagnostics?admin=true",
    "/events/unknown",
    "/api/preview-defaults",
    "/api/site-admin",
    "/_serverFn/getMediaOverrides",
    "/assets/not-emitted.js",
    "/media/private.json",
    "/preview-login",
  ])
    assert.equal((await get(path)).status, 404, path);
  assert.equal((await get(DIAGNOSTICS_PATH, { headers: { "x-vne-admin": "true" } })).status, 200);
  assert.equal((await get(DIAGNOSTICS_PATH, {}, { VNE_DELIVERY_MODE: "live" })).status, 503);
});
test("assets and login remain readable without authentication; no invented business rights", async () => {
  userId = null;
  const before = identities;
  for (const p of ["/login", "/assets/app.js", "/media/approved.avif"])
    assert.equal((await get(p)).status, 200);
  assert.equal(identities, before);
  userId = TEST_ACCOUNT_IDS[0];
  assert.equal((await get("/admin")).status, 200);
  assert.equal((await get("/admin/violations")).status, 403);
  assert.equal((await get("/scan")).status, 403);
});

test("unlisted static GET/HEAD never reach Auth or SSR and HEAD is empty", async () => {
  const before = { calls, identities };
  for (const method of ["GET", "HEAD"])
    for (const path of [
      "/assets/index.html",
      "/assets/missing.js",
      "/media/missing.avif",
      "/fonts/index.html",
      "/loading/missing.js",
    ]) {
      const response = await get(path, { method });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.equal(await response.text(), method === "HEAD" ? "" : "Asset not found");
    }
  assert.deepEqual({ calls, identities }, before);
});
