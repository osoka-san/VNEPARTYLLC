import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTestSession, TEST_ACCOUNT_ID, TEST_ACCOUNT_IDS } from "../test-stand/session.mjs";
const env = {
  VNE_SUPABASE_URL: "https://xrocuwlofxhxoxajukne.supabase.co",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_public_key",
};
const originalFetch = globalThis.fetch;
function cookie(claimedId = TEST_ACCOUNT_ID) {
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: claimedId, exp: Math.floor(Date.now() / 1000) + 3600 },
    "signature",
  ]
    .map((v, i) => (i === 2 ? v : Buffer.from(JSON.stringify(v)).toString("base64url")))
    .join(".");
  return (
    "sb-xrocuwlofxhxoxajukne-auth-token=base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: token,
        refresh_token: "synthetic-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: claimedId, is_anonymous: false },
      }),
    ).toString("base64url")
  );
}
test("only the six server-verified exact nonanonymous QA accounts are accepted; cookie claims cannot grant access", async () => {
  try {
    assert.deepEqual(TEST_ACCOUNT_IDS, [
      "2b321688-f5fe-4099-9de2-f316bf07c3d3",
      "02e03845-bc0d-4a9b-8500-87bb1f11ccf6",
      "996a7a9c-04fc-43f2-9251-7d5a8dd9a92b",
      "15cbc7a4-92f6-48d8-abb2-ed68f7612271",
      "1e7259c2-ad13-43a1-b34b-cba71533e844",
      "ed2433cb-bc6e-4b23-aa57-000839292ec4",
    ]);
    for (const scenario of [
      ...TEST_ACCOUNT_IDS.map((id) => ({ id, is_anonymous: false, allowed: true })),
      { id: "00000000-0000-4000-8000-000000000002", is_anonymous: false, allowed: false },
      ...TEST_ACCOUNT_IDS.map((id) => ({ id, is_anonymous: true, allowed: false })),
      ...TEST_ACCOUNT_IDS.map((id) => ({ id, is_anonymous: undefined, allowed: false })),
    ]) {
      let calls = 0;
      globalThis.fetch = async (input) => {
        calls++;
        assert.equal(
          new URL(typeof input === "string" ? input : input.url).pathname,
          "/auth/v1/user",
        );
        return Response.json({
          id: scenario.id,
          is_anonymous: scenario.is_anonymous,
          aud: "authenticated",
          role: "authenticated",
          email: "synthetic@example.com",
        });
      };
      const result = await verifyTestSession(
        new Request("https://test.invalid/member", { headers: { cookie: cookie() } }),
        env,
      );
      assert.equal(result.allowed, scenario.allowed);
      assert.equal(calls, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("no cookie, rejected Auth, forged header and network failure fail closed", async () => {
  try {
    globalThis.fetch = async () => {
      throw Error("No session must not fetch");
    };
    assert.equal(
      (
        await verifyTestSession(
          new Request("https://test.invalid/member", {
            headers: {
              "oai-authenticated-user-id": TEST_ACCOUNT_ID,
              authorization: "Bearer synthetic",
            },
          }),
          env,
        )
      ).allowed,
      false,
    );
    globalThis.fetch = async () => Response.json({ message: "Invalid JWT" }, { status: 401 });
    assert.equal(
      (
        await verifyTestSession(
          new Request("https://test.invalid/member", { headers: { cookie: cookie() } }),
          env,
        )
      ).allowed,
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("decoded cookie delimiters cannot inject a second inner Supabase cookie", async () => {
  try {
    globalThis.fetch = async () => Response.json({ id: TEST_ACCOUNT_ID, is_anonymous: false });
    const attack =
      "unrelated=" + encodeURIComponent("harmless; sb-xrocuwlofxhxoxajukne-auth-token=attacker");
    const result = await verifyTestSession(
      new Request("https://test.invalid/member", { headers: { cookie: cookie() + "; " + attack } }),
      env,
    );
    assert.equal(result.allowed, true);
    assert.ok(result.requestCookie.includes("%3B"));
    const { parseCookieHeader } = await import("@supabase/ssr");
    const cookies = parseCookieHeader(result.requestCookie);
    assert.equal(cookies.filter((c) => c.name === "sb-xrocuwlofxhxoxajukne-auth-token").length, 1);
    assert.ok(
      !cookies.some(
        (c) => c.name === "sb-xrocuwlofxhxoxajukne-auth-token" && c.value === "attacker",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
