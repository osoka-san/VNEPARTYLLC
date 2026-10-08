import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { validDraftReference } from "./questionnaire-draft";
import { isSameOrigin } from "./auth/auth-core";

function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Vary", "Cookie");
}

async function open() {
  const { readQuestionnaireAvailability, createQuestionnairePort } =
    await import("./questionnaire-supabase.server");
  if (!readQuestionnaireAvailability(process.env).enabled) return null;
  const { createRequestClient } = await import("./auth/supabase.server");
  const context = createRequestClient(getRequest());
  if (!context) return null;
  return { ...context, port: createQuestionnairePort(context.supabase) };
}
async function flush(context: NonNullable<Awaited<ReturnType<typeof open>>>) {
  if (!context.pending.length) return;
  const { serializeCookieHeader } = await import("@supabase/ssr");
  setResponseHeader(
    "Set-Cookie",
    context.pending.map((cookie) =>
      serializeCookieHeader(cookie.name, cookie.value, cookie.options),
    ),
  );
}

export const getQuestionnaireAvailability = createServerFn({ method: "GET" }).handler(async () => {
  privateResponse();
  const { readQuestionnaireAvailability } = await import("./questionnaire-supabase.server");
  return readQuestionnaireAvailability(process.env);
});

export const submitOwnedMembershipQuestionnaire = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }) => {
    privateResponse();
    const request = getRequest();
    if (!isSameOrigin(request.headers.get("origin"), request.url))
      return { ok: false as const, reason: "invalid" as const };
    try {
      // Bound decoded payload before walking arrays or contacting Auth/database.
      const serialized = JSON.stringify(data);
      if (!serialized || new TextEncoder().encode(serialized).length > 32768)
        return { ok: false as const, reason: "invalid" as const };
    } catch {
      return { ok: false as const, reason: "invalid" as const };
    }
    const context = await open();
    if (!context) return { ok: false as const, reason: "unconfigured" as const };
    try {
      // The draft rollout uses its atomic finalizer exclusively. Older open clients must reload.
      const hasDraft = !!data && typeof data === "object" && "draftReference" in data;
      const reference = hasDraft ? (data as Record<string, unknown>)["draftReference"] : undefined;
      if (
        process.env["VNE_QUESTIONNAIRE_DRAFTS"] === "test"
          ? !validDraftReference(reference)
          : hasDraft
      )
        return { ok: false as const, reason: "invalid" as const };
      const { submitMembershipQuestionnaireDraft } =
        await import("./questionnaire-persistence.server");
      return await submitMembershipQuestionnaireDraft(data, context.port);
    } finally {
      await flush(context);
    }
  });

export const getMyMembershipQuestionnaires = createServerFn({ method: "GET" }).handler(async () => {
  privateResponse();
  const context = await open();
  if (!context) return { ok: false as const, reason: "unconfigured" as const };
  try {
    const { listMyMembershipQuestionnaires } = await import("./questionnaire-persistence.server");
    return await listMyMembershipQuestionnaires(context.port);
  } finally {
    await flush(context);
  }
});
