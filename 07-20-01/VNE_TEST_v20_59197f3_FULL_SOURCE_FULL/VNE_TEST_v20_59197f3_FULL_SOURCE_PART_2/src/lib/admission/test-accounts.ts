import { DAY07_MEMBER_TEST_ID, SCANNER_TEST_ACCOUNT_IDS } from "../auth/scanner-test-accounts.ts";

export { DAY07_MEMBER_TEST_ID, SCANNER_TEST_ACCOUNT_IDS };
export const QR_TEST_ORIGIN = "https://vne-test-20261007.can-avci48.chatgpt.site";
export const QR_TEST_SUPABASE = "https://xrocuwlofxhxoxajukne.supabase.co";
export const QR_TEST_ACCOUNT_IDS = Object.freeze([
  DAY07_MEMBER_TEST_ID,
  ...SCANNER_TEST_ACCOUNT_IDS,
]);

/** An explicit environment scope, never an admission or staff-role grant. */
export function qrTestAccountsConfigured(env: Record<string, string | undefined>): boolean {
  const raw = env["VNE_QR_TEST_ACCOUNT_IDS"];
  if (!raw) return false;
  const ids = raw.split(",").map((id) => id.trim());
  return (
    ids.length === 3 &&
    new Set(ids).size === 3 &&
    QR_TEST_ACCOUNT_IDS.every((id) => ids.includes(id))
  );
}
export function qrAdmissionConfigured(
  env: Record<string, string | undefined>,
  origin: string,
): boolean {
  return (
    env["VNE_TEST_VARIANT"] === "qr-admission-only" &&
    env["VNE_QR_ADMISSION"] === "test-explicit-v2" &&
    env["VNE_TEST_AUTH_MODE"] === "supabase-synthetic" &&
    env["VNE_AUTH_ENV"] === "staging" &&
    env["VNE_SITE_URL"] === QR_TEST_ORIGIN &&
    origin === QR_TEST_ORIGIN &&
    env["VNE_SUPABASE_URL"] === QR_TEST_SUPABASE &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(env["VNE_SUPABASE_PUBLISHABLE_KEY"] ?? "") &&
    env["VNE_DELIVERY_MODE"] === "disabled" &&
    qrTestAccountsConfigured(env)
  );
}
