/** Telegram @username: 5–32 символа, латиница/цифры/_, начинается с буквы. Ведущий @ отбрасывается. */
export const TELEGRAM_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export function normalizeTelegramUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "");
}

export function telegramUsernameError(raw: string): string | null {
  const v = normalizeTelegramUsername(raw);
  if (!v) return "Укажите ваш Telegram @username.";
  if (!TELEGRAM_USERNAME_RE.test(v))
    return "Username: 5–32 символа, латиница, цифры и _, начинается с буквы.";
  return null;
}
