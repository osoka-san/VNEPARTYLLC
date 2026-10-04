/**
 * День 06: события, резервы, заказы, sandbox-оплата. Гостевые и staff-операции идут через
 * request-scoped клиент (RLS + узкие RPC). Admin-клиент — только для обработки проверенных
 * уведомлений fake-провайдера после проверки права payment_simulate.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { isUuid } from "./applications";
import { ORDER_STATUSES, type OrderStatus } from "./orders";
import { SIMULATION_SCENARIOS, type SimulationScenario } from "./payments/provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

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
function errMessage(code: string | undefined): string {
  switch (code) {
    case "42501":
      return "Нет доступа к этому действию.";
    case "40001":
      return "Данные изменились. Обновите страницу.";
    case "P0001":
      return "Продажа сейчас недоступна.";
    case "P0002":
      return "У вас уже есть резерв или участие в этом событии.";
    case "P0003":
      return "Места закончились.";
    case "22023":
      return "Проверьте введённые данные.";
    default:
      return "Операция не выполнена. Попробуйте ещё раз.";
  }
}
type Fail = { ok: false; message: string };
type Row = Record<string, string | number | boolean | null>;

export async function paymentModeServer() {
  const { resolvePaymentMode } = await import("./payments/provider");
  return resolvePaymentMode(process.env as Record<string, string | undefined>, import.meta.env.DEV);
}

// ================= Guest =================

export type MyOrder = {
  id: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string | null;
  timezone: string;
  tierName: string;
  amountMinor: number;
  currency: string;
  environment: string;
  status: OrderStatus;
  reservationExpiresAt: string | null;
  participation: string | null;
  createdAt: string;
};

export type PurchaseOption = {
  eventId: string;
  title: string;
  startsAt: string | null;
  timezone: string;
  salesCloseAt: string | null;
  seatsLeft: number | null;
  tiers: { id: string; name: string; amountMinor: number; currency: string }[];
};

export const getMyCommerce = createServerFn({ method: "GET" }).handler(async () => {
  const c = await ctx();
  const mode = await paymentModeServer();
  const empty = {
    orders: [] as MyOrder[],
    options: [] as PurchaseOption[],
    simulated: mode.mode === "fake",
    modeReason: mode.mode === "unconfigured" ? mode.reason : null,
  };
  if (!c) return { state: "unconfigured" as const, ...empty };
  const sb = c.supabase as Sb;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { state: "signin" as const, ...empty };
  const [ord, apps] = await Promise.all([
    sb
      .from("orders")
      .select(
        "id, event_id, tier_name, amount_minor, currency, environment, status, created_at, event:events(title, slug, starts_at, timezone), reservation:reservations(expires_at), participation:participations(status)",
      )
      .eq("user_id", u.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("applications")
      .select(
        "event_id, event:events(id, title, starts_at, timezone, sales_open, sales_close_at, capacity, status)",
      )
      .eq("user_id", u.user.id)
      .eq("status", "approved")
      .limit(20),
  ]);
  await flush(c);
  if (ord.error || apps.error) return { state: "error" as const, ...empty };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders: MyOrder[] = (ord.data ?? []).map((r: any) => ({
    id: r.id,
    eventTitle: r.event?.title ?? "Событие",
    eventSlug: r.event?.slug ?? "",
    eventStartsAt: r.event?.starts_at ?? null,
    timezone: r.event?.timezone ?? "Europe/Moscow",
    tierName: r.tier_name,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    environment: r.environment,
    status: r.status,
    reservationExpiresAt: r.reservation?.expires_at ?? null,
    participation: Array.isArray(r.participation)
      ? (r.participation[0]?.status ?? null)
      : (r.participation?.status ?? null),
    createdAt: r.created_at,
  }));
  const options: PurchaseOption[] = [];
  // событие с действующим заказом (резерв, оплачен, на проверке) повторно не предлагаем
  const busyEvents = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((ord.data ?? []) as any[])
      .filter((r) => ["awaiting_payment", "paid", "needs_review"].includes(r.status))
      .map((r) => r.event_id as string),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (apps.data ?? []) as any[]) {
    const e = a.event;
    if (!e || e.status !== "published" || !e.sales_open || busyEvents.has(e.id)) continue;
    const { data: tiers } = await sb
      .from("event_tiers")
      .select("id, name, amount_minor, currency")
      .eq("event_id", e.id)
      .eq("active", true)
      .order("sort");
    options.push({
      eventId: e.id,
      title: e.title,
      startsAt: e.starts_at,
      timezone: e.timezone,
      salesCloseAt: e.sales_close_at,
      seatsLeft: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tiers: (tiers ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        amountMinor: Number(t.amount_minor),
        currency: t.currency,
      })),
    });
  }
  return { state: "ok" as const, ...empty, orders, options };
});

export const reserveSeat = createServerFn({ method: "POST" })
  .inputValidator((d: { eventId: unknown; tierId: unknown; idem: unknown }) => {
    if (!isUuid(d?.eventId) || !isUuid(d?.tierId) || !isUuid(d?.idem)) throw new Error("bad input");
    // клиент передаёт только выбор тарифа и ключ операции; цена, статус и user_id — только сервер
    return { eventId: d.eventId as string, tierId: d.tierId as string, idem: d.idem as string };
  })
  .handler(async ({ data }): Promise<{ ok: true; orderId: string; replayed: boolean } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { data: r, error } = await (c.supabase as Sb).rpc("reserve_seat", {
      _event: data.eventId,
      _tier: data.tierId,
      _idem: data.idem,
    });
    await flush(c);
    if (error) return { ok: false, message: errMessage(error.code) };
    return { ok: true, orderId: r.order_id, replayed: Boolean(r.replayed) };
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: unknown }) => {
    if (!isUuid(d?.orderId)) throw new Error("bad input");
    return { orderId: d.orderId as string };
  })
  .handler(async ({ data }): Promise<{ ok: true; status: string } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { data: s, error } = await (c.supabase as Sb).rpc("cancel_my_order", {
      _order: data.orderId,
    });
    await flush(c);
    if (error) return { ok: false, message: errMessage(error.code) };
    return { ok: true, status: String(s) };
  });

// ================= Staff: events =================

export type AdminEvent = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  salesOpen: boolean;
  cancelledAt: string | null;
  timezone: string;
  startsAt: string | null;
  capacity: number | null;
  salesCloseAt: string | null;
  reserveTtlMinutes: number;
  qrReleaseAt: string | null;
  addressRevealAt: string | null;
  entryOpensAt: string | null;
  entryClosesAt: string | null;
  version: number;
  isSynthetic: boolean;
  tiers: { id: string; name: string; amountMinor: number; currency: string; active: boolean }[];
  venueAddress: string;
  staffNotes: string;
  seatsTaken: number;
};

export const listAdminEvents = createServerFn({ method: "GET" }).handler(async () => {
  const c = await ctx();
  if (!c) return { ok: false as const, reason: "unconfigured" as const, items: [] as AdminEvent[] };
  const sb = c.supabase as Sb;
  const { data: can } = await sb.rpc("staff_can", { _cap: "events_manage" });
  if (can !== true) {
    await flush(c);
    return { ok: false as const, reason: "denied" as const, items: [] as AdminEvent[] };
  }
  const [ev, tiers, priv, res, par] = await Promise.all([
    sb.from("events").select("*").order("created_at", { ascending: false }).limit(100),
    sb
      .from("event_tiers")
      .select("id, event_id, name, amount_minor, currency, active")
      .order("sort"),
    sb.from("event_private_details").select("event_id, venue_address, staff_notes"),
    sb.from("reservations").select("event_id, expires_at").eq("status", "active"),
    sb.from("participations").select("event_id").eq("status", "active"),
  ]);
  await flush(c);
  if (ev.error) return { ok: false as const, reason: "error" as const, items: [] as AdminEvent[] };
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: AdminEvent[] = (ev.data ?? []).map((e: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (priv.data ?? []).find((x: any) => x.event_id === e.id);
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description ?? "",
      status: e.status,
      salesOpen: e.sales_open,
      cancelledAt: e.cancelled_at,
      timezone: e.timezone,
      startsAt: e.starts_at,
      capacity: e.capacity,
      salesCloseAt: e.sales_close_at,
      reserveTtlMinutes: e.reserve_ttl_minutes,
      qrReleaseAt: e.qr_release_at,
      addressRevealAt: e.address_reveal_at,
      entryOpensAt: e.entry_opens_at,
      entryClosesAt: e.entry_closes_at,
      version: e.version,
      isSynthetic: e.is_synthetic,
      tiers: (tiers.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((t: any) => t.event_id === e.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          amountMinor: Number(t.amount_minor),
          currency: t.currency,
          active: t.active,
        })),
      venueAddress: p?.venue_address ?? "",
      staffNotes: p?.staff_notes ?? "",
      seatsTaken:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (res.data ?? []).filter((r: any) => r.event_id === e.id && Date.parse(r.expires_at) > now)
          .length +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (par.data ?? []).filter((r: any) => r.event_id === e.id).length,
    };
  });
  return { ok: true as const, reason: null, items };
});

export const saveEvent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: unknown; version: unknown; form: unknown }) => {
    const id = d?.id === null ? null : isUuid(d?.id) ? (d.id as string) : undefined;
    if (id === undefined) throw new Error("bad id");
    return { id, version: Number(d.version) || 0, form: d.form as Record<string, unknown> };
  })
  .handler(async ({ data }): Promise<{ ok: true; id: string } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const { validateEventForm } = await import("./orders");
    const f = data.form;
    const str = (k: string) => (typeof f[k] === "string" && f[k] ? (f[k] as string) : null);
    const form = {
      slug: String(f["slug"] ?? ""),
      title: String(f["title"] ?? "").slice(0, 120),
      description: String(f["description"] ?? "").slice(0, 4000),
      timezone: String(f["timezone"] ?? "Europe/Moscow"),
      starts_at: str("starts_at"),
      capacity: f["capacity"] === null || f["capacity"] === "" ? null : Number(f["capacity"]),
      sales_close_at: str("sales_close_at"),
      reserve_ttl_minutes: Number(f["reserve_ttl_minutes"] ?? 15),
      qr_release_at: str("qr_release_at"),
      address_reveal_at: str("address_reveal_at"),
      entry_opens_at: str("entry_opens_at"),
      entry_closes_at: str("entry_closes_at"),
      is_synthetic: f["is_synthetic"] === true,
    };
    const v = validateEventForm(form);
    if (v) return { ok: false, message: v };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { data: id, error } = await (c.supabase as Sb).rpc("admin_save_event", {
      _id: data.id,
      _expected_version: data.version,
      _data: form,
    });
    await flush(c);
    if (error)
      return {
        ok: false,
        message: error.code === "23505" ? "Такой slug уже есть." : errMessage(error.code),
      };
    return { ok: true, id: String(id) };
  });

const EVENT_ACTIONS = [
  "publish",
  "unpublish",
  "open_sales",
  "close_sales",
  "archive",
  "cancel",
] as const;
export const eventTransition = createServerFn({ method: "POST" })
  .inputValidator((d: { id: unknown; action: unknown; version: unknown }) => {
    if (!isUuid(d?.id) || !(EVENT_ACTIONS as readonly unknown[]).includes(d?.action))
      throw new Error("bad input");
    return { id: d.id as string, action: d.action as string, version: Number(d.version) };
  })
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { error } = await (c.supabase as Sb).rpc("admin_event_transition", {
      _id: data.id,
      _action: data.action,
      _expected_version: data.version,
    });
    await flush(c);
    if (error)
      return {
        ok: false,
        message:
          error.code === "22023"
            ? "Для продаж нужны публикация, вместимость, начало и закрытие продаж."
            : errMessage(error.code),
      };
    return { ok: true };
  });

export const saveTier = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      eventId: unknown;
      tierId: unknown;
      name: unknown;
      amountMinor: unknown;
      currency: unknown;
      active: unknown;
    }) => {
      if (!isUuid(d?.eventId) || (d.tierId !== null && !isUuid(d.tierId)))
        throw new Error("bad input");
      const amount = Number(d.amountMinor);
      const name = String(d.name ?? "").trim();
      const currency = String(d.currency ?? "").toUpperCase();
      if (!Number.isInteger(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency) || !name)
        throw new Error("bad tier");
      return {
        eventId: d.eventId as string,
        tierId: d.tierId as string | null,
        name: name.slice(0, 80),
        amountMinor: amount,
        currency,
        active: d.active !== false,
      };
    },
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { error } = await (c.supabase as Sb).rpc("admin_save_tier", {
      _event: data.eventId,
      _tier: data.tierId,
      _name: data.name,
      _amount: data.amountMinor,
      _currency: data.currency,
      _active: data.active,
    });
    await flush(c);
    return error ? { ok: false, message: errMessage(error.code) } : { ok: true };
  });

export const savePrivateDetails = createServerFn({ method: "POST" })
  .inputValidator((d: { eventId: unknown; address: unknown; notes: unknown }) => {
    if (!isUuid(d?.eventId)) throw new Error("bad input");
    return {
      eventId: d.eventId as string,
      address: String(d.address ?? "").slice(0, 500),
      notes: String(d.notes ?? "").slice(0, 2000),
    };
  })
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { error } = await (c.supabase as Sb).rpc("admin_save_private_details", {
      _event: data.eventId,
      _address: data.address,
      _notes: data.notes,
    });
    await flush(c);
    return error ? { ok: false, message: errMessage(error.code) } : { ok: true };
  });

// ================= Staff: orders =================

export type AdminOrder = {
  id: string;
  eventId: string;
  eventTitle: string;
  timezone: string;
  userId: string;
  tierName: string;
  amountMinor: number;
  currency: string;
  environment: string;
  status: OrderStatus;
  reviewReason: string | null;
  createdAt: string;
  expiresAt: string | null;
};
const PAGE = 25;

export const listOrders = createServerFn({ method: "GET" })
  .inputValidator((d: { status?: unknown; event?: unknown; page?: unknown }) => ({
    status: (ORDER_STATUSES as unknown[]).includes(d?.status)
      ? (d.status as OrderStatus)
      : undefined,
    event: isUuid(d?.event) ? (d.event as string) : undefined,
    page: Math.max(1, Math.min(200, Number(d?.page) || 1)),
  }))
  .handler(async ({ data }) => {
    const c = await ctx();
    if (!c)
      return {
        ok: false as const,
        items: [] as AdminOrder[],
        total: 0,
        page: 1,
        pageSize: PAGE,
        events: [] as { id: string; title: string }[],
      };
    const sb = c.supabase as Sb;
    let q = sb
      .from("orders")
      .select(
        "id, event_id, user_id, tier_name, amount_minor, currency, environment, status, review_reason, created_at, event:events(title, timezone), reservation:reservations(expires_at)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((data.page - 1) * PAGE, data.page * PAGE - 1);
    if (data.status) q = q.eq("status", data.status);
    if (data.event) q = q.eq("event_id", data.event);
    const [{ data: rows, error, count }, ev] = await Promise.all([
      q,
      sb.from("events").select("id, title").order("created_at", { ascending: false }).limit(100),
    ]);
    await flush(c);
    if (error)
      return {
        ok: false as const,
        items: [] as AdminOrder[],
        total: 0,
        page: data.page,
        pageSize: PAGE,
        events: [] as { id: string; title: string }[],
      };
    return {
      ok: true as const,
      page: data.page,
      pageSize: PAGE,
      total: count ?? 0,
      events: (ev.data ?? []) as { id: string; title: string }[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (rows ?? []).map((r: any): AdminOrder => ({
        id: r.id,
        eventId: r.event_id,
        eventTitle: r.event?.title ?? "—",
        timezone: r.event?.timezone ?? "Europe/Moscow",
        userId: r.user_id,
        tierName: r.tier_name,
        amountMinor: Number(r.amount_minor),
        currency: r.currency,
        environment: r.environment,
        status: r.status,
        reviewReason: r.review_reason,
        createdAt: r.created_at,
        expiresAt: r.reservation?.expires_at ?? null,
      })),
    };
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { id: unknown }) => {
    if (!isUuid(d?.id)) throw new Error("bad input");
    return { id: d.id as string };
  })
  .handler(async ({ data }) => {
    const c = await ctx();
    if (!c) return { ok: false as const };
    const sb = c.supabase as Sb;
    const [pay, evs, hist, refunds] = await Promise.all([
      sb
        .from("payments")
        .select(
          "provider, environment, provider_payment_id, status, amount_minor, currency, last_event_at",
        )
        .eq("order_id", data.id),
      sb
        .from("payment_events")
        .select("provider_event_id, kind, outcome, occurred_at, received_at")
        .eq("order_id", data.id)
        .order("received_at"),
      sb.rpc("order_history", { _order: data.id }),
      sb
        .from("refunds")
        .select("amount_minor, currency, status, created_at")
        .eq("order_id", data.id),
    ]);
    await flush(c);
    return {
      ok: true as const,
      payments: (pay.data ?? []) as Row[],
      events: (evs.data ?? []) as Row[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: ((hist.data ?? []) as any[]).map((h) => ({
        at: String(h.at),
        action: String(h.action),
        result: String(h.result),
      })),
      refunds: (refunds.data ?? []) as Row[],
    };
  });

export const refundSandbox = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: unknown; amountMinor: unknown; idem: unknown }) => {
    const amount = Number(d?.amountMinor);
    if (!isUuid(d?.orderId) || !isUuid(d?.idem) || !Number.isInteger(amount) || amount <= 0)
      throw new Error("bad input");
    return { orderId: d.orderId as string, amountMinor: amount, idem: d.idem as string };
  })
  .handler(async ({ data }): Promise<{ ok: true; replayed: boolean } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const { data: r, error } = await (c.supabase as Sb).rpc("refund_sandbox", {
      _order: data.orderId,
      _amount: data.amountMinor,
      _idem: data.idem,
    });
    await flush(c);
    if (error)
      return {
        ok: false,
        message:
          error.code === "22023"
            ? "Недопустимая сумма или повтор ключа с другими данными."
            : errMessage(error.code),
      };
    return { ok: true, replayed: Boolean(r?.replayed) };
  });

/** Симулятор: только development-сборка и только сотрудник с payment_simulate (aal2). */
export const simulatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: unknown; scenario: unknown }) => {
    if (!isUuid(d?.orderId) || !(SIMULATION_SCENARIOS as readonly unknown[]).includes(d?.scenario))
      throw new Error("bad input");
    return { orderId: d.orderId as string, scenario: d.scenario as SimulationScenario };
  })
  .handler(async ({ data }): Promise<{ ok: true; outcomes: string[] } | Fail> => {
    if (!(await sameOrigin())) return { ok: false, message: "Запрос отклонён." };
    const mode = await paymentModeServer();
    if (mode.mode !== "fake")
      return { ok: false, message: "Симулятор недоступен в этой среде (безопасный отказ)." };
    const c = await ctx();
    if (!c) return { ok: false, message: "Среда не подключена." };
    const sb = c.supabase as Sb;
    const { data: can } = await sb.rpc("staff_can", { _cap: "payment_simulate" });
    const { data: order } = await sb
      .from("orders")
      .select("id, amount_minor, currency, environment")
      .eq("id", data.orderId)
      .maybeSingle();
    await flush(c);
    if (can !== true || !order) return { ok: false, message: "Нет доступа к этому действию." };
    if (order.environment !== "sandbox") return { ok: false, message: "Только sandbox-заказы." };
    const { FakePaymentProvider, buildScenario, processNotification } =
      await import("./payments/fake-provider.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const provider = new FakePaymentProvider(process.env["FAKE_PAYMENT_WEBHOOK_SECRET"]!);
    const envs = await buildScenario(
      provider,
      { id: order.id, amountMinor: Number(order.amount_minor), currency: order.currency },
      data.scenario,
    );
    const outcomes: string[] = [];
    for (const e of envs) outcomes.push(await processNotification(supabaseAdmin, provider, e));
    return { ok: true, outcomes };
  });
