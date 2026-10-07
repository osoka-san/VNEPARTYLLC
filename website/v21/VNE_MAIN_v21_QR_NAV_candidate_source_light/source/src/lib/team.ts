export const GRANTABLE_ROLES = [
  "admin",
  "editor",
  "moderator",
  "scanner",
  "shift_lead",
  "finance",
] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  editor: "Редактор",
  moderator: "Модератор",
  scanner: "Контроль входа",
  shift_lead: "Старший смены",
  finance: "Финансы (sandbox-возвраты)",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Роли, которые действуют только в рамках конкретного события. */
export const EVENT_ROLES: readonly GrantableRole[] = ["moderator", "scanner", "shift_lead"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GrantInput = {
  ok: true;
  email: string;
  role: GrantableRole;
  eventId: string | null;
  validUntil: string | null;
};

export function validateGrantInput(
  d: unknown,
  now = Date.now(),
): GrantInput | { ok: false; message: string } {
  const r = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const email = String(r["email"] ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const role = String(r["role"] ?? "");
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Укажите корректный email." };
  if (!(GRANTABLE_ROLES as readonly string[]).includes(role))
    return { ok: false, message: "Эту роль нельзя назначить здесь." };
  const isEvent = EVENT_ROLES.includes(role as GrantableRole);
  const eventRaw = String(r["eventId"] ?? "").trim();
  const untilRaw = String(r["validUntil"] ?? "").trim();
  if (isEvent && !UUID_RE.test(eventRaw))
    return { ok: false, message: "Для этой роли выберите событие." };
  if (!isEvent && eventRaw)
    return { ok: false, message: "Эта роль действует на весь сайт, событие не нужно." };
  if (isEvent && !untilRaw)
    return { ok: false, message: "Для роли события укажите срок действия." };
  let validUntil: string | null = null;
  if (untilRaw) {
    const t = Date.parse(untilRaw);
    if (!Number.isFinite(t) || t <= now)
      return { ok: false, message: "Срок действия должен быть в будущем." };
    validUntil = new Date(t).toISOString();
  }
  return {
    ok: true,
    email,
    role: role as GrantableRole,
    eventId: isEvent ? eventRaw : null,
    validUntil,
  };
}
