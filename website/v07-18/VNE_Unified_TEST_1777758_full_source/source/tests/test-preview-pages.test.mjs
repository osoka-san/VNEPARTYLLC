import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPreviewPages, PREVIEW_PATHS } from "../scripts/test-preview-pages.mjs";
import guard, { TEST_PROJECT, TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
const { pages: previews, sources } = await buildPreviewPages();
const config = JSON.parse(await readFile(".sites-runtime/test-allowlist.json", "utf8"));
const env = {
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_TEST_VARIANT: "questionnaire-only",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_public_key",
  VNE_TEST_ADMIN_MFA: "enabled",
  VNE_TEST_SCANNER_MFA: "enabled",
};
let dispatches = 0,
  verifications = 0;
const app = guard(
  {
    fetch: async () => {
      dispatches++;
      return new Response("backend");
    },
  },
  { ...config, previews },
  async () => {
    verifications++;
    return { allowed: false, cookies: [] };
  },
);
const request = (path, options = {}) =>
  app.fetch(new Request(TEST_ORIGIN + path, options), env, {});
test("exactly four review routes, three frozen self-contained sources", () => {
  assert.deepEqual(Object.keys(previews).sort(), [...PREVIEW_PATHS].sort());
  assert.equal(Object.keys(sources).length, 3);
  for (const p of Object.values(previews)) {
    assert.match(p, /width=device-width/);
    assert.doesNotMatch(p, /sourceMappingURL/);
  }
});
test("public GET and HEAD return HTML without backend or session inspection", async () => {
  for (const path of PREVIEW_PATHS) {
    const r = await request(path, {
      headers: { cookie: "real-session=must-not-read", authorization: "Bearer not-used" },
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.match(r.headers.get("content-security-policy"), /connect-src 'none'/);
    assert.equal((await request(path, { method: "HEAD" })).status, 200);
    assert.equal(await (await request(path, { method: "HEAD" })).text(), "");
  }
  assert.equal(dispatches, 0);
  assert.equal(verifications, 0);
});
test("prototype frame has opaque origin, no pop-up/top-navigation/storage permission; form navigation denied by CSP", () => {
  for (const path of PREVIEW_PATHS.filter((p) => p != "/preview")) {
    const html = previews[path];
    assert.equal((html.match(/<iframe /g) || []).length, 1);
    assert.match(html, /sandbox="allow-scripts allow-forms"/);
    assert.doesNotMatch(html, /allow-same-origin|allow-popups|allow-top-navigation/);
    assert.match(html, /srcdoc=/);
    assert.match(html, /DEMO · вымышленные данные/);
    assert.match(html, /connect-src 'none'/);
  }
});
test("preview POST, unknown files, queries and path tricks never dispatch", async () => {
  for (const path of PREVIEW_PATHS) {
    assert.equal((await request(path, { method: "POST", body: "{}" })).status, 405);
    assert.equal((await request(path + "?token=example")).status, 404);
  }
  for (const path of [
    "/preview/unknown",
    "/preview/menu.html",
    "/preview/pass/source.map",
    "/preview/%6denu",
  ])
    assert.equal((await request(path)).status, 404);
  assert.equal(dispatches, 0);
  assert.equal(verifications, 0);
});
test("real membership and MFA routes still require account/session, backend untouched", async () => {
  for (const path of ["/apply", "/member", "/admin/mfa", "/scanner/mfa"]) {
    const r = await request(path);
    assert.equal(r.status, 303);
    assert.match(r.headers.get("location"), /^\/login/);
  }
  assert.equal(dispatches, 0);
  assert.equal(verifications, 4);
  assert.equal(Object.keys(config.functions).length, 14);
});
test("invalid preview manifest cannot expand runtime route exposure", () => {
  assert.throws(
    () =>
      guard(
        {},
        { projectId: TEST_PROJECT, functions: {}, assets: [], previews: { "/admin": "bad" } },
      ),
    /Invalid TEST preview page/,
  );
});
