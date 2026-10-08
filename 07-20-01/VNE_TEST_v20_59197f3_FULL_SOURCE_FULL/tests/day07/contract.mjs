import assert from "node:assert/strict";
import {
  parseAdmissionInput,
  parseAdmissionReadResult,
  parseAdmissionCommandResult,
  admissionError,
  admissionPayloadBounded,
  SECRET_CONTRACT,
} from "../../src/lib/admission/contract.ts";
import {
  QR_TEST_ACCOUNT_IDS,
  QR_TEST_ORIGIN,
  QR_TEST_SUPABASE,
  qrAdmissionConfigured,
  qrTestAccountsConfigured,
} from "../../src/lib/admission/test-accounts.ts";
import {
  publicInvitationDestination,
  PERMANENT_MEMBER_CARD,
} from "../../src/lib/admission/public-invites.ts";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const token = "VNE2:" + "a".repeat(43);
const commands = [
  { action: "catalog" },
  { action: "verify", eventId: id, token },
  { action: "checkin", eventId: id, token, operationId: id, expectedVersion: 1 },
  ...["issue", "rotate", "revoke"].map((action) => ({
    action,
    eventId: id,
    participationId: id,
    operationId: id,
    expectedVersion: 0,
    reason: "Synthetic test",
  })),
];
const reads = [
  { action: "list" },
  ...["status", "address"].map((action) => ({ action, eventId: id, participationId: id })),
];
for (const command of commands) {
  assert.deepEqual(parseAdmissionInput(command, "POST"), command);
  assert.equal(parseAdmissionInput(command, "GET"), null, "GET must not execute/audit commands");
  for (const extra of ["actorId", "userId", "role", "aal", "secret", "redirect"])
    assert.equal(parseAdmissionInput({ ...command, [extra]: id }, "POST"), null);
}
for (const read of reads) {
  assert.deepEqual(parseAdmissionInput(read, "GET"), read);
  assert.equal(parseAdmissionInput(read, "POST"), null);
}
for (const bad of [
  null,
  [],
  {},
  "list",
  { action: "execute_sql" },
  { action: "list", token },
  { action: "verify", eventId: id, token: "VNE1:" + "a".repeat(43) },
  { ...commands[2], expectedVersion: -1 },
  { ...commands[2], expectedVersion: 1.5 },
  { ...commands[2], expectedVersion: "1" },
  { ...commands[3], reason: token },
  { ...commands[3], reason: "ab" },
  { ...commands[3], reason: "x".repeat(301) },
  { ...commands[2], operationId: null },
  { ...commands[1], eventId: "arbitrary" },
])
  assert.equal(parseAdmissionInput(bad, "POST"), null);
for (const probe of ["DAY07_CLOCK_PROBE", "DAY07_REHEARSAL_PROBE"]) {
  const input = { action: "verify", eventId: "d0700000-0000-4000-8000-000000000001", token: probe };
  assert.deepEqual(parseAdmissionInput(input, "POST"), input);
  assert.equal(parseAdmissionInput({ ...input, eventId: id }, "POST"), null);
  assert.equal(
    parseAdmissionInput(
      { ...input, action: "checkin", operationId: id, expectedVersion: 1 },
      "POST",
    ),
    null,
  );
}
assert.equal(
  parseAdmissionInput(
    {
      action: "verify",
      eventId: "d0700000-0000-4000-8000-000000000001",
      token: "DAY07_OTHER_PROBE",
    },
    "POST",
  ),
  null,
);
assert.equal(admissionPayloadBounded({ text: "я".repeat(8192) }), false);
const cycle = {};
cycle.self = cycle;
assert.equal(admissionPayloadBounded(cycle), false);
const pass = {
  participationId: id,
  eventId: id,
  eventTitle: "Synthetic",
  timezone: "Europe/Moscow",
  qrReleaseAt: null,
  addressRevealAt: null,
  entryOpensAt: null,
  entryClosesAt: null,
  passId: null,
  version: 0,
  generation: 0,
  status: "not_issued",
  secretContract: SECRET_CONTRACT,
  secretUnavailable: false,
  simulated: true,
  reentryAllowed: false,
};
assert.equal(
  parseAdmissionReadResult(reads[0], { items: [pass], secretContract: SECRET_CONTRACT }).ok,
  true,
);
assert.equal(parseAdmissionReadResult(reads[1], { pass }).ok, true);
for (const mutation of [
  { token },
  { address: "premature address" },
  { userName: "Synthetic name" },
  { secretContract: "restorable" },
  { reentryAllowed: true },
])
  assert.equal(
    parseAdmissionReadResult(reads[0], {
      items: [{ ...pass, ...mutation }],
      secretContract: SECRET_CONTRACT,
    }).ok,
    false,
  );
assert.equal(parseAdmissionReadResult({ ...reads[1], eventId: other }, { pass }).ok, false);
assert.equal(
  parseAdmissionReadResult(reads[2], {
    outcome: "before_reveal",
    addressAvailable: false,
    addressRevealAt: "2026-10-08T00:00:00Z",
    timezone: "Europe/Moscow",
  }).ok,
  true,
);
assert.equal(
  parseAdmissionReadResult(reads[2], {
    outcome: "before_reveal",
    addressAvailable: false,
    address: "Hidden",
  }).ok,
  false,
);
assert.equal(
  parseAdmissionReadResult(reads[2], {
    outcome: "ready",
    addressAvailable: true,
    address: "Synthetic venue",
  }).ok,
  true,
);
const receipt = {
  operationId: id,
  correlationId: id,
  action: "issue",
  outcome: "issued",
  eventId: id,
  participationId: id,
  passId: id,
  version: 1,
  generation: 1,
  actorId: id,
  at: "2026-10-08T00:00:00Z",
  simulated: true,
  reentryAllowed: false,
};
const issued = { receipt, replayed: false, secretUnavailable: false, qrText: token };
assert.equal(parseAdmissionCommandResult(commands[3], issued).ok, true);
assert.equal(
  parseAdmissionCommandResult(commands[3], { ...issued, qrText: "VNE1:" + "a".repeat(43) }).ok,
  false,
);
assert.equal(
  parseAdmissionCommandResult(commands[3], { receipt, replayed: true, secretUnavailable: true }).ok,
  true,
);
assert.equal(
  parseAdmissionCommandResult(commands[3], { ...issued, replayed: true, secretUnavailable: true })
    .ok,
  false,
  "replay cannot recover old secret",
);
for (const mutation of [
  { eventId: other },
  { operationId: other },
  { participationId: other },
  { token },
])
  assert.equal(
    parseAdmissionCommandResult(commands[3], { ...issued, receipt: { ...receipt, ...mutation } })
      .ok,
    false,
  );
assert.equal(
  parseAdmissionCommandResult(commands[1], {
    receipt: { ...receipt, operationId: null, action: "verify", outcome: "ready" },
    replayed: false,
    secretUnavailable: true,
  }).ok,
  true,
);
assert.equal(
  parseAdmissionCommandResult(commands[1], {
    receipt: { ...receipt, operationId: null, action: "verify", outcome: "ready" },
    replayed: false,
    secretUnavailable: false,
    qrText: token,
  }).ok,
  false,
);
assert.deepEqual(admissionError("PGRST202", token), { ok: false, reason: "unconfigured" });
assert.deepEqual(admissionError("42501", token), { ok: false, reason: "forbidden" });
assert.deepEqual(admissionError("22023", "idempotency_conflict"), {
  ok: false,
  reason: "conflict",
});
assert.ok(!JSON.stringify(admissionError("other", token)).includes(token));
const env = {
  VNE_QR_TEST_ACCOUNT_IDS: QR_TEST_ACCOUNT_IDS.join(","),
  VNE_QR_ADMISSION: "test-explicit-v2",
  VNE_TEST_VARIANT: "qr-admission-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: QR_TEST_ORIGIN,
  VNE_SUPABASE_URL: QR_TEST_SUPABASE,
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_DELIVERY_MODE: "disabled",
};
assert.equal(qrAdmissionConfigured(env, QR_TEST_ORIGIN), true);
for (const key of Object.keys(env))
  assert.equal(qrAdmissionConfigured({ ...env, [key]: "wrong" }, QR_TEST_ORIGIN), false, key);
assert.equal(qrAdmissionConfigured(env, "https://evil.invalid"), false);
for (const value of [
  "",
  QR_TEST_ACCOUNT_IDS.slice(1).join(","),
  [...QR_TEST_ACCOUNT_IDS, id].join(","),
  [QR_TEST_ACCOUNT_IDS[0], QR_TEST_ACCOUNT_IDS[0], QR_TEST_ACCOUNT_IDS[1]].join(","),
])
  assert.equal(qrTestAccountsConfigured({ VNE_QR_TEST_ACCOUNT_IDS: value }), false);
assert.equal(publicInvitationDestination("vne"), "/");
for (const value of [
  "https://evil.invalid",
  "//evil.invalid",
  "../",
  "VNE",
  "__proto__",
  "constructor",
  token,
  "VNE1:old",
  null,
])
  assert.equal(publicInvitationDestination(value), null);
assert.equal(PERMANENT_MEMBER_CARD.grantsAdmission, false);
console.log(
  "PASS Day07 strict command/read/response contract, secret exclusions, replay policy, exact environment scope, closed redirect",
);
