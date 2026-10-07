// Acknowledges technical storage only. This is never permission to start tracking.
export const COOKIE_NOTICE_KEY = "vne.cookie-notice";
export const COOKIE_NOTICE_VERSION = 1;
export const COOKIE_NOTICE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
export type CookieNoticeRecord = { version: number; scope: "technical"; acceptedAt: number };
export type CookieNoticeStorage = Pick<Storage, "getItem" | "setItem">;

export function parseCookieNotice(raw: string | null, now = Date.now()): CookieNoticeRecord | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (
      record["version"] !== COOKIE_NOTICE_VERSION ||
      record["scope"] !== "technical" ||
      typeof record["acceptedAt"] !== "number" ||
      !Number.isFinite(record["acceptedAt"]) ||
      record["acceptedAt"] > now ||
      now - record["acceptedAt"] >= COOKIE_NOTICE_MAX_AGE
    )
      return null;
    return { version: COOKIE_NOTICE_VERSION, scope: "technical", acceptedAt: record["acceptedAt"] };
  } catch {
    return null;
  }
}

export function cookieNoticeStorage(): CookieNoticeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCookieNotice(storage: CookieNoticeStorage | null, now = Date.now()) {
  try {
    return parseCookieNotice(storage?.getItem(COOKIE_NOTICE_KEY) ?? null, now);
  } catch {
    return null;
  }
}

export function saveCookieNotice(storage: CookieNoticeStorage | null, now = Date.now()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(
      COOKIE_NOTICE_KEY,
      JSON.stringify({ version: COOKIE_NOTICE_VERSION, scope: "technical", acceptedAt: now }),
    );
    return true;
  } catch {
    return false;
  }
}
