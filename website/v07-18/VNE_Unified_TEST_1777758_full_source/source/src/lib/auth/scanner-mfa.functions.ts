import { emptyActionInput } from "./empty-action-input";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  scannerMfaState,
  beginScannerTotp,
  completeScannerTotp,
  type ScannerMfaPort,
} from "./scanner-mfa-core";

const TEST_ORIGIN = "https://vne-test-20261007.can-avci48.chatgpt.site";
const TEST_SUPABASE = "https://xrocuwlofxhxoxajukne.supabase.co";
async function open(requirePost: boolean) {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Vary", "Cookie");
  setResponseHeader("Referrer-Policy", "no-referrer");
  const request = getRequest();
  if (
    process.env["VNE_TEST_SCANNER_MFA"] !== "enabled" ||
    process.env["VNE_TEST_VARIANT"] !== "questionnaire-only" ||
    process.env["VNE_TEST_AUTH_MODE"] !== "supabase-synthetic" ||
    process.env["VNE_DELIVERY_MODE"] !== "disabled" ||
    new URL(request.url).origin !== TEST_ORIGIN ||
    (requirePost &&
      (request.method !== "POST" ||
        request.headers.get("origin") !== TEST_ORIGIN ||
        request.headers.get("sec-fetch-site") === "cross-site"))
  )
    return null;
  const { createRequestClient, getAuthConfig } = await import("./supabase.server");
  const config = getAuthConfig();
  if (!config.enabled || config.url !== TEST_SUPABASE || config.siteUrl !== TEST_ORIGIN)
    return null;
  const context = createRequestClient(request);
  if (!context) return null;
  const port: ScannerMfaPort = {
    async identity() {
      const { data, error } = await context.supabase.auth.getUser();
      if (error || !data.user || data.user.is_anonymous !== false) return null;
      const { data: claims, error: claimsError } = await context.supabase.auth.getClaims();
      if (claimsError || !claims?.claims?.sub) return null;
      return {
        userId: data.user.id,
        claimsUserId: claims.claims.sub,
        anonymous: false,
        aal: typeof claims.claims.aal === "string" ? claims.claims.aal : null,
      };
    },
    async factors() {
      const { data, error } = await context.supabase.auth.mfa.listFactors();
      if (error || !data) throw new Error("unavailable");
      return data.all.map((f) => ({ id: f.id, type: f.factor_type, status: f.status }));
    },
    async enrollTotp() {
      const { data, error } = await context.supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "VNE TEST SCANNER " + crypto.randomUUID().slice(0, 8),
      });
      if (error || !data) throw new Error("unavailable");
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async verifyTotp(factorId, code) {
      const { error } = await context.supabase.auth.mfa.challengeAndVerify({ factorId, code });
      return !error;
    },
  };
  return { context, port };
}
async function flush(value: NonNullable<Awaited<ReturnType<typeof open>>>) {
  if (!value.context.pending.length) return;
  const { serializeCookieHeader } = await import("@supabase/ssr");
  const last = [...new Map(value.context.pending.map((c) => [c.name, c])).values()];
  setResponseHeader(
    "Set-Cookie",
    last.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
  );
}
export const getScannerMfaState = createServerFn({ method: "GET" }).handler(async () => {
  const state = await open(false);
  if (!state) return { ok: false as const, reason: "unconfigured" as const };
  try {
    return await scannerMfaState(true, state.port);
  } catch {
    return { ok: false as const, reason: "unavailable" as const };
  } finally {
    await flush(state);
  }
});
export const beginScannerMfaEnrollment = createServerFn({ method: "POST" })
  .inputValidator(emptyActionInput)
  .handler(async () => {
    const state = await open(true);
    if (!state) return { ok: false as const, reason: "unconfigured" as const };
    try {
      return await beginScannerTotp(true, state.port);
    } catch {
      return { ok: false as const, reason: "unavailable" as const };
    } finally {
      await flush(state);
    }
  });
export const completeScannerMfaChallenge = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }) => {
    const state = await open(true);
    if (!state) return { ok: false as const, reason: "unconfigured" as const };
    try {
      return await completeScannerTotp(true, state.port, data);
    } catch {
      return { ok: false as const, reason: "unavailable" as const };
    } finally {
      await flush(state);
    }
  });
