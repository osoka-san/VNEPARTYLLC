/** Self-service-only TEST bootstrap. No staff, admission, password or recovery mutations. */
import { SCANNER_TEST_ACCOUNT_IDS } from "./scanner-test-accounts.ts";
export type OwnFactor = { id: string; type: string; status: string };
export interface ScannerMfaPort {
  identity(): Promise<{
    userId: string;
    claimsUserId: string;
    anonymous: boolean;
    aal: string | null;
  } | null>;
  factors(): Promise<OwnFactor[]>;
  enrollTotp(): Promise<{ id: string; qr: string; secret: string }>;
  verifyTotp(factorId: string, code: string): Promise<boolean>;
}
export type MfaFailure = {
  ok: false;
  reason:
    | "unconfigured"
    | "forbidden"
    | "existing_factor"
    | "factor_required"
    | "invalid"
    | "code_invalid"
    | "unavailable";
};
async function ownIdentity(enabled: boolean, port: ScannerMfaPort) {
  if (!enabled) return null;
  const user = await port.identity();
  return user &&
    SCANNER_TEST_ACCOUNT_IDS.includes(user.userId) &&
    user.claimsUserId === user.userId &&
    user.anonymous === false
    ? user
    : null;
}
export async function scannerMfaState(enabled: boolean, port: ScannerMfaPort) {
  if (!enabled) return { ok: false as const, reason: "unconfigured" as const };
  const user = await ownIdentity(enabled, port);
  if (!user) return { ok: false as const, reason: "forbidden" as const };
  const factors = await port.factors();
  const verified = factors.filter((f) => f.status === "verified");
  const pending = factors.filter((f) => f.type === "totp" && f.status === "unverified");
  return {
    ok: true as const,
    // This is the server-verified caller, not a client-selected scanner identity.
    userId: user.userId,
    aal2: user.aal === "aal2",
    hasVerifiedTotp: verified.some((f) => f.type === "totp"),
    hasOtherVerifiedFactor: verified.some((f) => f.type !== "totp"),
    pendingFactorId: pending.length === 1 ? pending[0]!.id : null,
  };
}
export async function beginScannerTotp(
  enabled: boolean,
  port: ScannerMfaPort,
): Promise<MfaFailure | { ok: true; factorId: string; qr: string; secret: string }> {
  if (!enabled) return { ok: false, reason: "unconfigured" };
  if (!(await ownIdentity(enabled, port))) return { ok: false, reason: "forbidden" };
  const factors = await port.factors();
  // Never add a new factor at aal1 when the account already has verified MFA.
  if (factors.some((f) => f.status === "verified")) return { ok: false, reason: "existing_factor" };
  const created = await port.enrollTotp();
  return { ok: true, factorId: created.id, qr: created.qr, secret: created.secret };
}
export async function completeScannerTotp(
  enabled: boolean,
  port: ScannerMfaPort,
  input: unknown,
): Promise<MfaFailure | { ok: true }> {
  if (!enabled) return { ok: false, reason: "unconfigured" };
  if (!(await ownIdentity(enabled, port))) return { ok: false, reason: "forbidden" };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, reason: "invalid" };
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((k) => k !== "code" && k !== "factorId") ||
    typeof value["code"] !== "string" ||
    !/^\d{6}$/.test(value["code"]) ||
    (value["factorId"] !== undefined &&
      value["factorId"] !== null &&
      typeof value["factorId"] !== "string")
  )
    return { ok: false, reason: "invalid" };
  const factors = await port.factors();
  const verified = factors.filter((f) => f.status === "verified");
  const candidates = verified.length
    ? verified.filter((f) => f.type === "totp")
    : factors.filter((f) => f.type === "totp" && f.status === "unverified");
  const chosen = value["factorId"]
    ? candidates.find((f) => f.id === value["factorId"])
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (!chosen)
    return { ok: false, reason: verified.length ? "existing_factor" : "factor_required" };
  const ok = await port.verifyTotp(chosen.id, value["code"]);
  return ok ? { ok: true } : { ok: false, reason: "code_invalid" };
}
