/**
 * Контракт ручной выдачи и pass DTO модуля vne-pass-kit. Чистые функции: общие для сервера и тестов.
 * Тип карты (SECURITY/ARTIST) никогда не создаёт прав на сайте — права только в staff_assignments.
 */
import type { PassAccess, PassDTO, PassStatus } from "@/components/tickets/types";

export const ACCESS: readonly PassAccess[] = ["GENERAL", "VIP", "SECURITY", "ARTIST"];
const STATUSES: readonly PassStatus[] = ["active", "revoked", "expired", "used"];

/** Фиксированный allowlist путей модуля. retry-delivery намеренно отсутствует (не отправляем сообщения). */
export const ADMIN_PATHS = {
  issue: "/api/admin/issue",
  get: "/api/admin/get",
  revoke: "/api/admin/revoke",
} as const;
export const READ_PATH = "/api/pass/read" as const;
export type ServicePath = (typeof ADMIN_PATHS)[keyof typeof ADMIN_PATHS] | typeof READ_PATH;

export type ManualIssue = {
  userId: string;
  name: string;
  telegram: string | null;
  access: PassAccess;
  validUntil: string;
  event: {
    id: string;
    title: string;
    date: string;
    shuttleTime: string;
    meetingPoint: string;
    totalTickets: number;
  };
  recipient: null | { channel: "email" | "telegram"; address: string };
};

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, min: number, max: number) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max ? v.trim() : null;

export const TELEGRAM_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PASS_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
export const VIEW_TOKEN_RE = /^[\w-]{43}$/;

function validDate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateManualIssue(input: unknown, now = Date.now()): Check<ManualIssue> {
  if (!isObj(input)) return { ok: false, error: "invalid_input" };
  const userId = str(input["userId"], 1, 120);
  if (!userId) return { ok: false, error: "invalid_user_id" };
  const name = input["name"] === "" || input["name"] == null ? "" : str(input["name"], 1, 80);
  if (name === null) return { ok: false, error: "invalid_name" };
  const tgRaw = input["telegram"];
  const telegram =
    tgRaw == null || tgRaw === ""
      ? null
      : typeof tgRaw === "string" && TELEGRAM_RE.test(tgRaw)
        ? tgRaw
        : undefined;
  if (telegram === undefined) return { ok: false, error: "invalid_telegram" };
  if (!name && !telegram) return { ok: false, error: "name_or_telegram_required" };
  const access = input["access"];
  if (!ACCESS.includes(access as PassAccess)) return { ok: false, error: "invalid_access" };
  const vu = input["validUntil"];
  const vuTime = typeof vu === "string" ? Date.parse(vu) : NaN;
  if (Number.isNaN(vuTime) || vuTime <= now) return { ok: false, error: "invalid_valid_until" };
  const ev = input["event"];
  if (!isObj(ev)) return { ok: false, error: "invalid_event" };
  const id = str(ev["id"], 1, 120);
  const title = str(ev["title"], 1, 90);
  const date = typeof ev["date"] === "string" && validDate(ev["date"]) ? ev["date"] : null;
  const shuttleTime =
    typeof ev["shuttleTime"] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(ev["shuttleTime"])
      ? ev["shuttleTime"]
      : null;
  const meetingPoint = str(ev["meetingPoint"], 1, 120);
  const total = ev["totalTickets"];
  const totalTickets =
    typeof total === "number" && Number.isInteger(total) && total >= 1 && total <= 100000
      ? total
      : null;
  if (!id || !title || !date || !shuttleTime || !meetingPoint || totalTickets === null)
    return { ok: false, error: "invalid_event" };
  const r = input["recipient"];
  let recipient: ManualIssue["recipient"] = null;
  if (r != null) {
    if (!isObj(r)) return { ok: false, error: "invalid_recipient" };
    const address = r["address"];
    if (
      r["channel"] === "email" &&
      typeof address === "string" &&
      address.length <= 254 &&
      /^[^\s@<>,;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(address)
    )
      recipient = { channel: "email", address };
    else if (
      r["channel"] === "telegram" &&
      typeof address === "string" &&
      /^\d{1,20}$/.test(address)
    )
      recipient = { channel: "telegram", address };
    else return { ok: false, error: "invalid_recipient" };
  }
  return {
    ok: true,
    value: {
      userId,
      name,
      telegram,
      access: access as PassAccess,
      validUntil: new Date(vuTime).toISOString(),
      event: { id, title, date, shuttleTime, meetingPoint, totalTickets },
      recipient,
    },
  };
}

/**
 * HTTPS-адрес модуля. http://localhost|127.0.0.1 — только в development.
 * Без логина/пароля, query и hash. Возвращает нормализованную базу без завершающего «/».
 */
export function validateServiceUrl(raw: string | undefined, development: boolean): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol === "https:") {
    if (local && !development) return null;
  } else if (!(u.protocol === "http:" && local && development)) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/** Только перечисленные поля; всё остальное из ответа модуля отбрасывается. */
export function sanitizePass(raw: unknown): PassDTO | null {
  if (!isObj(raw) || !isObj(raw["event"])) return null;
  const e = raw["event"];
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  const id = s(raw["id"]);
  const access = raw["access"] as PassAccess;
  const status = raw["status"] as PassStatus;
  if (!id || !ACCESS.includes(access) || !STATUSES.includes(status)) return null;
  const n = raw["sequenceNumber"];
  return {
    id,
    ticketCode: s(raw["ticketCode"]) ?? `VNE-${id.toUpperCase()}`,
    shortId: s(raw["shortId"]),
    userId: s(raw["userId"]) ?? "",
    name: s(raw["name"]) ?? "",
    telegram: s(raw["telegram"]) ?? null,
    access,
    theme: s(raw["theme"]) ?? "ember",
    sequenceNumber: typeof n === "number" ? n : null,
    sequenceLabel: s(raw["sequenceLabel"]) ?? null,
    event: {
      id: s(e["id"]) ?? "",
      title: s(e["title"]) ?? "",
      date: s(e["date"]),
      shuttleTime: s(e["shuttleTime"]),
      meetingPoint: s(e["meetingPoint"]),
      totalTickets: typeof e["totalTickets"] === "number" ? e["totalTickets"] : undefined,
      when: s(e["when"]),
      venue: s(e["venue"]),
    },
    status,
    source: s(raw["source"]) ?? "",
    demo: raw["demo"] === true ? true : undefined,
    // QR существует только у активного пропуска.
    qrText: status === "active" ? (s(raw["qrText"]) ?? null) : null,
    validUntil: s(raw["validUntil"]) ?? "",
  };
}

/** Из URL модуля `${origin}/pass#<token>` берём только токен и строим путь сайта /pass#token. */
export function passPathFromServiceUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const i = url.lastIndexOf("#");
  const token = i >= 0 ? url.slice(i + 1) : "";
  return VIEW_TOKEN_RE.test(token) ? `/pass#${token}` : null;
}
