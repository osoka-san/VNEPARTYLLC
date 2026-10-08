import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { isSameOrigin } from "./auth/auth-core";
import { DRAFT_MAX_BYTES, type DraftLoadResult, type DraftSaveResult } from "./questionnaire-draft";

async function open() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Vary", "Cookie");
  const { readQuestionnaireAvailability } = await import("./questionnaire-supabase.server");
  if (
    !readQuestionnaireAvailability(process.env).enabled ||
    process.env["VNE_QUESTIONNAIRE_DRAFTS"] !== "test"
  )
    return null;
  const { createRequestClient } = await import("./auth/supabase.server");
  return createRequestClient(getRequest());
}
async function flush(context: NonNullable<Awaited<ReturnType<typeof open>>>) {
  if (!context.pending.length) return;
  const { serializeCookieHeader } = await import("@supabase/ssr");
  setResponseHeader(
    "Set-Cookie",
    context.pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
  );
}
export const getMyQuestionnaireDraft = createServerFn({ method: "GET" }).handler(
  async (): Promise<DraftLoadResult> => {
    const context = await open();
    if (!context) return { ok: false, reason: "unconfigured" };
    try {
      const { readOwnedQuestionnaireDraft } = await import("./questionnaire-draft.server");
      return await readOwnedQuestionnaireDraft(context.supabase);
    } finally {
      await flush(context);
    }
  },
);
export const saveMyQuestionnaireDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<DraftSaveResult> => {
    const context = await open();
    if (!context) return { ok: false, reason: "unconfigured" };
    try {
      const request = getRequest();
      if (!isSameOrigin(request.headers.get("origin"), request.url))
        return { ok: false, reason: "invalid" };
      try {
        if (new TextEncoder().encode(JSON.stringify(data)).length > DRAFT_MAX_BYTES)
          return { ok: false, reason: "invalid" };
      } catch {
        return { ok: false, reason: "invalid" };
      }
      const { saveOwnedQuestionnaireDraft } = await import("./questionnaire-draft.server");
      return await saveOwnedQuestionnaireDraft(data, context.supabase);
    } finally {
      await flush(context);
    }
  });
