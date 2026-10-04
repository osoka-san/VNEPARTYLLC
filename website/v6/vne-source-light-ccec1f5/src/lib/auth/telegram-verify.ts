/**
 * Проверка данных Telegram Login Widget (https://core.telegram.org/widgets/login#checking-authorization).
 * secret = SHA256(bot_token); hash = HMAC_SHA256(data_check_string, secret). Web Crypto — работает на edge.
 */
export type TelegramAuthData = {
  id: number;
  auth_date: number;
  hash: string;
  first_name?: string | undefined;
  last_name?: string | undefined;
  username?: string | undefined;
  photo_url?: string | undefined;
};

export const TELEGRAM_MAX_AGE_SEC = 600;

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export function parseTelegramAuth(d: unknown): TelegramAuthData {
  const o = (d ?? {}) as Record<string, unknown>;
  const id = Number(o["id"]);
  const auth_date = Number(o["auth_date"]);
  const hash = String(o["hash"] ?? "");
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(auth_date) ||
    !/^[a-f0-9]{64}$/.test(hash)
  )
    throw new Error("bad telegram data");
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).slice(0, 256) : undefined);
  return {
    id,
    auth_date,
    hash,
    first_name: s("first_name"),
    last_name: s("last_name"),
    username: s("username"),
    photo_url: s("photo_url"),
  };
}

export async function verifyTelegramAuth(
  data: TelegramAuthData,
  botToken: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (nowSec - data.auth_date > TELEGRAM_MAX_AGE_SEC || data.auth_date - nowSec > 60) return false;
  const { hash, ...rest } = data;
  const check = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const enc = new TextEncoder();
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(botToken));
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = hex(await crypto.subtle.sign("HMAC", key, enc.encode(check)));
  if (sig.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
