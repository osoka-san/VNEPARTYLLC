import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  SECRET_CONTRACT,
  parseAdmissionInput,
  parseAdmissionReadResult,
  parseAdmissionCommandResult,
  admissionError,
  type AdmissionAvailability,
  type AdmissionReadInput,
  type AdmissionCommandInput,
  type AdmissionReadResult,
  type AdmissionCommandResult,
  type AdmissionFailure,
} from "./contract";
import {
  QR_TEST_ORIGIN,
  QR_TEST_SUPABASE,
  QR_TEST_ACCOUNT_IDS,
  qrAdmissionConfigured,
} from "./test-accounts";

function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Vary", "Cookie");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
async function open(method: "GET" | "POST") {
  const request = getRequest();
  if (
    !qrAdmissionConfigured(process.env, new URL(request.url).origin) ||
    request.method !== method ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (method === "POST" && request.headers.get("origin") !== QR_TEST_ORIGIN)
  )
    return null;
  const { createRequestClient, getAuthConfig } = await import("../auth/supabase.server");
  const config = getAuthConfig();
  if (!config.enabled || config.url !== QR_TEST_SUPABASE || config.siteUrl !== QR_TEST_ORIGIN)
    return null;
  return createRequestClient(request);
}
async function flush(context: NonNullable<Awaited<ReturnType<typeof open>>>) {
  if (!context.pending.length) return;
  const { serializeCookieHeader } = await import("@supabase/ssr");
  const last = [...new Map(context.pending.map((cookie) => [cookie.name, cookie])).values()];
  setResponseHeader(
    "Set-Cookie",
    last.map((cookie) => serializeCookieHeader(cookie.name, cookie.value, cookie.options)),
  );
}
async function verifiedActor(context: NonNullable<Awaited<ReturnType<typeof open>>>) {
  // getSession and caller-supplied identity headers are never identity evidence.
  const { data, error } = await context.supabase.auth.getUser();
  return !error && data.user?.is_anonymous === false && QR_TEST_ACCOUNT_IDS.includes(data.user.id)
    ? data.user.id
    : null;
}
export const getQrAdmissionAvailability = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdmissionAvailability> => {
    privateResponse();
    const base = {
      secretContract: SECRET_CONTRACT,
      simulated: true as const,
      reentryAllowed: false as const,
    };
    const context = await open("GET");
    if (!context) return { ...base, enabled: false, reason: "unconfigured" };
    try {
      const actor = await verifiedActor(context);
      // This confirms only the transport configuration. The read command checks live DB authority.
      return { ...base, enabled: !!actor, reason: actor ? null : "forbidden" };
    } catch {
      return { ...base, enabled: false, reason: "unavailable" };
    } finally {
      await flush(context);
    }
  },
);
async function execute(
  data: unknown,
  method: "GET" | "POST",
): Promise<AdmissionReadResult | AdmissionCommandResult> {
  privateResponse();
  const input = parseAdmissionInput(data, method);
  if (!input) return { ok: false, reason: "invalid" };
  const context = await open(method);
  if (!context) return { ok: false, reason: "unconfigured" };
  try {
    const actor = await verifiedActor(context);
    if (!actor) return { ok: false, reason: "forbidden" };
    // Narrow planned public wrapper only; it is absent until separately approved DB activation.
    // The authenticated cookie session supplies auth.uid(); no service key or identity parameter.
    const { data: result, error } = await context.supabase.rpc("vne_qr_command", {
      _command: input,
    });
    if (error) return admissionError(error.code, error.message);
    const parsed =
      method === "GET"
        ? parseAdmissionReadResult(input as AdmissionReadInput, result)
        : parseAdmissionCommandResult(input as AdmissionCommandInput, result);
    if (parsed.ok && "receipt" in parsed && parsed.receipt && parsed.receipt.actorId !== actor)
      return { ok: false, reason: "unavailable" } satisfies AdmissionFailure;
    return parsed;
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    await flush(context);
  }
}
export const qrAdmissionRead = createServerFn({ method: "GET" })
  .inputValidator((input: AdmissionReadInput) => input)
  .handler(
    async ({ data }): Promise<AdmissionReadResult> =>
      execute(data, "GET") as Promise<AdmissionReadResult>,
  );
export const qrAdmissionCommand = createServerFn({ method: "POST" })
  .inputValidator((input: AdmissionCommandInput) => input)
  .handler(
    async ({ data }): Promise<AdmissionCommandResult> =>
      execute(data, "POST") as Promise<AdmissionCommandResult>,
  );
