/**
 * Server-side contract. Transport remains request-scoped and independently gated.
 * Database ownership is always derived from auth.uid(), never from this adapter.
 */
import { validDraftReference, type DraftReference } from "./questionnaire-draft";
import { isUuid } from "./applications";
import { CONSENT_VERSION } from "./delivery";
import { validateMembershipInput, type MembershipValues } from "./membership";
import { parseQuestionnaireSnapshot, type QuestionnaireSnapshot } from "./questionnaire-contract";

export type MembershipQuestionnaireReceipt = {
  requestId: string;
  ownerUserId: string;
  correlationId: string;
  questionnaireVersion: 3;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
export type MembershipQuestionnaireCommand = {
  idempotencyKey: string;
  intake: MembershipValues;
  questionnaire: QuestionnaireSnapshot;
  consentVersion: string;
  draftReference?: DraftReference;
};

/**
 * One operation must create the membership request, immutable questionnaire,
 * consent record and metadata-only audit atomically. A replay of the same owner
 * + key + normalized command returns the same receipt/correlation. A changed
 * command with that key must return conflict, never silently replace answers.
 * Owner identity MUST be auth.uid() within the database transaction, not this DTO.
 */
export interface MembershipQuestionnairePort {
  getVerifiedUser(): Promise<{ id: string } | null>;
  submitAtomic(
    command: MembershipQuestionnaireCommand,
  ): Promise<
    | { ok: true; receipt: MembershipQuestionnaireReceipt; outcome: "created" | "replay" }
    | { ok: false; reason: "conflict" | "unavailable" }
  >;
  readOwnRequest(requestId: string): Promise<MembershipQuestionnaireReceipt | null>;
  listOwnRequests?(): Promise<MembershipQuestionnaireReceipt[]>;
}

type Failure = {
  ok: false;
  reason: "unconfigured" | "signin" | "invalid" | "conflict" | "unavailable" | "notfound";
};

function validReceipt(value: MembershipQuestionnaireReceipt, owner: string): boolean {
  return (
    !!value &&
    isUuid(value.requestId) &&
    value.ownerUserId === owner &&
    isUuid(value.correlationId) &&
    value.questionnaireVersion === 3 &&
    ["pending", "approved", "rejected"].includes(value.status) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}

function publicReceipt(value: MembershipQuestionnaireReceipt): MembershipQuestionnaireReceipt {
  // Return an allowlist even if a future transport supplies extra internal fields.
  return {
    requestId: value.requestId,
    ownerUserId: value.ownerUserId,
    correlationId: value.correlationId,
    questionnaireVersion: value.questionnaireVersion,
    status: value.status,
    createdAt: value.createdAt,
  };
}

/** Does not accept a client-specified owner, status, role or membership ID. */
export async function submitMembershipQuestionnaireDraft(
  input: unknown,
  port?: MembershipQuestionnairePort,
): Promise<
  Failure | { ok: true; receipt: MembershipQuestionnaireReceipt; outcome: "created" | "replay" }
> {
  if (!port) return { ok: false, reason: "unconfigured" };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, reason: "invalid" };
  const data = input as Record<string, unknown>;
  const keys = [
    "idempotencyKey",
    "name",
    "email",
    "telegram",
    "event",
    "consent",
    "questionnaireVersion",
    "questionnaire",
    "ratings",
    "age",
    "draftReference",
  ];
  if (
    Object.keys(data).some((key) => !keys.includes(key)) ||
    !isUuid(data["idempotencyKey"]) ||
    data["consent"] !== true ||
    (data["draftReference"] !== undefined && !validDraftReference(data["draftReference"]))
  )
    return { ok: false, reason: "invalid" };
  const intake = validateMembershipInput({
    name: data["name"],
    email: data["email"],
    telegram: data["telegram"],
    event: data["event"],
  });
  const questionnaire = parseQuestionnaireSnapshot({
    questionnaireVersion: data["questionnaireVersion"],
    questionnaire: data["questionnaire"],
    ratings: data["ratings"],
    age: data["age"],
  });
  if (!intake.ok || !questionnaire.ok) return { ok: false, reason: "invalid" };
  try {
    const user = await port.getVerifiedUser();
    if (!user || !isUuid(user.id)) return { ok: false, reason: "signin" };
    const result = await port.submitAtomic({
      idempotencyKey: data["idempotencyKey"],
      intake: intake.values,
      questionnaire: questionnaire.snapshot,
      consentVersion: CONSENT_VERSION,
      ...(validDraftReference(data["draftReference"])
        ? { draftReference: data["draftReference"] }
        : {}),
    });
    if (!result.ok)
      return { ok: false, reason: result.reason === "conflict" ? "conflict" : "unavailable" };
    if (!validReceipt(result.receipt, user.id) || !["created", "replay"].includes(result.outcome))
      return { ok: false, reason: "unavailable" };
    return { ok: true, receipt: publicReceipt(result.receipt), outcome: result.outcome };
  } catch {
    // Never log questionnaire answers, contact information or transport errors.
    return { ok: false, reason: "unavailable" };
  }
}

/** Cabinet linkage uses the same membership request ID, never an event application ID. */
export async function readMyMembershipQuestionnaireDraft(
  requestId: unknown,
  port?: MembershipQuestionnairePort,
): Promise<Failure | { ok: true; receipt: MembershipQuestionnaireReceipt }> {
  if (!port) return { ok: false, reason: "unconfigured" };
  if (!isUuid(requestId)) return { ok: false, reason: "invalid" };
  try {
    const user = await port.getVerifiedUser();
    if (!user || !isUuid(user.id)) return { ok: false, reason: "signin" };
    const receipt = await port.readOwnRequest(requestId);
    if (!receipt || receipt.requestId !== requestId || !validReceipt(receipt, user.id))
      return { ok: false, reason: "notfound" };
    return { ok: true, receipt: publicReceipt(receipt) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function listMyMembershipQuestionnaires(
  port?: MembershipQuestionnairePort,
): Promise<Failure | { ok: true; items: MembershipQuestionnaireReceipt[] }> {
  if (!port) return { ok: false, reason: "unconfigured" };
  try {
    const user = await port.getVerifiedUser();
    if (!user || !isUuid(user.id)) return { ok: false, reason: "signin" };
    if (!port.listOwnRequests) return { ok: false, reason: "unavailable" };
    const items = await port.listOwnRequests();
    if (
      !Array.isArray(items) ||
      items.length > 50 ||
      items.some((item) => !validReceipt(item, user.id)) ||
      new Set(items.map((item) => item.requestId)).size !== items.length
    )
      return { ok: false, reason: "unavailable" };
    return { ok: true, items: items.map(publicReceipt) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
