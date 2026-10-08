/** Wire contract reconstructed from the deployed private.qr_command explicit-v2 definitions. */
export const ADMISSION_PAYLOAD_LIMIT = 8192;
export const SECRET_CONTRACT = "explicit-rotation-v2" as const;
export const ADMISSION_OUTCOMES = [
  "eligible",
  "not_found",
  "test_only",
  "event_unavailable",
  "participation_inactive",
  "approval_required",
  "member_revoked",
  "window_required",
  "expired",
  "used",
  "legacy_disabled",
  "before_release",
  "not_issued",
  "active",
  "revoked",
  "before_reveal",
  "address_unconfigured",
  "ready",
  "invalid_token",
  "rate_limited",
  "replaced",
  "too_early",
  "version_conflict",
  "already_issued",
  "issued",
  "rotated",
  "simulated_accepted",
] as const;
export type AdmissionOutcome = (typeof ADMISSION_OUTCOMES)[number];
export type AdmissionFailure = {
  ok: false;
  reason: "invalid" | "forbidden" | "unconfigured" | "conflict" | "unavailable";
};
export type AdmissionAvailability = {
  enabled: boolean;
  reason: AdmissionFailure["reason"] | null;
  secretContract: typeof SECRET_CONTRACT;
  simulated: true;
  reentryAllowed: false;
};
export type AdmissionReadInput =
  { action: "list" } | { action: "status" | "address"; eventId: string; participationId: string };
export type AdmissionCommandInput =
  | { action: "catalog" }
  | {
      action: "issue" | "rotate" | "revoke";
      eventId: string;
      participationId: string;
      operationId: string;
      expectedVersion: number;
      reason: string;
    }
  | { action: "verify"; eventId: string; token: string }
  | {
      action: "checkin";
      eventId: string;
      token: string;
      operationId: string;
      expectedVersion: number;
    };
export type AdmissionPass = {
  participationId: string;
  eventId: string;
  eventTitle: string;
  timezone: string;
  qrReleaseAt: string | null;
  addressRevealAt: string | null;
  entryOpensAt: string | null;
  entryClosesAt: string | null;
  passId: string | null;
  version: number;
  generation: number;
  status: AdmissionOutcome;
  secretContract: typeof SECRET_CONTRACT;
  secretUnavailable: boolean;
  simulated: true;
  reentryAllowed: false;
};
export type AdmissionAddress = {
  outcome: AdmissionOutcome;
  addressAvailable: boolean;
  address: string | null;
  addressRevealAt: string | null;
  timezone: string | null;
};
export type AdmissionEvent = { eventId: string; eventTitle: string; timezone: string };
export type AdmissionReceipt = {
  operationId: string | null;
  correlationId: string;
  action: "issue" | "rotate" | "revoke" | "verify" | "checkin";
  outcome: AdmissionOutcome;
  eventId: string;
  participationId: string | null;
  passId: string | null;
  generation: number | null;
  version: number | null;
  actorId: string;
  at: string;
  simulated: true;
  reentryAllowed: false;
};
export type AdmissionReadResult =
  | AdmissionFailure
  | {
      ok: true;
      items: AdmissionPass[];
      pass: AdmissionPass | null;
      address: AdmissionAddress | null;
    };
export type AdmissionCommandResult =
  | AdmissionFailure
  | {
      ok: true;
      receipt: AdmissionReceipt | null;
      events: AdmissionEvent[];
      qrText: string | null;
      replayed: boolean;
      secretUnavailable: boolean;
    };
type ObjectValue = Record<string, unknown>;
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const object = (v: unknown): v is ObjectValue =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const exact = (v: ObjectValue, required: string[], optional: string[] = []) =>
  required.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const text = (v: unknown, max = 500): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max && !/VNE[12]:/.test(v);
const timestamp = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 64 && Number.isFinite(Date.parse(v));
const outcome = (v: unknown): v is AdmissionOutcome =>
  ADMISSION_OUTCOMES.includes(v as AdmissionOutcome);
const QA_PROBE_EVENT = "d0700000-0000-4000-8000-000000000001";
function isPublicQaProbe(value: unknown, eventId: string): value is string {
  return (
    eventId === QA_PROBE_EVENT &&
    (value === "DAY07_CLOCK_PROBE" || value === "DAY07_REHEARSAL_PROBE")
  );
}
export const isAdmissionToken = (v: unknown): v is string =>
  typeof v === "string" && /^VNE2:[A-Za-z0-9_-]{43}$/.test(v);
export function admissionPayloadBounded(value: unknown): boolean {
  try {
    const raw = JSON.stringify(value);
    return !!raw && new TextEncoder().encode(raw).length <= ADMISSION_PAYLOAD_LIMIT;
  } catch {
    return false;
  }
}
export function parseAdmissionInput(
  value: unknown,
  method: "GET" | "POST",
): AdmissionReadInput | AdmissionCommandInput | null {
  if (!admissionPayloadBounded(value) || !object(value)) return null;
  const action = value["action"];
  if (method === "GET" && action === "list") return exact(value, ["action"]) ? { action } : null;
  if (method === "POST" && action === "catalog")
    return exact(value, ["action"]) ? { action } : null;
  if (!uuid(value["eventId"])) return null;
  const eventId = value["eventId"];
  if (method === "GET" && (action === "status" || action === "address")) {
    return exact(value, ["action", "eventId", "participationId"]) && uuid(value["participationId"])
      ? { action, eventId, participationId: value["participationId"] }
      : null;
  }
  if (method !== "POST") return null;
  if (action === "verify")
    return exact(value, ["action", "eventId", "token"]) &&
      (isAdmissionToken(value["token"]) || isPublicQaProbe(value["token"], eventId))
      ? { action, eventId, token: value["token"] }
      : null;
  if (!uuid(value["operationId"]) || !integer(value["expectedVersion"])) return null;
  const operationId = value["operationId"],
    expectedVersion = value["expectedVersion"];
  if (action === "checkin")
    return exact(value, ["action", "eventId", "token", "operationId", "expectedVersion"]) &&
      isAdmissionToken(value["token"])
      ? { action, eventId, token: value["token"], operationId, expectedVersion }
      : null;
  if (
    (action === "issue" || action === "rotate" || action === "revoke") &&
    exact(value, [
      "action",
      "eventId",
      "participationId",
      "operationId",
      "expectedVersion",
      "reason",
    ]) &&
    uuid(value["participationId"]) &&
    text(value["reason"], 300) &&
    value["reason"].trim().length >= 3
  ) {
    return {
      action,
      eventId,
      participationId: value["participationId"],
      operationId,
      expectedVersion,
      reason: value["reason"].trim(),
    };
  }
  return null;
}
const passKeys = [
  "participationId",
  "eventId",
  "eventTitle",
  "timezone",
  "qrReleaseAt",
  "addressRevealAt",
  "entryOpensAt",
  "entryClosesAt",
  "passId",
  "version",
  "generation",
  "status",
  "secretContract",
  "secretUnavailable",
  "simulated",
  "reentryAllowed",
];
function isPass(v: unknown): v is AdmissionPass {
  return (
    object(v) &&
    exact(v, passKeys) &&
    uuid(v["participationId"]) &&
    uuid(v["eventId"]) &&
    text(v["eventTitle"]) &&
    text(v["timezone"], 100) &&
    (v["passId"] === null || uuid(v["passId"])) &&
    ["qrReleaseAt", "addressRevealAt", "entryOpensAt", "entryClosesAt"].every(
      (k) => v[k] === null || timestamp(v[k]),
    ) &&
    integer(v["version"]) &&
    integer(v["generation"]) &&
    outcome(v["status"]) &&
    v["secretContract"] === SECRET_CONTRACT &&
    typeof v["secretUnavailable"] === "boolean" &&
    v["simulated"] === true &&
    v["reentryAllowed"] === false
  );
}
export function parseAdmissionReadResult(
  input: AdmissionReadInput,
  value: unknown,
): AdmissionReadResult {
  const fail: AdmissionFailure = { ok: false, reason: "unavailable" };
  if (!object(value)) return fail;
  const base = { ok: true as const, items: [] as AdmissionPass[], pass: null, address: null };
  if (input.action === "list")
    return exact(value, ["items", "secretContract"]) &&
      value["secretContract"] === SECRET_CONTRACT &&
      Array.isArray(value["items"]) &&
      value["items"].length <= 1000 &&
      value["items"].every(isPass)
      ? { ...base, items: value["items"] }
      : fail;
  if (input.action === "status")
    return exact(value, ["pass"]) &&
      isPass(value["pass"]) &&
      value["pass"].eventId === input.eventId &&
      value["pass"].participationId === input.participationId
      ? { ...base, pass: value["pass"] }
      : fail;
  if (
    !exact(value, ["outcome", "addressAvailable"], ["address", "addressRevealAt", "timezone"]) ||
    !outcome(value["outcome"]) ||
    typeof value["addressAvailable"] !== "boolean"
  )
    return fail;
  if (
    value["addressAvailable"]
      ? value["outcome"] !== "ready" || !text(value["address"], 1000)
      : value["address"] != null
  )
    return fail;
  if (value["addressRevealAt"] !== undefined && !timestamp(value["addressRevealAt"])) return fail;
  if (value["timezone"] !== undefined && !text(value["timezone"], 100)) return fail;
  return {
    ...base,
    address: {
      outcome: value["outcome"],
      addressAvailable: value["addressAvailable"],
      address: (value["address"] as string | undefined) ?? null,
      addressRevealAt: (value["addressRevealAt"] as string | undefined) ?? null,
      timezone: (value["timezone"] as string | undefined) ?? null,
    },
  };
}
const receiptKeys = [
  "operationId",
  "correlationId",
  "action",
  "outcome",
  "eventId",
  "participationId",
  "passId",
  "generation",
  "version",
  "actorId",
  "at",
  "simulated",
  "reentryAllowed",
];
function isReceipt(v: unknown): v is AdmissionReceipt {
  return (
    object(v) &&
    exact(v, receiptKeys) &&
    (v["operationId"] === null || uuid(v["operationId"])) &&
    uuid(v["correlationId"]) &&
    ["issue", "rotate", "revoke", "verify", "checkin"].includes(String(v["action"])) &&
    outcome(v["outcome"]) &&
    uuid(v["eventId"]) &&
    (v["participationId"] === null || uuid(v["participationId"])) &&
    (v["passId"] === null || uuid(v["passId"])) &&
    (v["generation"] === null || integer(v["generation"])) &&
    (v["version"] === null || integer(v["version"])) &&
    uuid(v["actorId"]) &&
    timestamp(v["at"]) &&
    v["simulated"] === true &&
    v["reentryAllowed"] === false
  );
}
export function parseAdmissionCommandResult(
  input: AdmissionCommandInput,
  value: unknown,
): AdmissionCommandResult {
  const fail: AdmissionFailure = { ok: false, reason: "unavailable" };
  if (!object(value)) return fail;
  if (input.action === "catalog") {
    if (
      !exact(value, ["events"]) ||
      !Array.isArray(value["events"]) ||
      value["events"].length > 1000 ||
      !value["events"].every(
        (v) =>
          object(v) &&
          exact(v, ["eventId", "eventTitle", "timezone"]) &&
          uuid(v["eventId"]) &&
          text(v["eventTitle"]) &&
          text(v["timezone"], 100),
      )
    )
      return fail;
    return {
      ok: true,
      receipt: null,
      events: value["events"] as AdmissionEvent[],
      qrText: null,
      replayed: false,
      secretUnavailable: true,
    };
  }
  if (
    !exact(value, ["receipt", "replayed", "secretUnavailable"], ["qrText"]) ||
    !isReceipt(value["receipt"]) ||
    value["receipt"].action !== input.action ||
    value["receipt"].eventId !== input.eventId ||
    value["receipt"].operationId !== ("operationId" in input ? input.operationId : null) ||
    ("participationId" in input && value["receipt"].participationId !== input.participationId) ||
    typeof value["replayed"] !== "boolean" ||
    typeof value["secretUnavailable"] !== "boolean"
  )
    return fail;
  const receivesSecret =
    !value["replayed"] &&
    ((input.action === "issue" && value["receipt"].outcome === "issued") ||
      (input.action === "rotate" && value["receipt"].outcome === "rotated"));
  if (
    receivesSecret
      ? !isAdmissionToken(value["qrText"]) || value["secretUnavailable"]
      : value["qrText"] !== undefined || !value["secretUnavailable"]
  )
    return fail;
  return {
    ok: true,
    receipt: value["receipt"],
    events: [],
    qrText: receivesSecret ? (value["qrText"] as string) : null,
    replayed: value["replayed"],
    secretUnavailable: value["secretUnavailable"],
  };
}
export function admissionError(code: unknown, message?: unknown): AdmissionFailure {
  // Only fixed codes and exact known messages are inspected. Raw provider errors never escape.
  if (code === "42501") return { ok: false, reason: "forbidden" };
  if (code === "55000" || code === "PGRST202" || code === "42883")
    return { ok: false, reason: "unconfigured" };
  if (code === "22023")
    return { ok: false, reason: message === "idempotency_conflict" ? "conflict" : "invalid" };
  return { ok: false, reason: "unavailable" };
}
