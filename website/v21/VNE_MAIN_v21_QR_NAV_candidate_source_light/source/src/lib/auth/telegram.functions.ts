/**
 * Вход и привязка Telegram. Самостоятельной регистрации нет: войти можно только
 * в существующий аккаунт с привязанным Telegram. Уровень сессии — aal1 (участник);
 * staff-зоны по-прежнему требуют TOTP.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { AuthResult } from "./auth-shared";
import { parseTelegramAuth, verifyTelegramAuth } from "./telegram-verify";

const FAIL: AuthResult = { ok: false, message: "Не удалось войти через Telegram." };

async function prep() {
  const { createRequestClient } = await import("./supabase.server");
  const { isSameOrigin } = await import("./auth-core");
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  const req = getRequest();
  if (!isSameOrigin(req.headers.get("origin"), req.url)) return null;
  return createRequestClient(req);
}

async function flush(pending: { name: string; value: string; options: Record<string, unknown> }[]) {
  const { serializeCookieHeader } = await import("@supabase/ssr");
  if (pending.length)
    setResponseHeader(
      "Set-Cookie",
      pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
    );
}

export const getTelegramAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const bot = process.env["TELEGRAM_BOT_USERNAME"]?.trim();
  const ok = Boolean(bot && process.env["TELEGRAM_BOT_TOKEN"]);
  return ok ? { enabled: true as const, bot: bot! } : { enabled: false as const };
});

export const signInWithTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: { auth: unknown; redirect?: string | undefined }) => ({
    auth: parseTelegramAuth(d?.auth),
    redirect: typeof d?.redirect === "string" ? d.redirect : undefined,
  }))
  .handler(async ({ data }): Promise<AuthResult> => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    const ctx = await prep();
    if (!ctx || !token) return FAIL;
    if (!(await verifyTelegramAuth(data.auth, token))) return FAIL;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: userId, error } = await supabaseAdmin.rpc("telegram_consume_login", {
        _hash: data.auth.hash,
        _telegram_id: data.auth.id,
      });
      if (error || !userId) return FAIL;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId as string);
      const email = u.user?.email;
      if (!email) return FAIL;
      const { data: link, error: le } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const th = link?.properties?.hashed_token;
      if (le || !th) return FAIL;
      const { error: ve } = await ctx.supabase.auth.verifyOtp({
        token_hash: th,
        type: "magiclink",
      });
      await flush(ctx.pending);
      if (ve) return FAIL;
      const { safeRedirect } = await import("./safe-redirect");
      return { ok: true, redirect: safeRedirect(data.redirect, "/member") };
    } catch {
      return FAIL;
    }
  });

export const linkTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: { auth: unknown }) => ({ auth: parseTelegramAuth(d?.auth) }))
  .handler(async ({ data }): Promise<AuthResult> => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    const ctx = await prep();
    if (!ctx || !token) return { ok: false, message: "Привязка недоступна." };
    const { data: u } = await ctx.supabase.auth.getUser();
    if (!u.user) return { ok: false, message: "Сначала войдите." };
    if (!(await verifyTelegramAuth(data.auth, token)))
      return { ok: false, message: "Подпись Telegram не подтверждена." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: ne } = await supabaseAdmin.rpc("telegram_consume_login", {
      _hash: data.auth.hash,
      _telegram_id: data.auth.id,
    });
    if (ne) return { ok: false, message: "Подпись уже использована, попробуйте ещё раз." };
    const { normalizeTelegramUsername, TELEGRAM_USERNAME_RE } =
      await import("@/lib/telegram-username");
    const un = normalizeTelegramUsername(data.auth.username ?? "");
    const patch: { telegram_id: number; telegram_username?: string } = {
      telegram_id: data.auth.id,
    };
    if (TELEGRAM_USERNAME_RE.test(un)) patch.telegram_username = un;
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", u.user.id);
    await flush(ctx.pending);
    if (error) return { ok: false, message: "Этот Telegram уже привязан к другому аккаунту." };
    return { ok: true };
  });

export const unlinkTelegram = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthResult> => {
    const ctx = await prep();
    if (!ctx) return { ok: false, message: "Запрос отклонён." };
    const { data: u } = await ctx.supabase.auth.getUser();
    if (!u.user) return { ok: false, message: "Сначала войдите." };
    if (!u.user.email) return { ok: false, message: "Нельзя отвязать единственный способ входа." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_id: null })
      .eq("id", u.user.id);
    await flush(ctx.pending);
    return error ? { ok: false, message: "Не удалось отвязать." } : { ok: true };
  },
);

export const updateTelegramUsername = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) => ({
    username: String(d?.username ?? "").slice(0, 40),
  }))
  .handler(async ({ data }): Promise<AuthResult> => {
    const { telegramUsernameError, normalizeTelegramUsername } =
      await import("@/lib/telegram-username");
    const err = telegramUsernameError(data.username);
    if (err) return { ok: false, message: err };
    const ctx = await prep();
    if (!ctx) return { ok: false, message: "Запрос отклонён." };
    const { data: u } = await ctx.supabase.auth.getUser();
    if (!u.user) return { ok: false, message: "Сначала войдите." };
    // Обычный клиент пользователя: RLS + право только на колонку telegram_username.
    const { error } = await ctx.supabase
      .from("profiles")
      .update({ telegram_username: normalizeTelegramUsername(data.username) })
      .eq("id", u.user.id);
    await flush(ctx.pending);
    return error ? { ok: false, message: "Этот username уже занят или недопустим." } : { ok: true };
  });
