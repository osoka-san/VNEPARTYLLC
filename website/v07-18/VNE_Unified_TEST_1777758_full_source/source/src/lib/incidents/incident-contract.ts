/** Isolated proposal. This module never fetches, mutates a database, or grants access. */
export const INCIDENT_TYPES = [
  ["camera", "Съёмка / камера"],
  ["access_sharing", "Передача доступа"],
  ["location_disclosure", "Разглашение локации"],
  ["prohibited_items", "Запрещённые предметы"],
  ["disrespect_safety", "Неуважение / безопасность"],
  ["other", "Другое"],
] as const;
export const DECISIONS = [
  ["warning", "Предупреждение"],
  ["require_correction", "Попросить устранить нарушение"],
  ["remove_event", "Удаление с мероприятия"],
  ["request_restriction", "Запросить ограничение до 90 дней"],
  ["refer_organizer", "Передать организатору"],
  ["close_no_action", "Закрыть без мер"],
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number][0];
export type Decision = (typeof DECISIONS)[number][0];
export type EffectiveDecision = Exclude<Decision, "request_restriction"> | "restrict_temporary";
export type LedgerKind =
  | "decision"
  | "correction"
  | "appeal"
  | "appeal_resolution"
  | "account_note"
  | "restriction_request"
  | "restriction_approved"
  | "restriction_rejected"
  | "appeal_upheld";
export type ActorContext = {
  id: string;
  authenticated: boolean;
  sessionActive: boolean;
  aal: "aal1" | "aal2";
  admitted: boolean;
  assignments: {
    role: "owner" | "admin" | "moderator" | "scanner" | "incident_operator" | "incident_manager";
    eventId: string | null;
    active: boolean;
  }[];
};
export type CreateIncident = {
  eventId: string;
  userId: string;
  operationId: string;
  confirmedTarget: true;
  type: IncidentType;
  reason: string;
  decision: Decision;
  restrictionDays: number | null;
};
export type DecisionEvent = {
  id?: string;
  referenceEventId?: string | null;
  incidentId: string;
  sequence: number;
  kind: LedgerKind;
  decision: EffectiveDecision | null;
  recordedAt: string;
  restrictionUntil: string | null;
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isType = (value: unknown): value is IncidentType =>
  INCIDENT_TYPES.some(([id]) => id === value);
const isDecision = (value: unknown): value is Decision => DECISIONS.some(([id]) => id === value);
export function hasForbiddenNoteCharacters(value: string): boolean {
  return Array.from(value).some((char) => {
    const n = char.codePointAt(0)!;
    return (
      n <= 8 ||
      n === 11 ||
      n === 12 ||
      (n >= 14 && n <= 31) ||
      (n >= 127 && n <= 159) ||
      (n >= 0x202a && n <= 0x202e) ||
      (n >= 0x2066 && n <= 0x2069)
    );
  });
}
const cleanReason = (value: unknown): string | null => {
  if (typeof value !== "string" || value["length"] > 1000 || hasForbiddenNoteCharacters(value))
    return null;
  const clean = value["normalize"]("NFC").trim();
  return clean.replace(/\s/gu, "").length >= 3 && clean.length <= 1000 ? clean : null;
};
/** Context must be reconstructed on the trusted server, never accepted from form/JWT metadata. */
export function canRecordForEvent(actor: ActorContext, eventId: string): boolean {
  return (
    actor.authenticated &&
    actor.sessionActive &&
    actor.aal === "aal2" &&
    actor.admitted &&
    actor.assignments.some(
      (a) =>
        a["active"] &&
        (a["eventId"] === eventId || (a["role"] === "incident_manager" && a["eventId"] === null)) &&
        (a["role"] === "incident_operator" || a["role"] === "incident_manager"),
    )
  );
}
export function canRestrictAccount(actor: ActorContext, eventId: string): boolean {
  return (
    canRecordForEvent(actor, eventId) &&
    actor.assignments.some(
      (a) =>
        a["active"] &&
        (a["eventId"] === eventId || a["eventId"] === null) &&
        a["role"] === "incident_manager",
    )
  );
}
export function parseCreateIncident(value: unknown): CreateIncident {
  if (!object(value)) throw new Error("INVALID_INPUT");
  const keys = [
    "eventId",
    "userId",
    "operationId",
    "confirmedTarget",
    "type",
    "reason",
    "decision",
    "restrictionDays",
  ];
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new Error("INVALID_INPUT");
  if (
    ![value["eventId"], value["userId"], value["operationId"]].every(
      (v) => typeof v === "string" && UUID.test(v),
    )
  )
    throw new Error("INVALID_ID");
  if (value["confirmedTarget"] !== true) throw new Error("CONFIRM_TARGET_REQUIRED");
  if (!isType(value["type"]) || !isDecision(value["decision"])) throw new Error("INVALID_ENUM");
  const reason = cleanReason(value["reason"]);
  if (!reason) throw new Error("REASON_REQUIRED");
  if (value["decision"] === "request_restriction") {
    if (
      !Number.isInteger(value["restrictionDays"]) ||
      Number(value["restrictionDays"]) < 1 ||
      Number(value["restrictionDays"]) > 90
    )
      throw new Error("INVALID_DURATION");
  } else if (value["restrictionDays"] !== null) throw new Error("UNEXPECTED_DURATION");
  return { ...value, reason } as CreateIncident;
}
export function authorizeCreate(actor: ActorContext, command: CreateIncident): void {
  if (!canRecordForEvent(actor, command.eventId)) throw new Error("FORBIDDEN_EVENT");
  // Every create is at most a request. A separate manager review may activate a restriction.
}
/** A revision cannot repeatedly restart a 90-day restriction for the same incident. */
export function restrictionExpiry(
  days: number,
  now: Date,
  firstRestrictionAt: Date | null = null,
): Date {
  if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isFinite(now.getTime()))
    throw new Error("INVALID_DURATION");
  const anchor = firstRestrictionAt?.getTime() ?? now.getTime();
  const end = now.getTime() + days * 86400000;
  if (!Number.isFinite(anchor) || end > anchor + 90 * 86400000)
    throw new Error("NO_ROLLING_EXTENSION");
  return new Date(end);
}
/** Name search never selects someone automatically, even when only one result is returned. */
export function selectConfirmedTarget(
  candidateIds: readonly string[],
  selectedId: string | null,
  confirmed: boolean,
): string {
  if (!selectedId || !confirmed || !UUID.test(selectedId) || !candidateIds.includes(selectedId))
    throw new Error("EXACT_TARGET_REQUIRED");
  return selectedId;
}
/** This is a pure metadata summary; authoritative output must come from a server projection. */
export function incidentSummary(events: readonly DecisionEvent[], now: Date) {
  const latest = new Map<string, DecisionEvent>();
  for (const e of events) {
    if (
      (e["kind"] === "decision" ||
        e["kind"] === "appeal_resolution" ||
        e["kind"] === "restriction_approved") &&
      e["decision"] !== null
    ) {
      const old = latest.get(e["incidentId"]);
      if (!old || e["sequence"] > old.sequence) latest.set(e["incidentId"], e);
    }
  }
  const rows = [...latest.values()];
  return {
    totalRecords: new Set(events.map((e) => e["incidentId"])).size,
    recordsWithMeasures: rows.filter(
      (e) => e["decision"] !== "close_no_action" && e["decision"] !== "refer_organizer",
    ).length,
    pendingReview: new Set([
      ...rows.filter((e) => e["decision"] === "refer_organizer").map((e) => e["incidentId"]),
      ...events
        .filter(
          (e) =>
            e["kind"] === "restriction_request" &&
            !events.some(
              (r) =>
                r["incidentId"] === e["incidentId"] &&
                (r["kind"] === "restriction_approved" || r["kind"] === "restriction_rejected") &&
                r["referenceEventId"] === e["id"] &&
                e["id"] !== undefined,
            ),
        )
        .map((e) => e["incidentId"]),
    ]).size,
    activeRestrictions: rows.filter(
      (e) =>
        e["decision"] === "restrict_temporary" &&
        e["restrictionUntil"] !== null &&
        Date.parse(e["restrictionUntil"]) > now.getTime(),
    ).length,
  };
}
