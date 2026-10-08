import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import guard, { TEST_PROJECT, TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
const config = JSON.parse(
  await readFile(new URL("../.sites-runtime/test-allowlist.json", import.meta.url), "utf8"),
);
const env = {
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_TEST_VARIANT: "questionnaire-only",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_public_key",
};
const auth = { cookie: "synthetic-session=allowed" };
let calls = 0,
  checks = 0,
  last;
const app = guard(
  {
    fetch: async (req) => {
      calls++;
      last = req;
      return new Response("allowed", { headers: { "Set-Cookie": "original=1; Secure; HttpOnly" } });
    },
  },
  config,
  async (req) => {
    checks++;
    const allowed = req.headers.get("cookie") === "synthetic-session=allowed";
    // This generic fixture exercises all currently published endpoints, including self-MFA.
    return {
      allowed,
      userId: allowed ? "02e03845-bc0d-4a9b-8500-87bb1f11ccf6" : null,
      cookies: [],
    };
  },
);
async function request(
  path,
  options = {},
  runtime = { ...env, VNE_TEST_ADMIN_MFA: "enabled", VNE_TEST_SCANNER_MFA: "enabled" },
) {
  return app.fetch(new Request(TEST_ORIGIN + path, options), runtime, {});
}
const postHeaders = { origin: TEST_ORIGIN, "content-type": "application/json" };
test("only login, root, minimal assets and login functions public", async () => {
  for (const p of ["/", "/login", config.assets[0]]) assert.equal((await request(p)).status, 200);
  for (const [p, f] of Object.entries(config.functions)) {
    const r = await request(p, {
      method: f.method,
      headers: postHeaders,
      ...(f.method === "POST" ? { body: "{}" } : {}),
    });
    assert.equal(r.status, ["getAuthAvailability", "signIn"].includes(f.name) ? 200 : 401, f.name);
  }
  for (const p of ["/apply", "/member"]) {
    const before = calls;
    const r = await request(p);
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("Location"), "/login");
    assert.equal(calls, before);
  }
});
test("valid verified synthetic session reaches exact pages/functions", async () => {
  for (const p of ["/apply", "/member"])
    assert.equal((await request(p, { headers: auth })).status, 200);
  for (const [p, f] of Object.entries(config.functions))
    assert.equal(
      (
        await request(p, {
          method: f.method,
          headers: { ...auth, ...postHeaders },
          ...(f.method === "POST" ? { body: "{}" } : {}),
        })
      ).status,
      f.name.includes("ScannerMfa") ? 403 : 200,
      f.name,
    );
});
test("unknown routes/functions/wrong methods never dispatch or verify session", async () => {
  for (const p of [
    "/admin",
    "/admin-login",
    "/scan",
    "/pass",
    "/api/site-admin/accounts",
    "/auth/recover",
    "/_serverFn/unknown",
    "/member/account",
    "/apply/",
    "/%61dmin",
    "/assets/nope.js",
    "/_headers",
  ]) {
    const before = calls,
      verified = checks;
    assert.equal((await request(p, { headers: auth })).status, 404, p);
    assert.equal(calls, before);
    assert.equal(checks, verified);
  }
  for (const [p, f] of Object.entries(config.functions))
    assert.equal(
      (await request(p, { method: f.method === "GET" ? "POST" : "GET", headers: auth })).status,
      405,
    );
});
test("forged platform/legacy identity and wrong session cannot replace verified account", async () => {
  for (const headers of [
    { "oai-authenticated-user-id": "owner" },
    { "OAI-Sites-Authorization": "Bearer service" },
    { "x-vne-site-admin-access": "allowed", "x-vne-site-preview": "true" },
    { cookie: "synthetic-session=other" },
  ]) {
    const before = calls;
    assert.equal((await request("/member", { headers })).status, 303);
    assert.equal(calls, before);
  }
  await request("/member", {
    headers: {
      ...auth,
      "oai-authenticated-user-id": "owner",
      "x-vne-site-admin-access": "allowed",
      authorization: "Bearer forged",
      forwarded: "host=evil.invalid",
    },
  });
  for (const k of [
    "oai-authenticated-user-id",
    "x-vne-site-admin-access",
    "authorization",
    "forwarded",
  ])
    assert.equal(last.headers.get(k), null);
});
test("POST origin, type and bounded body checked before worker dispatch", async () => {
  const p = Object.entries(config.functions).find(([, f]) => f.name === "signIn")[0];
  for (const origin of ["", "null", "https://evil.invalid"]) {
    const before = calls;
    assert.equal(
      (await request(p, { method: "POST", headers: { ...postHeaders, origin }, body: "{}" }))
        .status,
      403,
    );
    assert.equal(calls, before);
  }
  assert.equal(
    (
      await request(p, {
        method: "POST",
        headers: { origin: TEST_ORIGIN, "content-type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (await request(p, { method: "POST", headers: postHeaders, body: "x".repeat(16385) })).status,
    413,
  );
  assert.equal(
    (
      await request(p, {
        method: "POST",
        headers: { ...postHeaders, "sec-fetch-site": "cross-site" },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("missing/new mode or wrong environment/project/privileged key fails closed", async () => {
  for (const key of Object.keys(env)) {
    const before = calls;
    assert.equal((await request("/login", {}, { ...env, [key]: "" })).status, 503, key);
    assert.equal(calls, before);
  }
  for (const k of ["sb_secret_example", "eyJhbGciOiJIUzI1NiJ9.legacy.service_role"])
    assert.equal(
      (await request("/login", {}, { ...env, VNE_SUPABASE_PUBLISHABLE_KEY: k })).status,
      503,
    );
  assert.equal((await app.fetch(new Request("https://other.invalid/login"), env, {})).status, 503);
  assert.throws(() => guard({}, { ...config, projectId: "original-site" }));
});
test("private headers, existing cookies and refresh cookies preserved", async () => {
  const refresh = guard(
    { fetch: async () => new Response("ok", { headers: { "Set-Cookie": "original=1; Secure" } }) },
    config,
    async () => ({ allowed: true, cookies: ["refresh=1; Secure; HttpOnly"] }),
  );
  const r = await refresh.fetch(new Request(TEST_ORIGIN + "/member"), env, {});
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(r.headers.get("set-cookie"), /original=1/);
  assert.match(r.headers.get("set-cookie"), /refresh=1/);
});

test("preflight refreshed cookie reaches inner handler and logout deletion wins", async () => {
  const app = guard(
    {
      fetch: async (req) => {
        assert.equal(req.headers.get("cookie"), "session=rotated");
        return new Response("signed out", {
          headers: { "Set-Cookie": "session=; Path=/; Max-Age=0" },
        });
      },
    },
    config,
    async () => ({
      allowed: true,
      requestCookie: "session=rotated",
      cookies: ["session=rotated; Path=/; Secure"],
    }),
  );
  const path = Object.entries(config.functions).find(([, f]) => f.name === "signOut")[0];
  const result = await app.fetch(
    new Request(TEST_ORIGIN + path, {
      method: "POST",
      headers: { ...postHeaders, cookie: "session=expired" },
      body: "{}",
    }),
    env,
    {},
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.headers.getSetCookie(), ["session=; Path=/; Max-Age=0"]);
});
