import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_TEST_ID,
  adminMfaState,
  beginAdminTotp,
  completeAdminTotp,
  type AdminMfaPort,
  type OwnFactor,
} from "../../src/lib/auth/admin-mfa-core.ts";
const other = "11111111-1111-4111-8111-111111111111",
  factor = "22222222-2222-4222-8222-222222222222";
function make(
  options: {
    id?: string;
    subject?: string;
    anonymous?: boolean;
    aal?: string;
    factors?: OwnFactor[];
    validCode?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const port: AdminMfaPort = {
    async identity() {
      calls.push("identity");
      return {
        userId: options.id ?? ADMIN_TEST_ID,
        claimsUserId: options.subject ?? options.id ?? ADMIN_TEST_ID,
        anonymous: options.anonymous ?? false,
        aal: options.aal ?? "aal1",
      };
    },
    async factors() {
      calls.push("factors");
      return options.factors ?? [];
    },
    async enrollTotp() {
      calls.push("enroll");
      return {
        id: factor,
        qr: "SYNTHETIC_QR_NOT_A_REAL_SECRET",
        secret: "SYNTHETIC_SECRET_NOT_VALID_TOTP",
      };
    },
    async verifyTotp(id, code) {
      calls.push("verify");
      assert.equal(id, factor);
      assert.equal(code, "123456");
      return options.validCode ?? true;
    },
  };
  return { port, calls };
}
test("disabled endpoints perform no Auth calls", async () => {
  const { port, calls } = make();
  assert.deepEqual(await adminMfaState(false, port), { ok: false, reason: "unconfigured" });
  assert.deepEqual(await beginAdminTotp(false, port), { ok: false, reason: "unconfigured" });
  assert.deepEqual(await completeAdminTotp(false, port, {}), { ok: false, reason: "unconfigured" });
  assert.deepEqual(calls, []);
});
test("other user, anonymous user and mismatched claims cannot read or enroll", async () => {
  for (const options of [{ id: other }, { anonymous: true }, { subject: other }]) {
    const { port, calls } = make(options);
    assert.deepEqual(await beginAdminTotp(true, port), { ok: false, reason: "forbidden" });
    assert.equal(calls.includes("enroll"), false);
    assert.equal(calls.includes("factors"), false);
  }
});
test("status is read-only and returns no QR/secret/token", async () => {
  const { port, calls } = make();
  const result = await adminMfaState(true, port);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.deepEqual(calls, ["identity", "factors"]);
});
test("enrollment occurs only on explicit begin for own account without verified factor", async () => {
  const { port, calls } = make();
  const result = await beginAdminTotp(true, port);
  assert.equal(result.ok, true);
  assert.equal(calls.filter((x) => x === "enroll").length, 1);
});
test("any existing verified factor blocks adding a new factor at aal1", async () => {
  for (const type of ["totp", "phone"]) {
    const { port, calls } = make({ factors: [{ id: factor, type, status: "verified" }] });
    assert.deepEqual(await beginAdminTotp(true, port), { ok: false, reason: "existing_factor" });
    assert.equal(calls.includes("enroll"), false);
  }
});
test("verification accepts only own selected factor and exactly six digits", async () => {
  const { port, calls } = make({ factors: [{ id: factor, type: "totp", status: "unverified" }] });
  for (const input of [
    { factorId: other, code: "123456" },
    { factorId: factor, code: "bad" },
    { factorId: factor, code: "123456", actor: ADMIN_TEST_ID },
  ])
    assert.equal((await completeAdminTotp(true, port, input)).ok, false);
  assert.equal(calls.includes("verify"), false);
  assert.deepEqual(await completeAdminTotp(true, port, { factorId: factor, code: "123456" }), {
    ok: true,
  });
});
test("unverified factor cannot replace existing verified factor during challenge", async () => {
  const { port, calls } = make({
    factors: [
      { id: factor, type: "totp", status: "unverified" },
      { id: other, type: "totp", status: "verified" },
    ],
  });
  assert.deepEqual(await completeAdminTotp(true, port, { factorId: factor, code: "123456" }), {
    ok: false,
    reason: "existing_factor",
  });
  assert.equal(calls.includes("verify"), false);
});
test("one existing verified TOTP can be challenged without client selecting IDs", async () => {
  const { port } = make({ factors: [{ id: factor, type: "totp", status: "verified" }] });
  assert.deepEqual(await completeAdminTotp(true, port, { factorId: null, code: "123456" }), {
    ok: true,
  });
});
test("multiple pending factors are not guessed", async () => {
  const { port, calls } = make({
    factors: [
      { id: factor, type: "totp", status: "unverified" },
      { id: other, type: "totp", status: "unverified" },
    ],
  });
  assert.deepEqual(await completeAdminTotp(true, port, { factorId: null, code: "123456" }), {
    ok: false,
    reason: "factor_required",
  });
  assert.equal(calls.includes("verify"), false);
});
test("failed code does not claim MFA completion", async () => {
  const { port } = make({
    factors: [{ id: factor, type: "totp", status: "verified" }],
    validCode: false,
  });
  assert.deepEqual(await completeAdminTotp(true, port, { code: "123456" }), {
    ok: false,
    reason: "code_invalid",
  });
});
test("factor presence is not an aal2 claim", async () => {
  const { port } = make({
    factors: [{ id: factor, type: "totp", status: "verified" }],
    aal: "aal1",
  });
  const r = await adminMfaState(true, port);
  assert.equal(r.ok && r.hasVerifiedTotp, true);
  assert.equal(r.ok && r.aal2, false);
});
test("verified aal2 session is reported without role mutation", async () => {
  const { port, calls } = make({
    aal: "aal2",
    factors: [{ id: factor, type: "totp", status: "verified" }],
  });
  const r = await adminMfaState(true, port);
  assert.equal(r.ok && r.aal2, true);
  assert.deepEqual(calls, ["identity", "factors"]);
});
