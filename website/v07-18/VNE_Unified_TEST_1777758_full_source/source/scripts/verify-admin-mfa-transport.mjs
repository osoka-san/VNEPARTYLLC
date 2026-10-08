import { toJSON } from "seroval";
import { runWithStartContext } from "@tanstack/start-storage-context";
// Entirely local mocked Auth. Never sends a request to Supabase or creates a real factor.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { serverFnFetcher } from "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import { TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
const ADMIN = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6",
  GUEST = "2b321688-f5fe-4099-9de2-f316bf07c3d3",
  QA = "996a7a9c-04fc-43f2-9251-7d5a8dd9a92b";
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
};
Object.assign(process.env, env);
let identity = ADMIN,
  factors = [],
  aal = "aal1",
  calls = [],
  passwordEmail = null;
function jwt(id = identity, level = aal) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: id, exp: 4102444800, role: "authenticated", aal: level }),
    ).toString("base64url"),
    "c3ludGhldGlj",
  ].join(".");
}
function user() {
  return {
    id: identity,
    is_anonymous: false,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    factors,
  };
}
function session() {
  return {
    access_token: jwt(),
    refresh_token: "synthetic-refresh-not-valid",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: user(),
  };
}
function cookie() {
  return (
    "sb-xrocuwlofxhxoxajukne-auth-token=base64-" +
    Buffer.from(JSON.stringify(session())).toString("base64url")
  );
}
globalThis.fetch = async (input, options = {}) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  assert.equal(u.origin, TEST_SUPABASE);
  calls.push(u.pathname);
  const raw = options.body ?? (input instanceof Request ? await input.text() : null);
  const body = raw ? JSON.parse(raw) : {};
  if (u.pathname === "/auth/v1/user") return Response.json(user());
  if (u.pathname === "/auth/v1/token" && u.search === "?grant_type=password") {
    passwordEmail = body.email;
    return Response.json(session());
  }
  if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (u.pathname === "/auth/v1/factors") {
    assert.equal(body.factor_type, "totp");
    factors = [{ id: "synthetic-factor", factor_type: "totp", status: "unverified" }];
    return Response.json({
      id: "synthetic-factor",
      type: "totp",
      totp: {
        qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        secret: "SYNTHETIC-NOT-A-REAL-TOTP-SECRET",
      },
    });
  }
  if (u.pathname === "/auth/v1/factors/synthetic-factor/challenge")
    return Response.json({ id: "synthetic-challenge", type: "totp" });
  if (u.pathname === "/auth/v1/factors/synthetic-factor/verify") {
    assert.equal(body.code, "123456");
    assert.equal(body.challenge_id, "synthetic-challenge");
    aal = "aal2";
    factors = [{ id: "synthetic-factor", factor_type: "totp", status: "verified" }];
    return Response.json(session());
  }
  throw Error("Unexpected mocked Auth path: " + u.pathname);
};
const { default: worker } = await import("../dist/server/index.js");
const allow = JSON.parse(await readFile(".sites-runtime/test-allowlist.json", "utf8"));
async function invoke(name, data, sessionCookie) {
  const [path, fn] = Object.entries(allow.functions).find(([, v]) => v.name === name);
  let response;
  const wire = await runWithStartContext({ startOptions: {} }, () =>
    serverFnFetcher(TEST_ORIGIN + path, [{ method: fn.method, data }], async (url, init) => {
      const headers = new Headers(init.headers);
      headers.set("origin", TEST_ORIGIN);
      headers.set("sec-fetch-site", "same-origin");
      if (sessionCookie) headers.set("cookie", sessionCookie);
      if (fn.method === "POST") {
        assert.equal(
          headers.get("content-type"),
          "application/json",
          "real browser transport must produce JSON",
        );
        assert.ok(init.body, "real browser transport must produce nonempty body");
      }
      response = await worker.fetch(new Request(url, { ...init, headers }), env, {
        waitUntil() {},
      });
      assert.equal(response.status, 200, name);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      return response;
    }),
  );
  return { response, result: wire.result };
}
// Alias is server-only and cannot grant ADMIN authority to the other allowed QA user.
for (const id of [ADMIN, GUEST, QA]) {
  identity = id;
  calls = [];
  const { result, response } = await invoke("signIn", {
    email: " ADMIN_TEST ",
    password: "synthetic-not-real",
    redirect: "/admin/mfa",
  });
  assert.equal(passwordEmail, "savik3003@gmail.com");
  assert.equal(result.ok, id === ADMIN);
  if (id !== ADMIN) {
    assert.ok(calls.includes("/auth/v1/logout"));
    for (const value of response.headers.getSetCookie()) assert.match(value, /Max-Age=0/i);
  }
}
identity = QA;
calls = [];
for (const name of ["getAdminMfaState", "beginAdminMfaEnrollment", "completeAdminMfaChallenge"]) {
  const [path, fn] = Object.entries(allow.functions).find(([, v]) => v.name === name);
  const response = await worker.fetch(
    new Request(TEST_ORIGIN + path, {
      method: fn.method,
      headers: {
        origin: TEST_ORIGIN,
        "sec-fetch-site": "same-origin",
        "x-tsr-serverFn": "true",
        cookie: cookie(),
        ...(fn.method === "POST" ? { "content-type": "application/json" } : {}),
      },
      ...(fn.method === "POST" ? { body: JSON.stringify(toJSON({ data: {} })) } : {}),
    }),
    env,
    { waitUntil() {} },
  );
  assert.equal(response.status, 403, name);
}
assert.ok(!calls.some((path) => path.includes("/factors")));
identity = ADMIN;
const initial = cookie();
calls = [];
const before = await invoke("getAdminMfaState", undefined, initial);
assert.equal(before.result.ok, true);
assert.equal(before.result.aal2, false);
assert.equal(before.result.hasVerifiedTotp, false);
assert.ok(!JSON.stringify(before.result).includes("secret"));
assert.ok(!calls.includes("/auth/v1/factors"));
const begin = await invoke("beginAdminMfaEnrollment", {}, initial);
assert.equal(begin.result.ok, true);
assert.equal(begin.result.secret, "SYNTHETIC-NOT-A-REAL-TOTP-SECRET");
assert.equal(begin.response.headers.get("referrer-policy"), "no-referrer");
assert.equal(begin.response.headers.get("content-security-policy"), "frame-ancestors 'none'");
assert.equal(begin.response.headers.get("x-frame-options"), "DENY");
const verified = await invoke(
  "completeAdminMfaChallenge",
  { factorId: "synthetic-factor", code: "123456" },
  initial,
);
assert.deepEqual(verified.result, { ok: true });
assert.ok(!JSON.stringify(verified.result).includes("secret"));
const written = verified.response.headers.getSetCookie().filter((x) => !x.includes("Max-Age=0"));
assert.ok(written.length, "MFA session refresh must reach the browser");
const refreshed = written.map((x) => x.split(";")[0]).join("; ");
const after = await invoke("getAdminMfaState", undefined, refreshed);
assert.equal(after.result.aal2, true);
assert.equal(after.result.hasVerifiedTotp, true);
const count = calls.filter((x) => x === "/auth/v1/factors").length;
const again = await invoke("beginAdminMfaEnrollment", {}, refreshed);
assert.deepEqual(again.result, { ok: false, reason: "existing_factor" });
assert.equal(calls.filter((x) => x === "/auth/v1/factors").length, count);
assert.ok(!calls.some((x) => x.startsWith("/rest/") || x.includes("/admin/")));
console.log(
  JSON.stringify(
    {
      status: "PASS",
      network: "fully mocked",
      aliasExactIdentity: true,
      thirdQaMfaDenied: true,
      noAutoEnrollment: true,
      selfEnrollment: true,
      challengeCookieRefresh: true,
      freshAal2: true,
      noFactorReplacement: true,
      noDatabaseOrAdminAPI: true,
      realAccount: "NOT USED",
    },
    null,
    2,
  ),
);
