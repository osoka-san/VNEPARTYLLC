// Entirely offline: compiled Worker + exact synthetic Auth responses, no live server calls.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNT_IDS } from "../../day07-stand/session.mjs";
import { QR_TEST_ACCOUNT_IDS } from "../../src/lib/admission/test-accounts.ts";
import { PRESENTATION_PATHS, DIAGNOSTICS_PATH } from "../config.mjs";
const origin = "https://vne-test-20261007.can-avci48.chatgpt.site";
const supabase = "https://xrocuwlofxhxoxajukne.supabase.co";
const admin = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6";
const env = {
  VNE_QR_TEST_ACCOUNT_IDS: QR_TEST_ACCOUNT_IDS.join(","),
  VNE_QR_ADMISSION: "test-explicit-v2",
  VNE_TEST_VARIANT: "qr-admission-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: origin,
  VNE_SUPABASE_URL: supabase,
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_INCIDENTS_MODE: "test",
  VNE_TEST_ADMIN_MFA: "enabled",
  VNE_TEST_SCANNER_MFA: "enabled",
};
Object.assign(process.env, env);
let identity = admin,
  backend = [];
const user = () => ({
  id: identity,
  is_anonymous: false,
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic@example.invalid",
  factors: [],
});
const session = () => ({
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: identity, exp: 4102444800, role: "authenticated", aal: "aal1" }),
    ).toString("base64url"),
    "c3ludGhldGlj",
  ].join("."),
  refresh_token: "synthetic-refresh-not-valid",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: user(),
});
const cookie = () =>
  "sb-xrocuwlofxhxoxajukne-auth-token=base64-" +
  Buffer.from(JSON.stringify(session())).toString("base64url");
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  backend.push(u.pathname);
  assert.equal(u.origin, supabase, "No third-party contact allowed");
  if (u.pathname === "/auth/v1/user") return Response.json(user());
  if (u.pathname === "/rest/v1/rpc/vne_read_my_membership_questionnaires") return Response.json([]);
  throw new Error("Unplanned synthetic backend path");
};
const { default: worker } = await import("../../dist/server/index.js");
const allow = JSON.parse(await readFile(".sites-runtime/day07-allowlist.json", "utf8"));
assert.equal(allow.unified, true);
assert.equal(Object.keys(allow.functions).length, 18);
const request = (path, authenticated = true) =>
  worker.fetch(
    new Request(origin + path, {
      headers: {
        ...(authenticated ? { cookie: cookie() } : {}),
        ...(path.startsWith("/_serverFn/")
          ? { "x-tsr-serverFn": "true", origin, "sec-fetch-site": "same-origin" }
          : {}),
      },
    }),
    env,
    { waitUntil() {} },
  );
const results = [];
const asset = allow.assets.find((p) => p.endsWith(".avif"));
for (const method of ["GET", "HEAD"]) {
  for (const [ASSETS, expected] of [
    [undefined, 503],
    [
      {
        fetch: async () =>
          new Response("<html>SSR fallback</html>", {
            headers: { "Content-Type": "text/html", "Set-Cookie": "secret=discard" },
          }),
      },
      404,
    ],
  ]) {
    const response = await worker.fetch(
      new Request(origin + asset, { method }),
      { ...env, ASSETS },
      { waitUntil() {} },
    );
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!(await response.text()).includes("<html>"));
  }
}
const availabilityPath = Object.entries(allow.functions).find(
  ([, f]) => f.name === "getQuestionnaireAvailability",
)[0];
assert.equal(
  (await request(availabilityPath, false)).status,
  401,
  "SPA gate endpoint must never be public",
);
for (const account of TEST_ACCOUNT_IDS) {
  identity = account;
  assert.equal(
    (await request(availabilityPath)).status,
    200,
    "Every existing TEST identity can revalidate",
  );
}
identity = "00000000-0000-4000-8000-000000000000";
assert.equal((await request(availabilityPath)).status, 401, "Unlisted identity cannot revalidate");
identity = admin;
for (const path of PRESENTATION_PATHS) {
  const response = await request(path, false);
  assert.equal(response.status, 303, path);
  assert.equal(response.headers.get("location"), "/login");
}
for (const path of PRESENTATION_PATHS) {
  let response = await request(path);
  if (path === "/events/") {
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/events");
    response = await request("/events");
  }
  const html = await response.text();
  assert.equal(response.status, 200, path);
  assert.ok(!html.includes("В этом превью раздел отключён"));
  assert.ok(!html.includes("getMediaOverrides"));
  assert.ok(!html.includes("getPublishedSections"));
  assert.match(html, /Unified TEST/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(html, /Onest-Variable-core\.woff2/);
  results.push({ path, status: response.status, bytes: html.length });
}
assert.ok(
  backend.every((p) => p === "/auth/v1/user"),
  "Presentation pages must not call application RPCs",
);
for (const id of TEST_ACCOUNT_IDS) {
  identity = id;
  const response = await request(DIAGNOSTICS_PATH);
  const html = await response.text();
  assert.equal(response.status, id === admin ? 200 : 403, id);
  assert.equal(html.includes("Журнал событий"), id === admin, id);
  assert.ok(!html.includes("synthetic-refresh-not-valid"));
  results.push({
    surface: "diagnostics",
    accountScope: id === admin ? "ADMIN_TEST" : "other TEST",
    status: response.status,
  });
}
identity = admin;
for (const [path, needle] of [
  ["/login", "Вход в TEST"],
  ["/apply", "Анкета"],
  ["/member", "Мой статус"],
  ["/admin", "Управление TEST"],
  ["/admin/mfa", "Защита входа ADMIN_TEST"],
]) {
  const response = await request(path);
  const html = await response.text();
  assert.equal(response.status, 200, path);
  assert.ok(html.includes(needle), path);
  assert.ok(!html.includes("В этом превью раздел отключён"));
  results.push({ path, status: response.status });
}
assert.ok(
  backend.every((p) =>
    ["/auth/v1/user", "/rest/v1/rpc/vne_read_my_membership_questionnaires"].includes(p),
  ),
  JSON.stringify(backend),
);
for (const path of [
  "/missing",
  "/assets/missing.js",
  "/api/preview-defaults",
  "/admin/diagnostics?test=true",
])
  assert.equal((await request(path)).status, 404, path);
console.log(
  JSON.stringify(
    {
      status: "PASS",
      scope: "compiled offline Worker SSR and auth gates; synthetic Auth; no live QR",
      functionCount: Object.keys(allow.functions).length,
      backend: "mocked identity GET and membership read only; no QR/mutation",
      results,
    },
    null,
    2,
  ),
);
