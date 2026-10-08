import { parseCreateIncident, UUID, hasForbiddenNoteCharacters } from "./incident-contract.ts";

export const INCIDENT_TEST_PROJECT = "xrocuwlofxhxoxajukne";
export const INCIDENT_RPC = {
  context: "vne_incident_context",
  lookup: "vne_incident_lookup",
  read: "vne_incident_read",
  record: "vne_incident_record",
  append: "vne_incident_append",
  intakeList: "vne_intake_list",
  intakeRead: "vne_intake_read",
  intakeReview: "vne_intake_review",
} as const;
export type Action = keyof typeof INCIDENT_RPC;
export type ServerConfiguration = { enabled: boolean; mode?: string; projectUrl?: string };
export type TrustedIdentity = {
  userId: string;
  claimsSubject: string;
  aal: string;
  anonymous: boolean;
};
export interface IncidentPort {
  verifyIdentity(): Promise<TrustedIdentity | null>;
  rpc(
    name: (typeof INCIDENT_RPC)[Action],
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string } | null }>;
}
export type IncidentResponse =
  | { ok: true; data: unknown }
  | {
      ok: false;
      reason:
        | "unconfigured"
        | "invalid"
        | "signin"
        | "mfa"
        | "forbidden"
        | "conflict"
        | "rate_limited"
        | "unavailable";
    };
const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && Object.keys(v).every((k) => keys.includes(k));
export function incidentsEnabled(c: ServerConfiguration): boolean {
  if (!c["enabled"] || c["mode"] !== "test" || !c["projectUrl"]) return false;
  try {
    const url = new URL(c["projectUrl"]);
    return (
      url.origin === `https://${INCIDENT_TEST_PROJECT}.supabase.co` &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
function argsFor(action: Action, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("invalid");
  if (action === "context") {
    if (!exact(value, [])) throw new Error("invalid");
    return {};
  }
  if (action === "intakeList") {
    if (
      !exact(value, ["status", "page"]) ||
      (value["status"] !== null &&
        !["pending", "approved", "rejected"].includes(String(value["status"]))) ||
      !Number.isSafeInteger(value["page"]) ||
      Number(value["page"]) < 0 ||
      Number(value["page"]) > 10000
    )
      throw new Error("invalid");
    return { _status: value["status"], _page: value["page"] };
  }
  if (action === "intakeRead") {
    if (!exact(value, ["requestId"]) || !id(value["requestId"])) throw new Error("invalid");
    return { _request: value["requestId"] };
  }
  if (action === "intakeReview") {
    if (
      !exact(value, ["requestId", "operationId", "expectedStatus", "decision", "reason"]) ||
      !id(value["requestId"]) ||
      !id(value["operationId"]) ||
      value["expectedStatus"] !== "pending" ||
      !["approved", "rejected"].includes(String(value["decision"])) ||
      typeof value["reason"] !== "string" ||
      value["reason"].replace(/\s/gu, "").length < 3 ||
      value["reason"].length > 1000 ||
      hasForbiddenNoteCharacters(value["reason"])
    )
      throw new Error("invalid");
    return { _command: { ...value, reason: value["reason"].normalize("NFC").trim() } };
  }
  if (action === "record") return { _command: parseCreateIncident(value) };
  if (action === "lookup") {
    if (
      !exact(value, ["eventId", "mode", "value"]) ||
      !id(value["eventId"]) ||
      !["id", "name", "qr"].includes(String(value["mode"])) ||
      typeof value["value"] !== "string" ||
      value["value"].length > 128
    )
      throw new Error("invalid");
    const raw = value["value"].trim();
    if (value["mode"] === "id" && !id(raw)) throw new Error("invalid");
    if (value["mode"] === "name" && (raw.length < 2 || raw.length > 80)) throw new Error("invalid");
    if (value["mode"] === "qr" && !/^VNE1:[A-Za-z0-9_-]{43}$/.test(raw)) throw new Error("invalid");
    return { _event: value["eventId"], _mode: value["mode"], _value: raw };
  }
  if (action === "read") {
    if (
      !exact(value, ["eventId", "userId", "incidentId"]) ||
      !id(value["eventId"]) ||
      !id(value["userId"]) ||
      (value["incidentId"] !== null && !id(value["incidentId"]))
    )
      throw new Error("invalid");
    return { _event: value["eventId"], _user: value["userId"], _incident: value["incidentId"] };
  }
  if (
    !exact(value, [
      "incidentId",
      "operationId",
      "expectedVersion",
      "kind",
      "reason",
      "decision",
      "restrictionDays",
      "referenceEventId",
      "replacementType",
    ]) ||
    !id(value["incidentId"]) ||
    !id(value["operationId"]) ||
    !Number.isSafeInteger(value["expectedVersion"]) ||
    Number(value["expectedVersion"]) < 1 ||
    ![
      "decision",
      "correction",
      "appeal",
      "appeal_resolution",
      "account_note",
      "restriction_request",
      "restriction_approved",
      "restriction_rejected",
      "appeal_upheld",
    ].includes(String(value["kind"]))
  )
    throw new Error("invalid");
  if (
    typeof value["reason"] !== "string" ||
    value["reason"].replace(/\s/gu, "").length < 3 ||
    value["reason"].length > 1000 ||
    hasForbiddenNoteCharacters(value["reason"])
  )
    throw new Error("invalid");
  // The database repeats all enum, relationship, duration, version and organizer checks.
  return { _command: { ...value, reason: value["reason"].normalize("NFC").trim() } };
}
function noSecretFields(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (Array.isArray(value))
    return value["length"] <= 250 && value["every"]((v) => noSecretFields(v, depth + 1));
  if (!isRecord(value))
    return value === null || ["string", "number", "boolean"].includes(typeof value);
  return Object.entries(value).every(
    ([k, v]) =>
      !/password|token|hash|claims|cookie|secret|authorization|user_metadata|app_metadata/i.test(
        k,
      ) && noSecretFields(v, depth + 1),
  );
}
function replyShape(action: Action, v: unknown, payload: unknown): boolean {
  if (!isRecord(v)) return false;
  const text = (x: unknown, max = 1000) => typeof x === "string" && x.length <= max;
  const date = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
  const count = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const status = (x: unknown) => ["pending", "approved", "rejected"].includes(String(x));
  if (action === "intakeList")
    return (
      exact(v, ["items", "page", "hasMore"]) &&
      count(v["page"]) &&
      typeof v["hasMore"] === "boolean" &&
      Array.isArray(v["items"]) &&
      v["items"].length <= 26 &&
      v["items"].every(
        (r) =>
          isRecord(r) &&
          exact(r, ["requestId", "ownerUserId", "status", "createdAt", "questionnaireVersion"]) &&
          id(r["requestId"]) &&
          id(r["ownerUserId"]) &&
          status(r["status"]) &&
          date(r["createdAt"]) &&
          r["questionnaireVersion"] === "3",
      )
    );
  if (action === "intakeReview")
    return (
      exact(v, ["requestId", "reviewId", "decision", "replayed"]) &&
      isRecord(payload) &&
      v["requestId"] === payload["requestId"] &&
      id(v["reviewId"]) &&
      ["approved", "rejected"].includes(String(v["decision"])) &&
      typeof v["replayed"] === "boolean"
    );
  if (action === "intakeRead") {
    if (!exact(v, ["item"])) return false;
    if (v["item"] === null) return true;
    const item = v["item"];
    if (
      !isRecord(item) ||
      !isRecord(payload) ||
      !exact(item, [
        "requestId",
        "ownerUserId",
        "displayName",
        "contactEmail",
        "telegramUsername",
        "status",
        "createdAt",
        "questionnaire",
        "consentVersion",
      ]) ||
      item["requestId"] !== payload["requestId"] ||
      !id(item["ownerUserId"]) ||
      !text(item["displayName"], 80) ||
      !text(item["contactEmail"], 254) ||
      !text(item["telegramUsername"], 32) ||
      !status(item["status"]) ||
      !date(item["createdAt"]) ||
      !text(item["consentVersion"], 80)
    )
      return false;
    const q = item["questionnaire"];
    if (
      !isRecord(q) ||
      !exact(q, ["version", "questions", "ratings", "age"]) ||
      q["version"] !== 3 ||
      !Number.isInteger(q["age"]) ||
      Number(q["age"]) < 1 ||
      Number(q["age"]) > 100 ||
      !Array.isArray(q["questions"]) ||
      q["questions"].length !== 7 ||
      !Array.isArray(q["ratings"]) ||
      q["ratings"].length !== 3
    )
      return false;
    return (
      q["questions"].every(
        (a) =>
          isRecord(a) &&
          exact(a, ["id", "label", "answers"]) &&
          text(a["id"], 40) &&
          text(a["label"], 240) &&
          Array.isArray(a["answers"]) &&
          a["answers"].length >= 1 &&
          a["answers"].length <= 3 &&
          a["answers"].every(
            (b) =>
              isRecord(b) &&
              exact(b, ["text", "source"]) &&
              text(b["text"], 120) &&
              ["choice", "custom", "manual"].includes(String(b["source"])),
          ),
      ) &&
      q["ratings"].every(
        (a) =>
          isRecord(a) &&
          exact(a, ["id", "label", "minLabel", "maxLabel", "value"]) &&
          text(a["id"], 40) &&
          text(a["label"], 240) &&
          text(a["minLabel"], 120) &&
          text(a["maxLabel"], 120) &&
          Number.isInteger(a["value"]) &&
          Number(a["value"]) >= 1 &&
          Number(a["value"]) <= 100,
      )
    );
  }
  if (action === "context")
    return (
      exact(v, ["events"]) &&
      Array.isArray(v["events"]) &&
      v["events"].length <= 250 &&
      v["events"].every(
        (e) =>
          isRecord(e) &&
          exact(e, ["id", "title", "canRecord", "canRestrict"]) &&
          id(e["id"]) &&
          text(e["title"], 120) &&
          typeof e["canRecord"] === "boolean" &&
          typeof e["canRestrict"] === "boolean",
      )
    );
  if (action === "lookup")
    return (
      exact(v, ["outcome", "candidates"]) &&
      ["confirm_exact_person", "unlinked_account"].includes(String(v["outcome"])) &&
      Array.isArray(v["candidates"]) &&
      v["candidates"].length <= 20 &&
      v["candidates"].every(
        (c) =>
          isRecord(c) &&
          exact(c, ["userId", "displayName"]) &&
          id(c["userId"]) &&
          text(c["displayName"], 80),
      )
    );
  if (action === "record" || action === "append")
    return (
      id(v["incidentId"]) &&
      id(v["ledgerEventId"]) &&
      (v["replayed"] === true
        ? exact(v, ["incidentId", "ledgerEventId", "replayed"])
        : v["replayed"] === false &&
          exact(v, ["incidentId", "ledgerEventId", "version", "replayed", "correlationId"]) &&
          count(v["version"]) &&
          Number(v["version"]) > 0 &&
          id(v["correlationId"]))
    );
  if (!isRecord(payload)) return false;
  if (Object.hasOwn(v, "item")) {
    if (!exact(v, ["item"])) return false;
    if (v["item"] === null) return true;
    const item = v["item"];
    if (
      !isRecord(item) ||
      !exact(item, [
        "id",
        "eventId",
        "userId",
        "originalType",
        "originalReason",
        "createdAt",
        "createdBy",
        "history",
        "limited",
      ]) ||
      item["id"] !== payload["incidentId"] ||
      item["userId"] !== payload["userId"] ||
      item["eventId"] !== payload["eventId"] ||
      !id(item["createdBy"]) ||
      !text(item["originalType"], 40) ||
      !text(item["originalReason"]) ||
      !date(item["createdAt"]) ||
      typeof item["limited"] !== "boolean" ||
      !Array.isArray(item["history"]) ||
      item["history"].length > 201
    )
      return false;
    return item["history"].every(
      (h) =>
        isRecord(h) &&
        exact(h, [
          "id",
          "sequence",
          "kind",
          "reason",
          "decision",
          "restrictionUntil",
          "replacementType",
          "referenceEventId",
          "actorId",
          "recordedAt",
          "requestedDays",
        ]) &&
        id(h["id"]) &&
        count(h["sequence"]) &&
        text(h["kind"], 32) &&
        text(h["reason"]) &&
        (h["decision"] === null || text(h["decision"], 40)) &&
        (h["restrictionUntil"] === null || date(h["restrictionUntil"])) &&
        (h["replacementType"] === null || text(h["replacementType"], 40)) &&
        (h["referenceEventId"] === null || id(h["referenceEventId"])) &&
        (h["requestedDays"] === null ||
          (Number.isSafeInteger(h["requestedDays"]) &&
            Number(h["requestedDays"]) >= 1 &&
            Number(h["requestedDays"]) <= 90)) &&
        id(h["actorId"]) &&
        date(h["recordedAt"]),
    );
  }
  return (
    exact(v, [
      "eventId",
      "userId",
      "totalRecords",
      "recordsWithMeasures",
      "pendingReview",
      "activeRestrictions",
      "items",
      "limited",
      "scope",
    ]) &&
    v["eventId"] === payload["eventId"] &&
    v["userId"] === payload["userId"] &&
    v["scope"] === "selected_event" &&
    [
      v["totalRecords"],
      v["recordsWithMeasures"],
      v["pendingReview"],
      v["activeRestrictions"],
    ].every(count) &&
    typeof v["limited"] === "boolean" &&
    Array.isArray(v["items"]) &&
    v["items"].length <= 101 &&
    v["items"].every(
      (e) =>
        isRecord(e) &&
        exact(e, [
          "id",
          "type",
          "createdAt",
          "decision",
          "restrictionUntil",
          "version",
          "hasOpenAppeal",
          "restrictionRequestPending",
        ]) &&
        id(e["id"]) &&
        text(e["type"], 40) &&
        date(e["createdAt"]) &&
        (e["decision"] === null || text(e["decision"], 40)) &&
        (e["restrictionUntil"] === null || date(e["restrictionUntil"])) &&
        count(e["version"]) &&
        typeof e["hasOpenAppeal"] === "boolean" &&
        typeof e["restrictionRequestPending"] === "boolean",
    )
  );
}
/** No service key or D1 actor. Database RPC rechecks live session, admission and current scoped role. */
export async function runIncidentAction(input: {
  configuration: ServerConfiguration;
  action: Action;
  payload: unknown;
  requestUrl: string;
  origin: string | null;
  method: string;
  openPort: () => Promise<IncidentPort>;
}): Promise<IncidentResponse> {
  if (!incidentsEnabled(input.configuration)) return { ok: false, reason: "unconfigured" };
  if (input.method !== "POST") return { ok: false, reason: "invalid" };
  try {
    if (!input.origin || new URL(input.origin).origin !== new URL(input.requestUrl).origin)
      return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  let args: Record<string, unknown>;
  try {
    if (!Object.hasOwn(INCIDENT_RPC, input.action)) return { ok: false, reason: "invalid" };
    const encoded = JSON.stringify(input.payload);
    if (!encoded || new TextEncoder().encode(encoded).length > 16384)
      return { ok: false, reason: "invalid" };
    args = argsFor(input.action, input.payload);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  try {
    const port = await input.openPort();
    const actor = await port.verifyIdentity();
    if (!actor || !id(actor.userId) || actor.claimsSubject !== actor.userId || actor.anonymous)
      return { ok: false, reason: "signin" };
    if (actor.aal !== "aal2") return { ok: false, reason: "mfa" };
    const reply = await port.rpc(INCIDENT_RPC[input.action], args);
    if (reply.error) {
      const code = reply.error.code;
      return {
        ok: false,
        reason:
          code === "42501"
            ? "forbidden"
            : code === "40001"
              ? "conflict"
              : code === "P0001"
                ? "rate_limited"
                : code === "22023"
                  ? "invalid"
                  : "unavailable",
      };
    }
    if (!noSecretFields(reply.data) || !replyShape(input.action, reply.data, input.payload))
      return { ok: false, reason: "unavailable" };
    return { ok: true, data: reply.data };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
