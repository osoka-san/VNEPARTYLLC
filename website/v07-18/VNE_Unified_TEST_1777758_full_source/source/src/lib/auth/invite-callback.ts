/**
 * Fail-closed завершение auth callback. Новые auth cookies выдаются ТОЛЬКО при verdict accepted|not_required.
 * На любом отказе/исключении: cookies от exchange отбрасываются, auth-cookies явно истекают,
 * сессия отзывается (user signOut → при ошибке admin signOut); невозможность отзыва сообщается отдельно.
 * Токены/nonce не логируются.
 */
export type Verdict = "accepted" | "not_required" | "denied" | string;
export type FinishDeps = {
  getUserId: () => Promise<string | null>;
  accept: (userId: string, tokenHash: string | null) => Promise<Verdict>;
  revokeAsUser: () => Promise<boolean>;
  revokeAsAdmin: () => Promise<boolean>;
};
export type FinishResult = { ok: true; to: string } | { ok: false; to: string; revoked: boolean };

export const INVITE_NONCE_RE = /^[A-Za-z0-9_-]{32,128}$/;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function finishCallback(
  deps: FinishDeps,
  tokenHash: string | null,
  next: string,
): Promise<FinishResult> {
  let reason = "network";
  try {
    const uid = await deps.getUserId();
    if (!uid) reason = "invalid";
    else {
      const verdict = await deps.accept(uid, tokenHash);
      if (verdict === "accepted" || verdict === "not_required") return { ok: true, to: next };
      reason = "invite";
    }
  } catch {
    reason = "network";
  }
  let revoked = await safe(deps.revokeAsUser, false);
  if (!revoked) revoked = await safe(deps.revokeAsAdmin, false);
  return { ok: false, to: `/login?error=${revoked ? reason : "revoke"}`, revoked };
}

/** Истекающие Set-Cookie для всех auth-cookies запроса и exchange (sb-*), без значений. */
export function expireAuthCookies(requestCookieNames: string[], pendingNames: string[]) {
  const names = new Set(
    [...requestCookieNames, ...pendingNames].filter((n) => n.startsWith("sb-")),
  );
  return [...names].map((name) => ({
    name,
    value: "",
    options: { path: "/", maxAge: 0, sameSite: "lax" as const },
  }));
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
