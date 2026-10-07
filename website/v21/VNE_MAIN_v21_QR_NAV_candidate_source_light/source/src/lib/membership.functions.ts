import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  MEMBERSHIP_RESPONSE,
  normalizeMembershipDecision,
  validateMembershipInput,
  hasExplicitConsent,
} from "./membership";
import { CONSENT_VERSION } from "./delivery";

async function flushCookies(
  pending: { name: string; value: string; options: Record<string, unknown> }[],
) {
  if (!pending.length) return;
  const { serializeCookieHeader } = await import("@supabase/ssr");
  setResponseHeader(
    "Set-Cookie",
    pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
  );
}

function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Vary", "Cookie");
}

async function sameOrigin() {
  const { isSameOrigin } = await import("./auth/auth-core");
  const request = getRequest();
  return isSameOrigin(request.headers.get("origin"), request.url);
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const submitMembershipRequest = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: unknown;
      email: unknown;
      telegram: unknown;
      event?: unknown;
      website?: unknown;
      consent?: unknown;
    }) => data,
  )
  .handler(async ({ data }) => {
    privateResponse();
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    const parsed = validateMembershipInput(data);
    if (!parsed.ok)
      return { ok: false as const, message: "Проверьте выделенные поля.", errors: parsed.errors };
    if (!hasExplicitConsent(data.consent))
      return { ok: false as const, message: "Подтвердите согласие на обработку данных." };
    if (typeof data.website === "string" && data.website.trim())
      return { ok: true as const, message: MEMBERSHIP_RESPONSE };

    const request = getRequest();
    const address =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const identifierHash = await digest(`${address}|${parsed.values.email}`);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.rpc("submit_membership_request", {
        _display_name: parsed.values.displayName,
        _email: parsed.values.email,
        _event_slug: parsed.values.eventSlug ?? "",
        _identifier_hash: identifierHash,
        _consent_version: CONSENT_VERSION,
        _telegram_username: parsed.values.telegramUsername,
      });
      if (error) {
        if (error.code === "P0001")
          return { ok: false as const, message: "Слишком много попыток. Попробуйте через час." };
        console.error("membership submit failed", error.code);
        return { ok: false as const, message: "Сервис временно недоступен. Заявка не сохранена." };
      }
      // Повтор с тем же email не раскрывается: тот же ответ, что и для новой заявки.
      return { ok: true as const, message: MEMBERSHIP_RESPONSE };
    } catch {
      return { ok: false as const, message: "Не удалось отправить заявку. Попробуйте позже." };
    }
  });

export type InviteDto = {
  id: string;
  code: string;
  status: string;
  sentAt: string | null;
  expiresAt: string;
};
export type MembershipRequestDto = {
  id: string;
  displayName: string;
  email: string;
  telegramUsername: string;
  eventSlug: string | null;
  status: "pending" | "approved" | "rejected";
  invitedAt: string | null;
  inviteError: string | null;
  createdAt: string;
  invite: InviteDto | null;
};

async function getAuthorizedStaff() {
  const { createRequestClient } = await import("./auth/supabase.server");
  const ctx = createRequestClient(getRequest());
  if (!ctx) return null;
  const { data: userData, error: userError } = await ctx.supabase.auth.getUser();
  const { data: claimsData } = await ctx.supabase.auth.getClaims();
  const claims = claimsData?.claims as { aal?: string } | undefined;
  let allowed = false;
  if (!userError && userData.user && claims?.aal === "aal2") {
    // Отдельная возможность membership (owner/admin), не общий /admin guard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (ctx.supabase as any).rpc("staff_can", { _cap: "membership" });
    allowed = data === true;
  }
  await flushCookies(ctx.pending);
  return allowed && userData.user ? { id: userData.user.id, supabase: ctx.supabase } : null;
}

const FILTERS = ["all", "pending", "approved", "rejected", "failed"] as const;
type Filter = (typeof FILTERS)[number];

export const listMembershipRequests = createServerFn({ method: "GET" })
  .inputValidator((d: { filter?: unknown; q?: unknown } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    privateResponse();
    const empty = {
      ok: false as const,
      requests: [] as MembershipRequestDto[],
      counts: {} as Record<string, number>,
    };
    const actor = await getAuthorizedStaff();
    if (!actor) return empty;
    const filter: Filter = FILTERS.includes(data.filter as Filter)
      ? (data.filter as Filter)
      : "all";
    const q =
      typeof data.q === "string"
        ? data.q
            .trim()
            .slice(0, 80)
            .replace(/[%,()*\\]/g, "")
        : "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("membership_requests")
      .select(
        "id, display_name, email, telegram_username, event_slug, status, invited_at, invite_error, created_at, invite:invites!membership_requests_current_invite_id_fkey(id, code, status, sent_at, expires_at)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (filter === "failed") query = query.not("invite_error", "is", null);
    else if (filter !== "all") query = query.eq("status", filter);
    if (q)
      query = query.or(
        `display_name.ilike.%${q}%,email.ilike.%${q}%,telegram_username.ilike.%${q.replace(/^@/, "")}%`,
      );
    const head = () =>
      supabaseAdmin.from("membership_requests").select("id", { count: "exact", head: true });
    // Счётчики — SQL count, без выгрузки строк.
    const [{ data: rows, error }, cAll, cPending, cApproved, cRejected, cFailed] =
      await Promise.all([
        query,
        head(),
        head().eq("status", "pending"),
        head().eq("status", "approved"),
        head().eq("status", "rejected"),
        head().not("invite_error", "is", null),
      ]);
    if (error) return empty;
    const counts: Record<string, number> = {
      all: cAll.count ?? 0,
      pending: cPending.count ?? 0,
      approved: cApproved.count ?? 0,
      rejected: cRejected.count ?? 0,
      failed: cFailed.count ?? 0,
    };
    return {
      ok: true as const,
      counts,
      requests: (rows ?? []).map((item): MembershipRequestDto => {
        const inv = Array.isArray(item.invite) ? item.invite[0] : item.invite;
        return {
          id: item.id,
          displayName: item.display_name,
          email: item.email,
          telegramUsername: item.telegram_username,
          eventSlug: item.event_slug,
          status: item.status,
          invitedAt: item.invited_at,
          inviteError: item.invite_error,
          createdAt: item.created_at,
          invite: inv
            ? {
                id: inv.id,
                code: inv.code,
                status: inv.status,
                sentAt: inv.sent_at,
                expiresAt: inv.expires_at,
              }
            : null,
        };
      }),
    };
  });

const UUID = /^[0-9a-f-]{36}$/i;

export const reviewMembershipRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { id: unknown; decision: unknown }) => data)
  .handler(async ({ data }) => {
    privateResponse();
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    const decision = normalizeMembershipDecision(data.decision);
    if (typeof data.id !== "string" || !UUID.test(data.id) || !decision)
      return { ok: false as const, message: "Проверьте действие." };
    const staff = await getAuthorizedStaff();
    if (!staff) return { ok: false as const, message: "Доступ закрыт." };
    // Решение, аудит, outbox и приглашение — одна транзакция в БД от имени сотрудника
    // (capability membership = owner/admin + aal2 + живая сессия). Повтор/гонка → noop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: res, error } = await (staff.supabase as any).rpc("membership_decide", {
      _request: data.id,
      _decision: decision,
    });
    if (error) {
      if (error.code === "42501") return { ok: false as const, message: "Доступ закрыт." };
      if (error.code === "P0002") return { ok: false as const, message: "Заявка не найдена." };
      return { ok: false as const, message: "Не удалось сохранить решение." };
    }
    const r = res as {
      result: "noop" | "changed";
      status: string;
      invite_id?: string;
      code?: string;
    };
    if (r.result === "noop")
      return {
        ok: true as const,
        message: "Решение уже было принято раньше — ничего не изменено.",
      };
    if (decision === "rejected") return { ok: true as const, message: "Заявка отклонена." };
    const { deliveryMode } = await import("./delivery");
    if (deliveryMode(process.env as Record<string, string | undefined>) !== "live" || !r.invite_id)
      return {
        ok: true as const,
        message: `Одобрено. Приглашение ${r.code ?? ""} создано; отправка писем в этой среде отключена.`,
      };
    // Живая доставка (только при VNE_DELIVERY_MODE=live): одно письмо новому адресату.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: item } = await supabaseAdmin
      .from("membership_requests")
      .select("email, display_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) return { ok: false as const, message: "Заявка не найдена." };
    const origin = new URL(getRequest().url).origin;
    const { randomBytes } = await import("node:crypto");
    const { sha256Hex } = await import("./auth/invite-callback");
    const nonce = randomBytes(32).toString("base64url"); // не логируется, в БД только хэш
    const tokenHash = await sha256Hex(nonce);
    const { data: invited, error: sendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      item.email,
      {
        redirectTo: `${origin}/auth/callback?inv=${nonce}&next=${encodeURIComponent("/auth/reset?invite=1")}`,
        data: { display_name: item.display_name, invite_id: r.invite_id, invite_code: r.code },
      },
    );
    const userId = invited?.user?.id ?? null;
    await supabaseAdmin.rpc("mark_invite", {
      _invite: r.invite_id,
      _sent: !sendError && !!userId,
      ...(userId ? { _user: userId } : {}),
      ...(!sendError && userId ? { _token_hash: tokenHash } : {}),
      ...(sendError || !userId ? { _error: "delivery_failed" } : {}),
    });
    if (sendError || !userId)
      return {
        ok: false as const,
        message: `Приглашение ${r.code} создано, письмо не отправлено.`,
      };
    await supabaseAdmin.rpc("record_membership_invite", {
      _invited_user: userId,
      _request: data.id,
    });
    return { ok: true as const, message: `Приглашение ${r.code} отправлено.` };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .inputValidator((d: { id: unknown }) => d)
  .handler(async ({ data }) => {
    privateResponse();
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    if (typeof data.id !== "string" || !UUID.test(data.id))
      return { ok: false as const, message: "Проверьте действие." };
    const actor = await getAuthorizedStaff();
    if (!actor) return { ok: false as const, message: "Доступ закрыт." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: done, error } = await supabaseAdmin.rpc("revoke_invite", {
      _invite: data.id,
      _actor: actor.id,
    });
    if (error) return { ok: false as const, message: "Не удалось отозвать." };
    return {
      ok: true as const,
      message: done ? "Приглашение отозвано." : "Приглашение уже неактивно.",
    };
  });

export type HistoryDto = { at: string; action: string; result: string };
export const listRequestHistory = createServerFn({ method: "GET" })
  .inputValidator((d: { id: unknown }) => d)
  .handler(async ({ data }) => {
    privateResponse();
    if (typeof data.id !== "string" || !UUID.test(data.id)) return { items: [] as HistoryDto[] };
    const actor = await getAuthorizedStaff();
    if (!actor) return { items: [] as HistoryDto[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.rpc("request_history", { _request: data.id });
    return {
      items: (rows ?? []).map((r: { at: string; action: string; result: string }) => ({
        at: r.at,
        action: r.action,
        result: r.result,
      })),
    };
  });
