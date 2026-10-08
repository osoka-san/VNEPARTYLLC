import { toJSON } from "seroval";
import assert from "node:assert/strict";
import guard, { TEST_PROJECT, TEST_ORIGIN, TEST_SUPABASE } from "../../day07-stand/guard.mjs";
import { TEST_ACCOUNT_IDS } from "../../day07-stand/session.mjs";
import { QR_TEST_ACCOUNT_IDS } from "../../src/lib/admission/test-accounts.ts";
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
const functions = Object.fromEntries(
  [
    ["read", "qrAdmissionRead", "GET"],
    ["command", "qrAdmissionCommand", "POST"],
    ["available", "getQrAdmissionAvailability", "GET"],
    ["login", "signIn", "POST"],
    ["logout", "signOut", "POST"],
    ["scanner", "getScannerMfaState", "GET"],
    ["admin", "getAdminMfaState", "GET"],
    ["incidents", "incidentAction", "POST"],
  ].map(([path, name, method]) => ["/_serverFn/" + path, { name, method }]),
);
let userId = QR_TEST_ACCOUNT_IDS[0],
  allowed = true,
  calls = [],
  sessionCalls = 0;
const worker = guard(
  {
    async fetch(request) {
      calls.push(request);
      return new Response("synthetic", { headers: { "Set-Cookie": "session=logout; Max-Age=0" } });
    },
  },
  {
    projectId: TEST_PROJECT,
    functions,
    assets: ["/assets/app.js"],
    previews: Object.fromEntries(
      ["/preview", "/preview/menu", "/preview/pass", "/preview/violations"].map((path) => [
        path,
        "<html>SYNTHETIC</html>",
      ]),
    ),
  },
  async () => {
    sessionCalls++;
    return {
      allowed,
      userId,
      cookies: ["session=refreshed; Secure"],
      requestCookie: "session=fresh",
    };
  },
);
const id = "11111111-1111-4111-8111-111111111111";
async function run(path, options = {}, overrides = {}) {
  return worker.fetch(
    new Request(TEST_ORIGIN + path, options),
    { ...env, ...overrides },
    { waitUntil() {} },
  );
}
const post = {
  method: "POST",
  headers: {
    origin: TEST_ORIGIN,
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
  },
  body: JSON.stringify(toJSON({ data: { action: "catalog" } })),
};
for (const key of Object.keys(env).filter((k) => !k.includes("_MFA") && k !== "VNE_INCIDENTS_MODE"))
  assert.equal((await run("/login", {}, { [key]: "wrong" })).status, 503, key);
assert.equal(TEST_ACCOUNT_IDS.length, 6);
for (const id of TEST_ACCOUNT_IDS) {
  userId = id;
  assert.equal((await run("/member")).status, 200);
  assert.equal((await run("/_serverFn/read")).status, QR_TEST_ACCOUNT_IDS.includes(id) ? 200 : 403);
}
for (const account of TEST_ACCOUNT_IDS) {
  userId = account;
  for (const [path, options] of [
    ["/admin/violations", {}],
    ["/admin/intakes", {}],
    ["/_serverFn/incidents", post],
  ]) {
    assert.equal(
      (await run(path, options)).status,
      account === "02e03845-bc0d-4a9b-8500-87bb1f11ccf6" ? 200 : 403,
    );
    assert.equal((await run(path, options, { VNE_INCIDENTS_MODE: "disabled" })).status, 404);
  }
}
userId = QR_TEST_ACCOUNT_IDS[0];
assert.equal((await run("/_serverFn/command")).status, 405);
assert.equal((await run("/_serverFn/read", post)).status, 405);
for (const path of [
  "/_serverFn/read?token=hidden",
  "/_serverFn/read?payload=one&payload=two",
  "/_serverFn/command?event=hidden",
  "/_serverFn/read?payload=VNE2%253Ahidden",
])
  assert.equal((await run(path, path.includes("command") ? post : {})).status, 400);
assert.equal(
  (
    await run("/_serverFn/command", {
      ...post,
      headers: { ...post.headers, origin: "https://evil.invalid" },
    })
  ).status,
  403,
);
assert.equal(
  (
    await run("/_serverFn/command", {
      ...post,
      headers: { ...post.headers, "sec-fetch-site": "cross-site" },
    })
  ).status,
  403,
);
assert.equal(
  (await run("/_serverFn/command", { ...post, headers: { origin: TEST_ORIGIN } })).status,
  415,
);
assert.equal((await run("/_serverFn/command", { ...post, body: "x".repeat(8193) })).status, 413);
assert.equal(
  (await run("/_serverFn/command", { ...post, body: post.body.padEnd(8192, " ") })).status,
  200,
);
assert.equal(
  (
    await run("/_serverFn/command", {
      ...post,
      headers: { ...post.headers, "content-length": "99999" },
    })
  ).status,
  413,
);
for (const body of [
  "VNE2:synthetic-malformed",
  JSON.stringify("VNE2:synthetic-malformed"),
  "{}",
  JSON.stringify(toJSON("VNE2:synthetic-malformed")),
])
  assert.equal((await run("/_serverFn/command", { ...post, body })).status, 400);
for (const envelope of [
  Object.freeze({ data: { action: "catalog" } }),
  Object.seal({ data: { action: "catalog" } }),
  Object.preventExtensions({ data: { action: "catalog" } }),
  { data: { action: "catalog" }, context: Object.freeze({}) },
]) {
  const raw = JSON.stringify(toJSON(envelope));
  assert.equal((await run("/_serverFn/command", { ...post, body: raw })).status, 400);
  assert.equal((await run("/_serverFn/read?payload=" + encodeURIComponent(raw))).status, 400);
}
const result = await run("/_serverFn/command", {
  ...post,
  headers: {
    ...post.headers,
    authorization: "Bearer untrusted",
    "x-vne-role": "owner",
    "oai-authenticated-user-id": "fake",
    "x-forwarded-host": "evil.invalid",
  },
});
assert.equal(result.status, 200);
const forwarded = calls.at(-1);
for (const header of [
  "authorization",
  "x-vne-role",
  "oai-authenticated-user-id",
  "x-forwarded-host",
])
  assert.equal(forwarded.headers.get(header), null);
assert.equal(forwarded.headers.get("cookie"), "session=fresh");
assert.equal(result.headers.get("cache-control"), "private, no-store");
assert.equal(result.headers.get("referrer-policy"), "no-referrer");
assert.equal(result.headers.get("x-frame-options"), "DENY");
assert.match(result.headers.get("set-cookie"), /session=logout/);
assert.ok(!result.headers.get("set-cookie").includes("refreshed"));
for (const page of ["/member/pass", "/member/qr"]) {
  assert.equal((await run(page + "?event=" + id + "&participation=" + id)).status, 200);
  for (const query of [
    "",
    "?event=" + id,
    "?event=" + id + "&participation=" + id + "&token=secret",
    "?event=" + id + "&event=" + id + "&participation=" + id,
    "?event=VNE2:secret&participation=" + id,
    "?event=" + id.toUpperCase() + "&participation=not-a-uuid",
  ])
    assert.equal((await run(page + query)).status, 404);
}
assert.equal((await run("/scan?qa=timed")).status, 200);
for (const query of ["?qa=timed&qa=timed", "?qa=other", "?token=VNE2:abc"])
  assert.equal((await run("/scan" + query)).status, 404);
for (const path of [
  "/rest/v1",
  "/mcp",
  "/api/site-admin",
  "/_serverFn/unknown",
  "/i/unknown",
  "/i/https://evil.invalid",
  "/i/vne?url=https://evil.invalid",
  "/i/VNE1:old",
])
  assert.equal((await run(path)).status, 404, path);
const before = calls.length,
  checks = sessionCalls;
for (const path of ["/preview", "/preview/menu", "/preview/pass", "/preview/violations"]) {
  const r = await run(path);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /connect-src 'none'/);
  assert.equal((await run(path + "?token=anything")).status, 404);
  assert.equal((await run(path, post)).status, 405);
}
const redirect = await run("/i/vne");
assert.equal(redirect.status, 302);
assert.equal(redirect.headers.get("location"), "/");
assert.equal(calls.length, before);
assert.equal(sessionCalls, checks);
allowed = false;
assert.equal((await run("/member")).status, 303);
assert.equal((await run("/_serverFn/read")).status, 401);
console.log(
  "PASS Day07 guard: six logins, three QR identities, methods/CSRF/8192 limit, header stripping, cookie precedence, safe URLs, four isolated previews, closed campaign redirect",
);
