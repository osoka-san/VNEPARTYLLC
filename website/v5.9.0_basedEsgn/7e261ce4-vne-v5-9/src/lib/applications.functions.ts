/**
 * День 05: заявки на событие. Все операции идут через request-scoped клиент пользователя
 * (RLS + RPC с проверкой auth.uid(), aal2, живой сессии и назначения в БД). Admin-клиент не используется.
 * Содержимое анкеты не логируется.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  MOD_ACTIONS,
  isUuid,
  rpcMessage,
  validateApplicationInput,
  type AppStatus,
  type ModerationAction,
} from "./applications";
import { CONSENT_VERSION } from "./delivery";

async function ctx() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Vary", "Cookie");
  const { createRequestClient } = await import("./auth/supabase.server");
  return createRequestClient(getRequest());
}
async function flush(c: NonNullable<Awaited<ReturnType<typeof ctx>>>) {
  const { serializeCookieHeader } = await import("@supabase/ssr");
  if (c.pending.length)
    setResponseHeader(
      "Set-Cookie",
      c.pending.map((p) => serializeCookieHeader(p.name, p.value, p.options)),
    );
}
async function sameOrigin() {
  const { isSameOrigin } = await import("./auth/auth-core");
  const r = getRequest();
  return isSameOrigin(r.headers.get("origin"), r.url);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type GuestApplication = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  status: AppStatus;
  version: number;
  publicMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export const listPublishedEvents = createServerFn({ method: "GET" }).handler(async () => {
  const c = await ctx();
  if (!c)
    return { ok: false as const, events: [] as { id: string; title: string; slug: string }[] };
  const { data, error } = await (c.supabase as Sb)
    .from("events")
    .select("id, title, slug")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  await flush(c);
  if (error)
    return { ok: false as const, events: [] as { id: string; title: string; slug: string }[] };
  return {
    ok: true as const,
    events: (data ?? []) as { id: string; title: string; slug: string }[],
  };
});

export const listMyApplications = createServerFn({ method: "GET" }).handler(async () => {
  const c = await ctx();
  if (!c) return { state: "unconfigured" as const, items: [] as GuestApplication[] };
  const { data: u } = await c.supabase.auth.getUser();
  if (!u.user) return { state: "signin" as const, items: [] as GuestApplication[] };
  const { data, error } = await (c.supabase as Sb)
    .from("applications")
    .select(
      "id, event_id, status, version, public_message, created_at, updated_at, event:events(title, slug)",
    )
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  await flush(c);
  if (error) return { state: "error" as const, items: [] as GuestApplication[] };
  return {
    state: "ok" as const,
    items: (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any): GuestApplication => ({
        id: r.id,
        eventId: r.event_id,
        status: r.status,
        version: r.version,
        publicMessage: r.status === "needs_info" ? r.public_message : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        eventTitle: r.event?.title ?? "Событие",
        eventSlug: r.event?.slug ?? "",
      }),
    ),
  };
});

export const getMyApplication = createServerFn({ method: "GET" })
  .inputValidator((d: { id: unknown }) => d)
  .handler(async ({ data }) => {
    const c = await ctx();
    if (!c) return { state: "unconfigured" as const };
    if (!isUuid(data.id)) return { state: "notfound" as const };
    const { data: u } = await c.supabase.auth.getUser();
    if (!u.user) return { state: "signin" as const };
    const sb = c.supabase as Sb;
    const { data: r } = await sb
      .from("applications")
      .select(
        "id, status, version, public_message, guest_reply, display_name, created_at, event:events(title, slug)",
      )
      .eq("id", data.id)
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (!r) {
      await flush(c);
      return { state: "notfound" as const };
    }
    const { data: history } = await sb
      .from("application_events")
      .select("at, from_status, to_status, public_message, guest_message")
      .eq("application_id", r.id)
      .order("at", { ascending: true });
    await flush(c);
    return {
      state: "ok" as const,
      item: {
        id: r.id as string,
        status: r.status as AppStatus,
        version: r.version as number,
        displayName: r.display_name as string | null,
        publicMessage: r.status === "needs_info" ? (r.public_message as string | null) : null,
        guestReply: r.guest_reply as string | null,
        createdAt: r.created_at as string,
        eventTitle: (r.event?.title as string) ?? "Событие",
      },
      // Гостю: статус, время, публичный вопрос команды и собственный ответ. Внутренние заметки не читаются.
      history: (
        (history ?? []) as {
          at: string;
          to_status: AppStatus;
          public_message: string | null;
          guest_message: string | null;
        }[]
      ).map((h) => ({
        at: h.at,
        status: h.to_status,
        question: h.public_message,
        answer: h.guest_message,
      })),
    };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      eventId: unknown;
      displayName: unknown;
      ageConfirmed: unknown;
      consent: unknown;
      idempotencyKey: unknown;
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    const v = validateApplicationInput(data);
    if (!v.ok) return { ok: false as const, message: v.message };
    const c = await ctx();
    if (!c) return { ok: false as const, message: "Среда не подключена. Данные не отправлены." };
    const { data: u } = await c.supabase.auth.getUser();
    if (!u.user)
      return { ok: false as const, message: "Сессия истекла. Войдите снова.", signin: true };
    // user_id, статус, контакт и время согласия определяет БД, не клиент.
    const { data: res, error } = await (c.supabase as Sb).rpc("submit_application_v2", {
      _event: v.eventId,
      _display_name: v.displayName,
      _age_confirmed: true,
      _consent_version: CONSENT_VERSION,
      _idempotency: v.idempotencyKey,
    });
    await flush(c);
    const out = res as {
      id?: string;
      outcome?: string;
      display_name?: string;
      status?: string;
    } | null;
    if (error || !out?.id) return { ok: false as const, message: rpcMessage(error?.code) };
    // existing: на событие уже есть заявка — ничего не изменено, возвращаем фактические данные.
    const outcome =
      out.outcome === "existing" ? "existing" : out.outcome === "replay" ? "replay" : "created";
    return {
      ok: true as const,
      id: out.id,
      outcome: outcome as "created" | "replay" | "existing",
      displayName: out.display_name ?? null,
      status: out.status ?? null,
    };
  });

export const guestAction = createServerFn({ method: "POST" })
  .inputValidator((d: { id: unknown; action: unknown; version: unknown; reply?: unknown }) => d)
  .handler(async ({ data }) => {
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    if (
      !isUuid(data.id) ||
      (data.action !== "withdraw" && data.action !== "reply") ||
      !Number.isInteger(data.version)
    )
      return { ok: false as const, message: "Проверьте действие." };
    const reply = typeof data.reply === "string" ? data.reply.trim().slice(0, 1000) : null;
    const c = await ctx();
    if (!c) return { ok: false as const, message: "Среда не подключена." };
    const { error } = await (c.supabase as Sb).rpc("guest_application_action", {
      _app: data.id,
      _action: data.action,
      _expected_version: data.version,
      _reply: reply,
    });
    await flush(c);
    return error ? { ok: false as const, message: rpcMessage(error.code) } : { ok: true as const };
  });

export type QueueItem = {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
  eventTitle: string;
  status: AppStatus;
  version: number;
  guestReply: string | null;
  createdAt: string;
};

const STATUSES: AppStatus[] = [
  "submitted",
  "under_review",
  "needs_info",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
];
const PAGE = 20;

export const listQueue = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { q?: unknown; status?: unknown; event?: unknown; days?: unknown; page?: unknown }) =>
      d ?? {},
  )
  .handler(async ({ data }) => {
    const empty = {
      ok: false as const,
      reason: "error" as "error" | "session" | "unconfigured",
      items: [] as QueueItem[],
      events: [] as { id: string; title: string }[],
      total: 0,
      page: 0,
      pageSize: PAGE,
    };
    const c = await ctx();
    if (!c) return { ...empty, reason: "unconfigured" as const };
    const { data: cl } = await c.supabase.auth.getClaims();
    if ((cl?.claims as { aal?: string } | undefined)?.aal !== "aal2")
      return { ...empty, reason: "session" as const };
    const sb = c.supabase as Sb;
    // RLS отдаёт только заявки назначенных событий при живой aal2-сессии.
    let q = sb
      .from("applications")
      .select(
        "id, display_name, contact_email, status, version, guest_reply, created_at, event:events(title)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (STATUSES.includes(data.status as AppStatus)) q = q.eq("status", data.status);
    if (isUuid(data.event)) q = q.eq("event_id", data.event);
    const days = Number(data.days);
    if ([1, 7, 30].includes(days))
      q = q.gte("created_at", new Date(Date.now() - days * 864e5).toISOString());
    const term =
      typeof data.q === "string"
        ? data.q
            .trim()
            .slice(0, 80)
            .replace(/[%,()*\\]/g, "")
        : "";
    if (term) q = q.or(`display_name.ilike.%${term}%,contact_email.ilike.%${term}%`);
    const page = Math.max(0, Math.min(500, Number.parseInt(String(data.page ?? 0), 10) || 0));
    const [{ data: rows, count, error }, { data: evs }] = await Promise.all([
      q.range(page * PAGE, page * PAGE + PAGE - 1),
      // Только события, которые RLS показывает этому сотруднику (назначения + aal2).
      sb.from("events").select("id, title").order("created_at", { ascending: false }).limit(200),
    ]);
    await flush(c);
    if (error) return empty;
    return {
      ok: true as const,
      reason: null,
      events: (evs ?? []) as { id: string; title: string }[],
      total: count ?? 0,
      page,
      pageSize: PAGE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (rows ?? []).map((r: any): QueueItem => ({
        id: r.id,
        displayName: r.display_name,
        contactEmail: r.contact_email,
        eventTitle: r.event?.title ?? "—",
        status: r.status,
        version: r.version,
        guestReply: r.guest_reply,
        createdAt: r.created_at,
      })),
    };
  });

export const moderate = createServerFn({ method: "POST" })
  .inputValidator((d: { id: unknown; action: unknown; version: unknown; message?: unknown }) => d)
  .handler(async ({ data }) => {
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    if (
      !isUuid(data.id) ||
      !MOD_ACTIONS.includes(data.action as ModerationAction) ||
      !Number.isInteger(data.version)
    )
      return { ok: false as const, message: "Проверьте действие." };
    const c = await ctx();
    if (!c) return { ok: false as const, message: "Среда не подключена." };
    const message = typeof data.message === "string" ? data.message.trim().slice(0, 500) : null;
    // Назначение, aal2, живая сессия и переход проверяются в private.moderate_application.
    const { data: to, error } = await (c.supabase as Sb).rpc("moderate_application", {
      _app: data.id,
      _action: data.action,
      _expected_version: data.version,
      _public_message: message,
    });
    await flush(c);
    return error
      ? { ok: false as const, message: rpcMessage(error.code) }
      : { ok: true as const, status: to as AppStatus };
  });

/** Узкое редактирование владельцем: только имя обращения, нефинальные статусы, CAS по версии. */
export const renameMyApplication = createServerFn({ method: "POST" })
  .inputValidator((d: { id: unknown; name: unknown; version: unknown }) => d)
  .handler(async ({ data }) => {
    if (!(await sameOrigin())) return { ok: false as const, message: "Запрос отклонён." };
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!isUuid(data.id) || !Number.isInteger(data.version) || name.length < 1 || name.length > 80)
      return { ok: false as const, message: "Имя: от 1 до 80 символов." };
    const c = await ctx();
    if (!c) return { ok: false as const, message: "Среда не подключена." };
    const { error } = await (c.supabase as Sb).rpc("guest_update_display_name", {
      _app: data.id,
      _name: name,
      _expected_version: data.version,
    });
    await flush(c);
    return error ? { ok: false as const, message: rpcMessage(error.code) } : { ok: true as const };
  });
