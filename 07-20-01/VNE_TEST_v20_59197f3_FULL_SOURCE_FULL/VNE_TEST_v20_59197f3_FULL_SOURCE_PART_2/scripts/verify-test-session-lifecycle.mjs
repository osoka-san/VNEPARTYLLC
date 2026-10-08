import { toJSON, fromCrossJSON } from "seroval";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNT_ID, TEST_ACCOUNT_IDS } from "../test-stand/session.mjs";
import { TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
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
Object.assign(process.env, env);
const user = {
  id: TEST_ACCOUNT_ID,
  is_anonymous: false,
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic@example.com",
};
function token(exp) {
  return [
    { alg: "HS256", typ: "JWT" },
    { sub: TEST_ACCOUNT_ID, exp, role: "authenticated" },
    "synthetic-signature",
  ]
    .map((v, i) => (i === 2 ? v : Buffer.from(JSON.stringify(v)).toString("base64url")))
    .join(".");
}
const next = {
  access_token: token(4102444800),
  refresh_token: "synthetic-rotated-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const cookie =
  "sb-xrocuwlofxhxoxajukne-auth-token=base64-" +
  Buffer.from(
    JSON.stringify({
      ...next,
      access_token: token(1),
      expires_at: 1,
      refresh_token: "synthetic-expired-refresh",
    }),
  ).toString("base64url");
let calls = [];
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  calls.push(u.pathname + u.search);
  if (u.pathname === "/auth/v1/token" && u.search === "?grant_type=refresh_token")
    return Response.json(next);
  if (u.pathname === "/auth/v1/user") return Response.json(user);
  if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (u.pathname === "/rest/v1/rpc/vne_read_my_membership_questionnaires") return Response.json([]);
  throw Error("Unexpected synthetic fetch: " + u.pathname);
};
const { default: worker } = await import("../dist/server/index.js");
const allow = JSON.parse(await readFile(".sites-runtime/test-allowlist.json", "utf8"));
const page = await worker.fetch(
  new Request(TEST_ORIGIN + "/member", { headers: { cookie } }),
  env,
  { waitUntil() {} },
);
assert.equal(page.status, 200);
assert.match(await page.text(), /Сохранённых заявок пока нет/);
assert.equal(
  calls.filter((x) => x.includes("refresh_token")).length,
  1,
  "SSR must reuse refreshed request cookie",
);
const pageCalls = [...calls];
calls = [];
const logout = Object.entries(allow.functions).find(([, f]) => f.name === "signOut")[0];
const out = await worker.fetch(
  new Request(TEST_ORIGIN + logout, {
    method: "POST",
    headers: {
      cookie,
      origin: TEST_ORIGIN,
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "x-tsr-serverFn": "true",
    },
    body: JSON.stringify(toJSON({ data: {} })),
  }),
  env,
  { waitUntil() {} },
);
assert.equal(out.status, 200);
await out.text();
assert.equal(
  calls.filter((x) => x.includes("refresh_token")).length,
  1,
  "Logout must reuse rotated request session",
);
assert.ok(calls.some((x) => x.startsWith("/auth/v1/logout")));
const finalCookies = out.headers.getSetCookie();
assert.ok(finalCookies.length);
for (const c of finalCookies) {
  assert.match(c, /Max-Age=0/i);
  assert.ok(!c.includes("base64-"), "Logout must not resurrect preflight cookie");
}
console.log(
  JSON.stringify(
    {
      status: "PASS",
      network: "fully mocked",
      expiredSessionSSR: pageCalls,
      expiredSessionLogout: calls,
      logoutCookies: "deletion only",
      realAccount: "NOT USED",
    },
    null,
    2,
  ),
);

const signin = Object.entries(allow.functions).find(([, f]) => f.name === "signIn")[0];
for (const loginId of [...TEST_ACCOUNT_IDS, "00000000-0000-4000-8000-000000000002"]) {
  const allowed = TEST_ACCOUNT_IDS.includes(loginId);
  calls = [];
  const loginUser = {
    ...user,
    id: loginId,
  };
  globalThis.fetch = async (input) => {
    const u = new URL(typeof input === "string" ? input : input.url);
    calls.push(u.pathname + u.search);
    if (u.pathname === "/auth/v1/token" && u.search === "?grant_type=password")
      return Response.json({ ...next, user: loginUser });
    if (u.pathname === "/auth/v1/user") return Response.json(loginUser);
    if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    throw Error("Unexpected mocked login request");
  };
  const response = await worker.fetch(
    new Request(TEST_ORIGIN + signin, {
      method: "POST",
      headers: {
        origin: TEST_ORIGIN,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        "x-tsr-serverFn": "true",
      },
      body: JSON.stringify(
        toJSON({
          data: {
            email: "synthetic@example.com",
            password: "synthetic-not-a-real-password",
            redirect: "/apply",
          },
        }),
      ),
    }),
    env,
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  const wire = await response.json();
  const result = fromCrossJSON(wire, { refs: new Map() });
  assert.equal(result.result.ok, allowed);
  if (!allowed) {
    assert.ok(calls.some((x) => x.startsWith("/auth/v1/logout")));
    for (const c of response.headers.getSetCookie()) {
      assert.match(c, /Max-Age=0/i);
      assert.ok(!c.includes("base64-"));
    }
  }
  console.log(
    JSON.stringify({
      loginId,
      mockedLogin: allowed ? "allowed UUID accepted" : "other UUID rejected and cookie cleared",
      status: "PASS",
    }),
  );
}
