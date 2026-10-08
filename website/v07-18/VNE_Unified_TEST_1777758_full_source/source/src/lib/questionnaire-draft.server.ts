import { isUuid } from "./applications";
import {
  parseDraftRecord,
  parseDraftSaveCommand,
  type DraftLoadResult,
  type DraftSaveResult,
} from "./questionnaire-draft";
import type { QuestionnaireRequestClient } from "./questionnaire-supabase.server";

export const DRAFT_RPC = {
  read: "vne_read_my_questionnaire_draft",
  save: "vne_save_my_questionnaire_draft",
  submit: "vne_submit_membership_questionnaire_with_draft",
} as const;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** RPCs remain closed until their exact activation is separately approved. No service-role fallback. */
export async function readOwnedQuestionnaireDraft(
  client: QuestionnaireRequestClient,
): Promise<DraftLoadResult> {
  try {
    const { data: identity, error: authError } = await client.auth.getUser();
    if (authError || !identity.user || identity.user.is_anonymous || !isUuid(identity.user.id))
      return { ok: false, reason: "signin" };
    const { data, error } = await client.rpc(DRAFT_RPC.read, {});
    if (error?.code === "42501") return { ok: false, reason: "signin" };
    if (
      error ||
      !object(data) ||
      data["ownerUserId"] !== identity.user.id ||
      typeof data["submitted"] !== "boolean" ||
      typeof data["creationIssuedAt"] !== "string" ||
      !Number.isFinite(Date.parse(data["creationIssuedAt"]))
    )
      return { ok: false, reason: "unavailable" };
    const draft = data["draft"] === null ? null : parseDraftRecord(data["draft"]);
    if ((data["draft"] !== null && !draft) || (data["submitted"] && draft))
      return { ok: false, reason: "unavailable" };
    return {
      ok: true,
      ownerUserId: identity.user.id,
      creationIssuedAt: data["creationIssuedAt"],
      draft,
      submitted: data["submitted"],
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
export async function saveOwnedQuestionnaireDraft(
  input: unknown,
  client: QuestionnaireRequestClient,
): Promise<DraftSaveResult> {
  const command = parseDraftSaveCommand(input);
  if (!command) return { ok: false, reason: "invalid" };
  try {
    const { data: identity, error: authError } = await client.auth.getUser();
    if (authError || !identity.user || identity.user.is_anonymous || !isUuid(identity.user.id))
      return { ok: false, reason: "signin" };
    if (identity.user.id !== command.expectedOwnerUserId)
      return { ok: false, reason: "session_changed" };
    const { data, error } = await client.rpc(DRAFT_RPC.save, { _command: command });
    if (error?.code === "42501") return { ok: false, reason: "signin" };
    if (error?.code === "22023") return { ok: false, reason: "invalid" };
    if (error || !object(data)) return { ok: false, reason: "unavailable" };
    if (data["ok"] !== true) {
      const reason = data["reason"];
      return {
        ok: false,
        reason:
          reason === "conflict" ||
          reason === "expired" ||
          reason === "submitted" ||
          reason === "session_changed"
            ? reason
            : "unavailable",
      };
    }
    const draft = parseDraftRecord(data["draft"]);
    if (
      data["ownerUserId"] !== identity.user.id ||
      !draft ||
      draft.id !== command.id ||
      draft.version !== command.expectedVersion + 1 ||
      JSON.stringify(draft.payload) !== JSON.stringify(command.payload)
    )
      return { ok: false, reason: "unavailable" };
    return { ok: true, ownerUserId: identity.user.id, draft };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
