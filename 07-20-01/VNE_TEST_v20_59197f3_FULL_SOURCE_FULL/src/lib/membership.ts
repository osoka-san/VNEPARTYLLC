import { TELEGRAM_USERNAME_RE, normalizeTelegramUsername } from "./telegram-username";

export const MEMBERSHIP_RESPONSE =
  "Заявка сохранена в тестовой среде. Письма сейчас не отправляются — ответ появится, когда доставка будет подключена.";

export type MembershipInput = {
  name: unknown;
  email: unknown;
  telegram: unknown;
  event?: unknown;
  website?: unknown;
};

export type MembershipValues = {
  displayName: string;
  email: string;
  telegramUsername: string;
  eventSlug: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT = /^[a-z0-9-]{3,64}$/;

export function validateMembershipInput(
  input: MembershipInput,
):
  | { ok: true; values: MembershipValues }
  | { ok: false; errors: Partial<Record<"name" | "email" | "telegram" | "event", string>> } {
  const displayName = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const telegramUsername =
    typeof input.telegram === "string" ? normalizeTelegramUsername(input.telegram) : "";
  const eventSlug =
    typeof input.event === "string" && input.event.trim() ? input.event.trim() : null;
  const errors: Partial<Record<"name" | "email" | "telegram" | "event", string>> = {};

  if (!displayName || displayName.length > 80) errors.name = "Укажите имя до 80 символов.";
  if (!EMAIL.test(email) || email.length > 254) errors.email = "Укажите корректный email.";
  if (!TELEGRAM_USERNAME_RE.test(telegramUsername))
    errors.telegram = "Username: 5–32 символа, латиница, цифры и _, начинается с буквы.";
  if (eventSlug && !EVENT.test(eventSlug)) errors.event = "Выбранное событие не найдено.";

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, values: { displayName, email, telegramUsername, eventSlug } };
}

export function normalizeMembershipDecision(value: unknown): "approved" | "rejected" | null {
  return value === "approved" || value === "rejected" ? value : null;
}

/** Согласие засчитывается только при строгом boolean true от клиента; строки/1/"on"/undefined — нет. */
export function hasExplicitConsent(v: unknown): v is true {
  return v === true;
}
