/**
 * Серверные функции доступа (день 04). Все ответы private/no-store/noindex, Set-Cookie сохраняются.
 * Без разрешённой конфигурации ни одна функция не обращается к сети и не выдаёт сессию.
 * Наружу не уходят токены, claims целиком или объект пользователя.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { DISABLED_MESSAGE_KEY, type AuthResult, type StaffDecision } from "./auth-shared";

type Ctx = NonNullable<ReturnType<typeof import("./supabase.server").createRequestClient>>;

async function open(): Promise<Ctx | null> {
  const { createRequestClient } = await import("./supabase.server");
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  return createRequestClient(getRequest());
}

async function flush(ctx: Ctx) {
  const { serializeCookieHeader } = await import("@supabase/ssr");
  if (ctx.pending.length)
    setResponseHeader(
      "Set-Cookie",
      ctx.pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
    );
}

async function assertOrigin(): Promise<boolean> {
  const { isSameOrigin } = await import("./auth-core");
  const req = getRequest();
  return isSameOrigin(req.headers.get("origin"), req.url);
}

const disabled: AuthResult = { ok: false, message: DISABLED_MESSAGE_KEY };
const forbidden: AuthResult = { ok: false, message: "Запрос отклонён." };

export const getAuthAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const { getAuthConfig } = await import("./supabase.server");
  setResponseHeader("Cache-Control", "private, no-store");
  const c = getAuthConfig();
  return c.enabled ? { configured: true as const, env: c.env } : { configured: false as const };
});

export const getMemberState = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await open();
  if (!ctx) return { state: "unconfigured" as const };
  try {
    // getUser() проверяет токен на сервере Auth; getSession() для подлинности не используется.
    const { data, error } = await ctx.supabase.auth.getUser();
    if (error || !data.user) {
      await flush(ctx);
      return { state: "signin" as const };
    }
    // Допуск — доверенная запись в БД (не JWT/user_metadata). Отказ/сбой → закрыто.
    const { data: adm, error: admErr } = await (
      ctx.supabase as unknown as {
        rpc: (n: string) => Promise<{ data: unknown; error: { code?: string } | null }>;
      }
    ).rpc("my_admission");
    if (admErr) {
      await flush(ctx);
      return { state: "error" as const };
    }
    if (adm !== "admitted" && adm !== "exempt") {
      await flush(ctx);
      return { state: "pending" as const };
    }
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("display_name, telegram_username, telegram_id")
      .eq("id", data.user.id)
      .maybeSingle();
    const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    await flush(ctx);
    return {
      state: "ok" as const,
      displayName: (profile?.display_name as string | undefined) ?? null,
      telegramUsername: (profile?.telegram_username as string | null | undefined) ?? null,
      telegramLinked: profile?.telegram_id != null,
      aal: aal?.currentLevel ?? null,
      mfaEnrolled: aal?.nextLevel === "aal2",
    };
  } catch {
    return { state: "error" as const };
  }
});

export const getStaffAccess = createServerFn({ method: "GET" })
  .inputValidator((d: { area: "admin" | "scan" }) => {
    if (d?.area !== "admin" && d?.area !== "scan") throw new Error("bad area");
    return { area: d.area };
  })
  .handler(async ({ data }): Promise<{ decision: StaffDecision }> => {
    const { decideStaff } = await import("./auth-core");
    const ctx = await open();
    if (!ctx) return { decision: "unconfigured" };
    try {
      // getClaims() проверяет подпись JWT (JWKS) или обращается к Auth; claims наружу не отдаются.
      const { data: cl } = await ctx.supabase.auth.getClaims();
      const claims = cl?.claims as { sub?: string; aal?: string } | undefined;
      let rpcAllowed: boolean | null = false;
      if (claims?.sub && claims.aal === "aal2") {
        // Узкая RPC: aal2 И живая сессия И актуальное назначение проверяются в БД.
        const { data: ok, error } = await ctx.supabase.rpc("my_staff_access", {
          _area: data.area,
        });
        rpcAllowed = error ? null : ok === true;
      }
      await flush(ctx);
      return {
        decision: decideStaff({
          configured: true,
          userId: claims?.sub ?? null,
          aal: claims?.aal ?? null,
          rpcAllowed,
        }),
      };
    } catch {
      return { decision: "error" };
    }
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; redirect?: string | undefined }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!(await assertOrigin())) return forbidden;
    const ctx = await open();
    if (!ctx) return disabled;
    const { performSignIn } = await import("./auth-core");
    const r = await performSignIn(ctx.supabase, data);
    await flush(ctx);
    return r;
  });

export const signOut = createServerFn({ method: "POST" }).handler(async (): Promise<AuthResult> => {
  if (!(await assertOrigin())) return forbidden;
  const ctx = await open();
  if (!ctx) return disabled;
  // scope local: завершает текущую сессию (строка auth.sessions удаляется → staff_session_ok=false).
  let failed = false;
  try {
    const { error } = await ctx.supabase.auth.signOut({ scope: "local" });
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  await flush(ctx);
  // Правдивый результат: при сбое сессия может оставаться активной на сервере.
  return failed
    ? { ok: false, message: "Не удалось завершить сессию. Проверьте связь и повторите." }
    : { ok: true, redirect: "/login" };
});

export const requestRecovery = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!(await assertOrigin())) return forbidden;
    const ctx = await open();
    if (!ctx) return disabled;
    const { performRecovery } = await import("./auth-core");
    const r = await performRecovery(
      ctx.supabase,
      data,
      `${ctx.config.siteUrl}/auth/callback?next=/auth/reset`,
    );
    await flush(ctx);
    return r;
  });

export const updatePassword = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!(await assertOrigin())) return forbidden;
    const ctx = await open();
    if (!ctx) return disabled;
    const { performPasswordUpdate } = await import("./auth-core");
    const r = await performPasswordUpdate(ctx.supabase, data);
    await flush(ctx);
    return r;
  });

export const enrollTotp = createServerFn({ method: "POST" }).handler(async () => {
  if (!(await assertOrigin())) return { ok: false as const, message: "Запрос отклонён." };
  const ctx = await open();
  if (!ctx) return { ok: false as const, message: DISABLED_MESSAGE_KEY };
  const { data: u } = await ctx.supabase.auth.getUser();
  if (!u.user) return { ok: false as const, message: "Сначала войдите." };
  const { data, error } = await ctx.supabase.auth.mfa.enroll({ factorType: "totp" });
  await flush(ctx);
  if (error || !data) return { ok: false as const, message: "Не удалось начать подключение." };
  // Секрет и QR нужны только самому пользователю для приложения-аутентификатора.
  return {
    ok: true as const,
    factorId: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
  };
});

export const verifyTotp = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { factorId?: string | undefined; code: string; redirect?: string | undefined }) => {
      if (typeof d?.code !== "string" || !/^\d{6}$/.test(d.code)) throw new Error("bad code");
      return d;
    },
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!(await assertOrigin())) return forbidden;
    const ctx = await open();
    if (!ctx) return disabled;
    const { safeRedirect } = await import("./safe-redirect");
    let factorId = data.factorId;
    if (!factorId) {
      const { data: f } = await ctx.supabase.auth.mfa.listFactors();
      factorId = f?.totp?.[0]?.id;
    }
    if (!factorId) return { ok: false, message: "Код не подключён." };
    const { error } = await ctx.supabase.auth.mfa.challengeAndVerify({ factorId, code: data.code });
    await flush(ctx);
    if (error) return { ok: false, message: "Код не принят." };
    return { ok: true, redirect: safeRedirect(data.redirect, "/member") };
  });
