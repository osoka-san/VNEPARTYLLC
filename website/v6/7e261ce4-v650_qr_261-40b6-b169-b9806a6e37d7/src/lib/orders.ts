/** День 06: клиентобезопасные типы, подписи статусов, деньги и часовые пояса. */

export type OrderStatus =
  "awaiting_payment" | "paid" | "failed" | "cancelled" | "expired" | "needs_review" | "refunded";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Резерв · ожидание оплаты",
  paid: "Оплачено · участие подтверждено",
  failed: "Отказ оплаты",
  cancelled: "Отменён",
  expired: "Резерв истёк",
  needs_review: "Проверка платежа",
  refunded: "Возврат (sandbox)",
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

/**
 * Таблица переходов заказа (документация; исполняется в private.apply_payment_event / refund_sandbox).
 * Любой иной переход — noop и запись в журнал.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["paid", "failed", "cancelled", "expired", "needs_review"],
  paid: ["refunded", "needs_review"],
  failed: ["needs_review"],
  cancelled: ["needs_review"],
  expired: ["needs_review"],
  needs_review: ["refunded"],
  refunded: [],
};

export function formatMoney(amountMinor: number, currency: string): string {
  try {
    const digits =
      new Intl.NumberFormat("ru-RU", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
      amountMinor / 10 ** digits,
    );
  } catch {
    return `${amountMinor} (мин. ед.) ${currency}`;
  }
}

/** Парсинг «1234.50» → целые минимальные единицы (без плавающей арифметики). */
export function parseMajorToMinor(input: string, fractionDigits = 2): number | null {
  const s = input.trim().replace(",", ".");
  const m = new RegExp(`^(\\d{1,9})(?:\\.(\\d{1,${fractionDigits}}))?$`).exec(s);
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(fractionDigits, "0");
  return Number(m[1]) * 10 ** fractionDigits + Number(frac || "0");
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** «YYYY-MM-DDTHH:mm» в поясе события → ISO UTC. */
export function zonedInputToUtc(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return new Date(t).toISOString();
}

/** ISO UTC → «YYYY-MM-DDTHH:mm» в поясе события (для полей формы). */
export function utcToZonedInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + tzOffsetMs(t, tz));
  return d.toISOString().slice(0, 16);
}

export function formatInZone(iso: string | null, tz: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type EventForm = {
  slug: string;
  title: string;
  description: string;
  timezone: string;
  starts_at: string | null;
  capacity: number | null;
  sales_close_at: string | null;
  reserve_ttl_minutes: number;
  qr_release_at: string | null;
  address_reveal_at: string | null;
  entry_opens_at: string | null;
  entry_closes_at: string | null;
};

/** Проверка разумного порядка дат (дублирует триггер БД ради понятных сообщений). */
export function validateEventForm(f: EventForm): string | null {
  if (!/^[a-z0-9-]{2,80}$/.test(f.slug)) return "Slug: латиница, цифры и дефис, 2–80 символов.";
  if (f.title.trim().length < 2 || f.title.length > 120) return "Название: 2–120 символов.";
  if (
    f.capacity !== null &&
    (!Number.isInteger(f.capacity) || f.capacity < 1 || f.capacity > 100000)
  )
    return "Вместимость: целое 1–100000.";
  if (
    !Number.isInteger(f.reserve_ttl_minutes) ||
    f.reserve_ttl_minutes < 5 ||
    f.reserve_ttl_minutes > 240
  )
    return "Срок резерва: 5–240 минут.";
  const t = (s: string | null) => (s ? Date.parse(s) : null);
  const start = t(f.starts_at);
  const close = t(f.sales_close_at);
  const qr = t(f.qr_release_at);
  const addr = t(f.address_reveal_at);
  const eo = t(f.entry_opens_at);
  const ec = t(f.entry_closes_at);
  if (close !== null && start !== null && close > start)
    return "Продажи должны закрываться до начала.";
  if (eo !== null && ec !== null && ec <= eo) return "Окно входа: закрытие позже открытия.";
  if (qr !== null && eo !== null && qr > eo) return "QR выдаётся не позже открытия входа.";
  if (addr !== null && start !== null && addr > start) return "Адрес раскрывается не позже начала.";
  return null;
}

export const TIMEZONES = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Europe/Berlin",
  "UTC",
] as const;
