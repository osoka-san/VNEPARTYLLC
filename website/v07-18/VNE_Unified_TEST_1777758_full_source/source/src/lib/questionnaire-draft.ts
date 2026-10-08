import { isUuid } from "./applications";
import {
  createQuestionnaireState,
  QUESTIONNAIRE_QUESTIONS,
  QUESTIONNAIRE_RATING_QUESTIONS,
  type QuestionnaireState,
} from "./questionnaire";

export const DRAFT_RETENTION_DAYS = 67;
export const DRAFT_MAX_BYTES = 32768;
export const DRAFT_SECTIONS = ["questionnaire", "contact", "event"] as const;
export type DraftSection = (typeof DRAFT_SECTIONS)[number];
export type QuestionnaireDraftPayload = {
  schemaVersion: 1;
  questionnaireVersion: 3;
  name: string;
  contact: string;
  telegram: string;
  event: string | null;
  resumeSection: DraftSection;
  questionnaire: QuestionnaireState;
};
export type QuestionnaireDraftRecord = {
  id: string;
  version: number;
  payload: QuestionnaireDraftPayload;
  savedAt: string;
  expiresAt: string;
};
export type DraftReference = { id: string; version: number };
export type DraftSaveCommand = {
  // An equality guard against a changed session, never an ownership assertion.
  expectedOwnerUserId: string;
  creationIssuedAt: string;
  id: string;
  expectedVersion: number;
  mutationId: string;
  payload: QuestionnaireDraftPayload;
};
export type DraftFailure = {
  ok: false;
  reason:
    | "unconfigured"
    | "signin"
    | "session_changed"
    | "invalid"
    | "conflict"
    | "expired"
    | "submitted"
    | "unavailable";
};
export type DraftLoadResult =
  | DraftFailure
  | {
      ok: true;
      ownerUserId: string;
      creationIssuedAt: string;
      draft: QuestionnaireDraftRecord | null;
      submitted: boolean;
    };
export type DraftSaveResult =
  | DraftFailure
  | {
      ok: true;
      ownerUserId: string;
      draft: QuestionnaireDraftRecord;
    };
export function emptyDraftPayload(): QuestionnaireDraftPayload {
  return {
    schemaVersion: 1,
    questionnaireVersion: 3,
    name: "",
    contact: "",
    telegram: "",
    event: null,
    resumeSection: "questionnaire",
    questionnaire: createQuestionnaireState(),
  };
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function keys(v: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(v).length === names.length && names.every((name) => Object.hasOwn(v, name));
}
function text(v: unknown, max: number): v is string {
  return (
    typeof v === "string" &&
    v["length"] <= max &&
    !Array.from(v).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    })
  );
}
function scale(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100);
}
export function validDraftReference(v: unknown): v is DraftReference {
  return (
    record(v) &&
    keys(v, ["id", "version"]) &&
    isUuid(v["id"]) &&
    Number.isSafeInteger(v["version"]) &&
    Number(v["version"]) > 0
  );
}
/** Partial and temporarily invalid answers are preserved; required fields/word counts are submission-only. */
export function parseDraftPayload(input: unknown): QuestionnaireDraftPayload | null {
  try {
    if (
      new TextEncoder().encode(JSON.stringify(input)).length > DRAFT_MAX_BYTES ||
      !record(input) ||
      !keys(input, [
        "schemaVersion",
        "questionnaireVersion",
        "name",
        "contact",
        "telegram",
        "event",
        "resumeSection",
        "questionnaire",
      ]) ||
      input["schemaVersion"] !== 1 ||
      input["questionnaireVersion"] !== 3 ||
      !text(input["name"], 80) ||
      !text(input["contact"], 254) ||
      !text(input["telegram"], 256) ||
      !(
        input["event"] === null ||
        (typeof input["event"] === "string" && /^[a-z0-9-]{3,64}$/.test(input["event"]))
      ) ||
      !DRAFT_SECTIONS.includes(input["resumeSection"] as DraftSection)
    )
      return null;
    const q = input["questionnaire"];
    if (
      !record(q) ||
      !keys(q, ["mode", "answers", "ratings", "age"]) ||
      !["choices", "manual"].includes(String(q["mode"])) ||
      !record(q["answers"]) ||
      !keys(
        q["answers"],
        QUESTIONNAIRE_QUESTIONS.map(({ id }) => id),
      ) ||
      !record(q["ratings"]) ||
      !keys(
        q["ratings"],
        QUESTIONNAIRE_RATING_QUESTIONS.map(({ id }) => id),
      ) ||
      !scale(q["age"])
    )
      return null;
    const state = createQuestionnaireState();
    state.mode = q["mode"] as QuestionnaireState["mode"];
    state.age = q["age"];
    for (const { id, options } of QUESTIONNAIRE_QUESTIONS) {
      const a = q["answers"][id];
      if (
        !record(a) ||
        !keys(a, ["selected", "custom", "useCustom", "manual"]) ||
        !Array.isArray(a["selected"]) ||
        a["selected"].length > 3 ||
        new Set(a["selected"]).size !== a["selected"].length ||
        a["selected"].some(
          (s) => typeof s !== "string" || !(options as readonly string[]).includes(s),
        ) ||
        !text(a["custom"], 120) ||
        typeof a["useCustom"] !== "boolean" ||
        !(
          a["manual"] === null ||
          (Array.isArray(a["manual"]) &&
            a["manual"].length <= 3 &&
            a["manual"].every((s) => text(s, 120)))
        )
      )
        return null;
      state.answers[id] = {
        selected: [...a["selected"]] as string[],
        custom: a["custom"],
        useCustom: a["useCustom"],
        manual: a["manual"] === null ? null : ([...a["manual"]] as string[]),
      };
    }
    for (const { id } of QUESTIONNAIRE_RATING_QUESTIONS) {
      const value = q["ratings"][id];
      if (!scale(value)) return null;
      state.ratings[id] = value;
    }
    return {
      schemaVersion: 1,
      questionnaireVersion: 3,
      name: input["name"],
      contact: input["contact"],
      telegram: input["telegram"],
      event: input["event"] as string | null,
      resumeSection: input["resumeSection"] as DraftSection,
      questionnaire: state,
    };
  } catch {
    return null;
  }
}
export function parseDraftSaveCommand(input: unknown): DraftSaveCommand | null {
  if (
    !record(input) ||
    !keys(input, [
      "expectedOwnerUserId",
      "creationIssuedAt",
      "id",
      "expectedVersion",
      "mutationId",
      "payload",
    ]) ||
    !isUuid(input["expectedOwnerUserId"]) ||
    typeof input["creationIssuedAt"] !== "string" ||
    input["creationIssuedAt"].length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      input["creationIssuedAt"],
    ) ||
    !Number.isFinite(Date.parse(input["creationIssuedAt"])) ||
    !isUuid(input["id"]) ||
    !isUuid(input["mutationId"]) ||
    !Number.isSafeInteger(input["expectedVersion"]) ||
    Number(input["expectedVersion"]) < 0
  )
    return null;
  const payload = parseDraftPayload(input["payload"]);
  return payload
    ? {
        expectedOwnerUserId: input["expectedOwnerUserId"],
        creationIssuedAt: input["creationIssuedAt"],
        id: input["id"],
        expectedVersion: Number(input["expectedVersion"]),
        mutationId: input["mutationId"],
        payload,
      }
    : null;
}
export function parseDraftRecord(input: unknown): QuestionnaireDraftRecord | null {
  if (
    !record(input) ||
    !keys(input, ["id", "version", "payload", "savedAt", "expiresAt"]) ||
    !isUuid(input["id"]) ||
    !Number.isSafeInteger(input["version"]) ||
    Number(input["version"]) < 1 ||
    typeof input["savedAt"] !== "string" ||
    typeof input["expiresAt"] !== "string" ||
    !Number.isFinite(Date.parse(input["savedAt"])) ||
    !Number.isFinite(Date.parse(input["expiresAt"])) ||
    Math.abs(
      Date.parse(input["expiresAt"]) -
        Date.parse(input["savedAt"]) -
        DRAFT_RETENTION_DAYS * 86400000,
    ) > 1
  )
    return null;
  const payload = parseDraftPayload(input["payload"]);
  return payload
    ? {
        id: input["id"],
        version: Number(input["version"]),
        payload,
        savedAt: input["savedAt"],
        expiresAt: input["expiresAt"],
      }
    : null;
}
