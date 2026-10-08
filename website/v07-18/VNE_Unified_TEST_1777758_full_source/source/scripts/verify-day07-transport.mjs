import { toJSON } from "seroval";
// Fully local compiled-worker + installed browser serializer test. Auth/RPC are mocked.
// This proves transport behavior, never real DB concurrency, roles, MFA, or admission.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { serverFnFetcher } from "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import {
  QR_TEST_ACCOUNT_IDS,
  QR_TEST_ORIGIN,
  QR_TEST_SUPABASE,
} from "../src/lib/admission/test-accounts.ts";
import { TEST_ACCOUNT_IDS } from "../day07-stand/session.mjs";
const env = {
  VNE_QR_TEST_ACCOUNT_IDS: QR_TEST_ACCOUNT_IDS.join(","),
  VNE_QR_ADMISSION: "test-explicit-v2",
  VNE_TEST_VARIANT: "qr-admission-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: QR_TEST_ORIGIN,
  VNE_SUPABASE_URL: QR_TEST_SUPABASE,
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_QUESTIONNAIRE_DRAFTS: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_INCIDENTS_MODE: "test",
  VNE_TEST_ADMIN_MFA: "enabled",
  VNE_TEST_SCANNER_MFA: "enabled",
};
Object.assign(process.env, env);
let identity = QR_TEST_ACCOUNT_IDS[0],
  anonymous = false,
  authFailure = false,
  rpcError = null,
  rpcValue = null,
  rpcCalls = [],
  authCalls = 0,
  browserCalls = [];
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const token = "VNE2:" + "a".repeat(43); // Never a credential or real event pass.
function user() {
  return {
    id: identity,
    is_anonymous: anonymous,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    factors: [],
  };
}
function jwt() {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: identity, exp: 4102444800, role: "authenticated", aal: "aal1" }),
    ).toString("base64url"),
    "c3ludGhldGlj",
  ].join(".");
}
function cookie() {
  return (
    "sb-xrocuwlofxhxoxajukne-auth-token=base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt(),
        refresh_token: "synthetic-not-valid",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user: user(),
      }),
    ).toString("base64url")
  );
}
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  assert.equal(url.origin, QR_TEST_SUPABASE);
  if (url.pathname === "/auth/v1/user") {
    authCalls++;
    return authFailure
      ? Response.json({ message: "synthetic auth denied" }, { status: 401 })
      : Response.json(user());
  }
  if (url.pathname === "/rest/v1/rpc/vne_qr_command") {
    const headers = new Headers(options.headers ?? input.headers);
    assert.equal(headers.get("apikey"), env.VNE_SUPABASE_PUBLISHABLE_KEY);
    assert.match(headers.get("authorization"), /^Bearer /);
    assert.ok(![...headers].some(([key]) => key.startsWith("x-vne-") || key.startsWith("oai-")));
    const body = JSON.parse(options.body ?? (await input.text()));
    assert.deepEqual(Object.keys(body), ["_command"]);
    rpcCalls.push(body._command);
    return rpcError ? Response.json(rpcError, { status: 400 }) : Response.json(rpcValue);
  }
  throw Error("Unplanned mocked backend path");
};
const { default: worker } = await import("../dist/server/index.js");
const allow = JSON.parse(await readFile(".sites-runtime/day07-allowlist.json", "utf8"));
assert.equal(Object.keys(allow.functions).length, 18);
for (const name of [
  "incidentAction",
  "getAuthAvailability",
  "signIn",
  "signOut",
  "getQuestionnaireAvailability",
  "submitOwnedMembershipQuestionnaire",
  "getMyMembershipQuestionnaires",
  "getMyQuestionnaireDraft",
  "saveMyQuestionnaireDraft",
  "getAdminMfaState",
  "beginAdminMfaEnrollment",
  "completeAdminMfaChallenge",
  "getScannerMfaState",
  "beginScannerMfaEnrollment",
  "completeScannerMfaChallenge",
  "getQrAdmissionAvailability",
  "qrAdmissionRead",
  "qrAdmissionCommand",
])
  assert.equal(Object.values(allow.functions).filter((fn) => fn.name === name).length, 1, name);
async function invoke(name, data, expectedStatus = 200) {
  const [path, fn] = Object.entries(allow.functions).find(([, f]) => f.name === name);
  let response, observed;
  try {
    const result = await runWithStartContext({ startOptions: {} }, () =>
      serverFnFetcher(QR_TEST_ORIGIN + path, [{ method: fn.method, data }], async (url, init) => {
        const headers = new Headers(init.headers);
        headers.set("cookie", cookie());
        headers.set("origin", QR_TEST_ORIGIN);
        headers.set("sec-fetch-site", "same-origin");
        headers.set("x-vne-user-id", "spoofed");
        headers.set("authorization", "Bearer spoofed");
        observed = { url: String(url), method: init.method, bytes: init.body?.length ?? 0 };
        browserCalls.push(observed);
        response = await worker.fetch(new Request(url, { ...init, headers }), env, {
          waitUntil() {},
        });
        assert.equal(response.status, expectedStatus, name);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("referrer-policy"), "no-referrer");
        return response;
      }),
    );
    return { result: result.result, response, observed };
  } catch (error) {
    if (expectedStatus === 200 || !response) throw error;
    return { result: null, response, observed };
  }
}
// Malformed and immutable framework envelopes must fail without invoking/logging framework errors.
{
  const originalError = console.error,
    originalWarn = console.warn;
  let logged = 0;
  console.error = () => {
    logged++;
  };
  console.warn = () => {
    logged++;
  };
  const before = rpcCalls.length;
  try {
    for (const envelope of [
      Object.freeze({ data: { action: "catalog" } }),
      Object.seal({ data: { action: "catalog" } }),
      Object.preventExtensions({ data: { action: "catalog" } }),
      { data: { action: "catalog" }, context: Object.freeze({}) },
    ]) {
      const raw = JSON.stringify(toJSON(envelope));
      for (const name of ["qrAdmissionCommand", "qrAdmissionRead"]) {
        const [path, fn] = Object.entries(allow.functions).find(([, value]) => value.name === name);
        const response = await worker.fetch(
          new Request(
            QR_TEST_ORIGIN +
              path +
              (fn.method === "GET" ? "?payload=" + encodeURIComponent(raw) : ""),
            {
              method: fn.method,
              headers: {
                origin: QR_TEST_ORIGIN,
                "content-type": "application/json",
                cookie: cookie(),
              },
              ...(fn.method === "POST" ? { body: raw } : {}),
            },
          ),
          env,
          { waitUntil() {} },
        );
        assert.equal(response.status, 400);
        assert.equal(await response.text(), "TEST access unavailable");
      }
    }
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
  assert.equal(logged, 0);
  assert.equal(rpcCalls.length, before);
}
assert.equal((await invoke("getQrAdmissionAvailability")).result.enabled, true);
assert.equal(rpcCalls.length, 0);
assert.ok(authCalls >= 2);
const pass = {
  participationId: id,
  eventId: id,
  eventTitle: "Synthetic event",
  timezone: "Europe/Moscow",
  qrReleaseAt: "2026-10-08T00:00:00Z",
  addressRevealAt: "2026-10-08T00:00:00Z",
  entryOpensAt: "2026-10-08T00:00:00Z",
  entryClosesAt: "2026-10-08T01:00:00Z",
  passId: id,
  version: 1,
  generation: 1,
  status: "active",
  secretContract: "explicit-rotation-v2",
  secretUnavailable: true,
  simulated: true,
  reentryAllowed: false,
};
rpcValue = { items: [pass], secretContract: "explicit-rotation-v2" };
const list = await invoke("qrAdmissionRead", { action: "list" });
assert.equal(list.result.items.length, 1);
assert.equal(list.observed.method, "GET");
assert.ok(!JSON.stringify(list.result).includes(token));
rpcValue = { pass };
assert.equal(
  (await invoke("qrAdmissionRead", { action: "status", eventId: id, participationId: id })).result
    .pass.version,
  1,
);
rpcValue = {
  outcome: "before_reveal",
  addressAvailable: false,
  addressRevealAt: "2026-10-08T00:00:00Z",
  timezone: "Europe/Moscow",
};
assert.equal(
  (await invoke("qrAdmissionRead", { action: "address", eventId: id, participationId: id })).result
    .address.address,
  null,
);
rpcValue = { outcome: "ready", addressAvailable: true, address: "Synthetic venue" };
assert.equal(
  (await invoke("qrAdmissionRead", { action: "address", eventId: id, participationId: id })).result
    .address.address,
  "Synthetic venue",
);
const receipt = {
  operationId: null,
  correlationId: id,
  action: "verify",
  outcome: "ready",
  eventId: id,
  participationId: id,
  passId: id,
  generation: 1,
  version: 1,
  actorId: identity,
  at: "2026-10-08T00:00:00Z",
  simulated: true,
  reentryAllowed: false,
};
rpcValue = { receipt, replayed: false, secretUnavailable: true };
const verification = await invoke("qrAdmissionCommand", { action: "verify", eventId: id, token });
assert.equal(verification.result.receipt.outcome, "ready");
assert.equal(verification.observed.method, "POST");
assert.ok(verification.observed.bytes > 0);
assert.ok(!verification.observed.url.includes("VNE2"));
assert.equal(verification.result.qrText, null);
const issue = {
  action: "issue",
  eventId: id,
  participationId: id,
  operationId: id,
  expectedVersion: 0,
  reason: "Synthetic issuance",
};
rpcValue = {
  receipt: { ...receipt, action: "issue", operationId: id, outcome: "issued" },
  replayed: false,
  secretUnavailable: false,
  qrText: token,
};
assert.equal((await invoke("qrAdmissionCommand", issue)).result.qrText, token);
rpcValue = { receipt: rpcValue.receipt, replayed: true, secretUnavailable: true };
const replay = await invoke("qrAdmissionCommand", issue);
assert.equal(replay.result.replayed, true);
assert.equal(replay.result.qrText, null);
assert.deepEqual(rpcCalls.at(-1), rpcCalls.at(-2));
// Only two fixed public probes at the exact synthetic event reach authoritative validation.
const probeIdentity = identity;
identity = QR_TEST_ACCOUNT_IDS[1];
for (const probe of ["DAY07_CLOCK_PROBE", "DAY07_REHEARSAL_PROBE"]) {
  const eventId = "d0700000-0000-4000-8000-000000000001";
  rpcValue = {
    receipt: {
      ...receipt,
      actorId: identity,
      eventId,
      outcome: "invalid_token",
      participationId: null,
      passId: null,
      generation: null,
      version: null,
    },
    replayed: false,
    secretUnavailable: true,
  };
  const probeResult = await invoke("qrAdmissionCommand", {
    action: "verify",
    eventId,
    token: probe,
  });
  assert.equal(probeResult.result.receipt.outcome, "invalid_token");
  assert.equal(rpcCalls.at(-1).token, probe);
  const count = rpcCalls.length;
  for (const input of [
    { action: "verify", eventId: id, token: probe },
    { action: "checkin", eventId, token: probe, operationId: id, expectedVersion: 1 },
    { action: "verify", eventId, token: "DAY07_OTHER_PROBE" },
  ])
    assert.deepEqual((await invoke("qrAdmissionCommand", input)).result, {
      ok: false,
      reason: "invalid",
    });
  assert.equal(rpcCalls.length, count);
}
identity = probeIdentity;
const before = rpcCalls.length;
for (const input of [
  { action: "verify", eventId: id, token: "VNE1:" + "a".repeat(43) },
  {
    action: "issue",
    eventId: id,
    participationId: id,
    operationId: id,
    expectedVersion: 0,
    reason: token,
  },
  { ...issue, actorId: other },
  { action: "list" },
])
  assert.deepEqual((await invoke("qrAdmissionCommand", input)).result, {
    ok: false,
    reason: "invalid",
  });
assert.deepEqual((await invoke("qrAdmissionRead", { action: "catalog" })).result, {
  ok: false,
  reason: "invalid",
});
assert.equal(rpcCalls.length, before);
rpcError = { code: "PGRST202", message: token, details: token, hint: token };
assert.deepEqual((await invoke("qrAdmissionRead", { action: "list" })).result, {
  ok: false,
  reason: "unconfigured",
});
rpcError = { code: "42501", message: token };
assert.deepEqual((await invoke("qrAdmissionRead", { action: "list" })).result, {
  ok: false,
  reason: "forbidden",
});
rpcError = null;
rpcValue = { receipt: { ...receipt, actorId: other }, replayed: false, secretUnavailable: true };
assert.deepEqual(
  (await invoke("qrAdmissionCommand", { action: "verify", eventId: id, token })).result,
  { ok: false, reason: "unavailable" },
);
rpcValue = { items: [{ ...pass, qrText: token }], secretContract: "explicit-rotation-v2" };
assert.deepEqual((await invoke("qrAdmissionRead", { action: "list" })).result, {
  ok: false,
  reason: "unavailable",
});
const latest = rpcCalls.length;
for (const account of TEST_ACCOUNT_IDS.filter((id) => !QR_TEST_ACCOUNT_IDS.includes(id))) {
  identity = account;
  await invoke("qrAdmissionRead", { action: "list" }, 403);
}
assert.equal(rpcCalls.length, latest);
identity = QR_TEST_ACCOUNT_IDS[0];
anonymous = true;
await invoke("qrAdmissionRead", { action: "list" }, 401);
anonymous = false;
authFailure = true;
await invoke("qrAdmissionRead", { action: "list" }, 401);
assert.equal(rpcCalls.length, latest);
assert.ok(browserCalls.every((call) => !call.url.includes(token)));
identity = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6";
authFailure = false;
{
  const response = await worker.fetch(
    new Request(QR_TEST_ORIGIN + "/admin/mfa", { headers: { cookie: cookie() } }),
    env,
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(
    html.includes("Защита входа ADMIN_TEST"),
    "Nested admin MFA must render its own screen",
  );
  assert.ok(!html.includes("Управление TEST"), "Parent landing must not hide child admin screens");
}
// v10 administration stays available only to its exact account and still requires live MFA.
for (const path of ["/admin/violations", "/admin/intakes"]) {
  const authBefore = authCalls,
    rpcBefore = rpcCalls.length;
  const response = await worker.fetch(
    new Request(QR_TEST_ORIGIN + path, { headers: { cookie: cookie() } }),
    env,
    { waitUntil() {} },
  );
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.ok(
    html.includes("Памятка для всех ролей"),
    "Nested v10 administration screen must render",
  );
  assert.ok(!html.includes("Управление TEST"));
  assert.equal(authCalls, authBefore + 1);
  assert.equal(rpcCalls.length, rpcBefore);
}
const incidentDenied = await invoke("incidentAction", { action: "context", payload: {} });
assert.equal(incidentDenied.result.ok, false); // Synthetic session is aal1, no MFA elevation.
for (const account of QR_TEST_ACCOUNT_IDS) {
  identity = account;
  await invoke("incidentAction", { action: "context", payload: {} }, 403);
}
for (const path of ["/admin/violations", "/admin/intakes"]) {
  const anonymous = await worker.fetch(new Request(QR_TEST_ORIGIN + path), env, { waitUntil() {} });
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get("location"), "/login?next=" + path);
  identity = QR_TEST_ACCOUNT_IDS[1];
  const denied = await worker.fetch(
    new Request(QR_TEST_ORIGIN + path, { headers: { cookie: cookie() } }),
    env,
    { waitUntil() {} },
  );
  assert.equal(denied.status, 403);
  const html = await denied.text();
  assert.ok(html.includes("ADMIN_TEST"));
  assert.ok(html.includes("/login?next=" + path));
}
// SSR renders one selected scanner and performs only the outer verified-session Auth check.
identity = QR_TEST_ACCOUNT_IDS[1];
authFailure = false;
for (const [path, expected, absent] of [
  ["/scan", "Сканер TEST", "Проверка двух сканеров"],
  ["/scan?qa=timed", "Проверка двух сканеров", "<h1>Сканер TEST</h1>"],
]) {
  const authBefore = authCalls,
    rpcBefore = rpcCalls.length;
  const response = await worker.fetch(
    new Request(QR_TEST_ORIGIN + path, { headers: { cookie: cookie() } }),
    env,
    { waitUntil() {} },
  );
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.ok(html.includes(expected), path);
  assert.ok(!html.includes(absent), path);
  assert.equal(
    authCalls,
    authBefore + 1,
    "Only outer session verification may call Auth during SSR",
  );
  assert.equal(
    rpcCalls.length,
    rpcBefore,
    "Scanner SSR must not calibrate, verify, catalog, or check in",
  );
}
for (const page of ["pass", "qr"]) {
  const before = rpcCalls.length;
  const response = await worker.fetch(
    new Request(QR_TEST_ORIGIN + `/member/${page}?event=${id}&participation=${id}`, {
      headers: { cookie: cookie() },
    }),
    env,
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes(token));
  assert.ok(!html.includes("Synthetic venue"));
  assert.equal(rpcCalls.length, before, "Owner SSR never issues or reveals private data");
}
console.log(
  JSON.stringify(
    {
      status: "PASS",
      serverFunctions: 18,
      browserSerializer: "installed TanStack",
      network: "fully mocked",
      realDatabase: "NOT VERIFIED",
      getReadOnly: true,
      postCommandOnly: true,
      verifiedIdentity: true,
      threeExactQrAccounts: true,
      noTokenInGetOrErrors: true,
      noServiceRole: true,
      absentRpcFailsClosed: true,
      selectedScannerOnly: true,
      inertScannerSSR: true,
      noPrivateOwnerSSR: true,
      exactPublicProbeScope: true,
      nestedAdminMfaRendered: true,
      v10AdminBoundariesPreserved: true,
      immutableEnvelopesDeniedWithoutFrameworkLogs: true,
      latestAdminLoginReturnPreserved: true,
    },
    null,
    2,
  ),
);
