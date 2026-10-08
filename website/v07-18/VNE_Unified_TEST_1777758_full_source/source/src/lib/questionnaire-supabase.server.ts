import { DRAFT_RPC } from "./questionnaire-draft.server";
import { readAuthConfig } from "./auth/config";
import type {
  MembershipQuestionnairePort,
  MembershipQuestionnaireReceipt,
} from "./questionnaire-persistence.server";

export const QUESTIONNAIRE_RPC = {
  submit: "vne_submit_membership_questionnaire",
  read: "vne_read_my_membership_questionnaires",
} as const;

/** Disabled by default. This flag is not an access grant or real-data consent. */
export function readQuestionnaireAvailability(env: Record<string, string | undefined>) {
  const config = readAuthConfig(env);
  const configured = Boolean(env["VNE_SUPABASE_URL"] || env["SUPABASE_URL"]);
  return {
    configured,
    enabled: configured && config.enabled && env["VNE_MEMBERSHIP_QUESTIONNAIRE"] === "test",
  };
}

/** A request-scoped publishable-key client; never pass an admin/service-role client. */
export type QuestionnaireRequestClient = {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string; is_anonymous?: boolean } | null };
      error: unknown;
    }>;
  };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Calls only the two narrowly named future public wrappers. Their creation/access
 * remains a separate approval; neither the private schema nor tables are exposed.
 * Database/session checks must use this same caller's verified Supabase identity.
 */
export function createQuestionnairePort(
  client: QuestionnaireRequestClient,
): MembershipQuestionnairePort {
  return {
    async getVerifiedUser() {
      const { data, error } = await client.auth.getUser();
      return error || !data.user || data.user.is_anonymous ? null : { id: data.user.id };
    },
    async submitAtomic(command) {
      const { draftReference, ...submission } = command;
      const { data, error } = await client.rpc(
        draftReference ? DRAFT_RPC.submit : QUESTIONNAIRE_RPC.submit,
        { _command: submission, ...(draftReference ? { _draft: draftReference } : {}) },
      );
      if (error || !object(data)) return { ok: false, reason: "unavailable" };
      if (data["ok"] !== true)
        return { ok: false, reason: data["reason"] === "conflict" ? "conflict" : "unavailable" };
      if (
        !object(data["receipt"]) ||
        (data["outcome"] !== "created" && data["outcome"] !== "replay")
      )
        return { ok: false, reason: "unavailable" };
      // The adapter validates owner, identifier shapes and projects returned fields.
      return {
        ok: true,
        receipt: data["receipt"] as MembershipQuestionnaireReceipt,
        outcome: data["outcome"],
      };
    },
    async readOwnRequest(requestId) {
      const { data, error } = await client.rpc(QUESTIONNAIRE_RPC.read, { _request: requestId });
      if (error) throw new Error("questionnaire_read_unavailable");
      if (!Array.isArray(data) || data.length > 1) throw new Error("questionnaire_read_invalid");
      return (data[0] ?? null) as MembershipQuestionnaireReceipt | null;
    },
    async listOwnRequests() {
      const { data, error } = await client.rpc(QUESTIONNAIRE_RPC.read, { _request: null });
      if (error || !Array.isArray(data)) throw new Error("questionnaire_read_unavailable");
      return data as MembershipQuestionnaireReceipt[];
    },
  };
}
