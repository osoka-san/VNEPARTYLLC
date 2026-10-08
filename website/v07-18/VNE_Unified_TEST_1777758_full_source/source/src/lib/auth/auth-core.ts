/**
 * Чистая логика входа/восстановления/MFA поверх минимального интерфейса клиента.
 * Не раскрывает существование аккаунта, не возвращает токены и claims.
 * Используется серверными функциями и unit-тестами с синтетическим клиентом.
 */
import { safeRedirect } from "./safe-redirect";

export type AuthResult = { ok: true; redirect?: string } | { ok: false; message: string };

type Err = {
  message?: string | undefined;
  status?: number | undefined;
  code?: string | undefined;
} | null;

export interface AuthClientLike {
  auth: {
    signInWithPassword(c: { email: string; password: string }): Promise<{ error: Err }>;
    signOut(o: { scope: "local" | "global" }): Promise<{ error: Err }>;
    resetPasswordForEmail(email: string, o: { redirectTo: string }): Promise<{ error: Err }>;
    updateUser(a: { password: string }): Promise<{ error: Err }>;
  };
}

export const MSG = {
  invalid: "Неверный email или пароль.",
  network: "Сервис входа не ответил. Попробуйте позже.",
  recovery: "Если адрес зарегистрирован, мы отправим на него ссылку для восстановления.",
  weak: "Пароль не принят. Используйте не менее 12 символов.",
  input: "Проверьте заполнение полей.",
  rate: "Слишком много попыток. Подождите и попробуйте снова.",
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && EMAIL.test(v);
}
export function validPassword(v: unknown): v is string {
  return typeof v === "string" && v.length >= 12 && v.length <= 128;
}

function isNetwork(e: Err): boolean {
  return !!e && (e.status === undefined || e.status === 0 || (e.status ?? 0) >= 500);
}

export async function performSignIn(
  client: AuthClientLike,
  input: { email: unknown; password: unknown; redirect?: unknown },
): Promise<AuthResult> {
  if (!validEmail(input.email) || typeof input.password !== "string" || !input.password)
    return { ok: false, message: MSG.input };
  try {
    const { error } = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (!error) return { ok: true, redirect: safeRedirect(input.redirect) };
    if (error.status === 429) return { ok: false, message: MSG.rate };
    if (isNetwork(error)) return { ok: false, message: MSG.network };
    // Любая ошибка учётных данных (нет пользователя, неверный пароль, не подтверждён) → одно сообщение.
    return { ok: false, message: MSG.invalid };
  } catch {
    return { ok: false, message: MSG.network };
  }
}

export async function performRecovery(
  client: AuthClientLike,
  input: { email: unknown },
  redirectTo: string,
): Promise<AuthResult> {
  if (!validEmail(input.email)) return { ok: false, message: MSG.input };
  try {
    const { error } = await client.auth.resetPasswordForEmail(input.email, { redirectTo });
    if (error && error.status === 429) return { ok: false, message: MSG.rate };
    if (error && isNetwork(error)) return { ok: false, message: MSG.network };
  } catch {
    return { ok: false, message: MSG.network };
  }
  // Одинаковый ответ для существующих и несуществующих адресов.
  return { ok: true };
}

export async function performPasswordUpdate(
  client: AuthClientLike,
  input: { password: unknown },
): Promise<AuthResult> {
  if (!validPassword(input.password)) return { ok: false, message: MSG.weak };
  try {
    const { error } = await client.auth.updateUser({ password: input.password });
    if (!error) return { ok: true, redirect: "/member" };
    if (isNetwork(error)) return { ok: false, message: MSG.network };
    return { ok: false, message: MSG.weak };
  } catch {
    return { ok: false, message: MSG.network };
  }
}

export type CallbackError = "expired" | "invalid" | "network" | "invite" | "revoke";

export function classifyCallbackError(e: Err): CallbackError {
  if (isNetwork(e)) return "network";
  const t = `${e?.code ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (t.includes("expired") || t.includes("otp_expired")) return "expired";
  return "invalid";
}

export const CALLBACK_MESSAGES: Record<CallbackError, string> = {
  expired: "Ссылка устарела. Запросите новую.",
  invalid: "Ссылка недействительна или уже использована.",
  network: "Не удалось проверить ссылку: сервис не ответил. Попробуйте позже.",
  invite: "Приглашение отозвано, заменено новым или истекло. Вход по этой ссылке закрыт.",
  revoke:
    "Вход по этой ссылке закрыт, но сервис не подтвердил завершение сессии. Закройте вкладку и сообщите команде.",
};

/** Проверка Origin для мутаций (дополнительно к CSRF-middleware TanStack Start). */
export function isSameOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

/** Решение guard для staff-зон: подлинный пользователь И aal2 И актуальное назначение (RPC). */
export type StaffDecision = "unconfigured" | "signin" | "mfa" | "denied" | "allowed" | "error";
export function decideStaff(p: {
  configured: boolean;
  userId: string | null;
  aal: string | null;
  rpcAllowed: boolean | null;
}): StaffDecision {
  if (!p.configured) return "unconfigured";
  if (!p.userId) return "signin";
  if (p.aal !== "aal2") return "mfa";
  if (p.rpcAllowed === null) return "error";
  return p.rpcAllowed ? "allowed" : "denied";
}
