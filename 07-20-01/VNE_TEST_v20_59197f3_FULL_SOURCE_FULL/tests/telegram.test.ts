import { describe, expect, test } from "bun:test";
import { normalizeTelegramUsername, telegramUsernameError } from "../src/lib/telegram-username";
import { parseTelegramAuth, verifyTelegramAuth } from "../src/lib/auth/telegram-verify";

describe("telegram username", () => {
  test("required and format", () => {
    expect(telegramUsernameError("")).not.toBeNull();
    expect(telegramUsernameError("@abc")).not.toBeNull();
    expect(telegramUsernameError("1abcde")).not.toBeNull();
    expect(telegramUsernameError("ab-cde")).not.toBeNull();
    expect(telegramUsernameError("@vne_guest")).toBeNull();
    expect(normalizeTelegramUsername(" @vne_guest ")).toBe("vne_guest");
  });
});

async function sign(fields: Record<string, string | number>, token: string) {
  const enc = new TextEncoder();
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(token));
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(check))), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

describe("telegram login signature", () => {
  const token = "123:synthetic";
  const now = 1_800_000_000;
  test("valid, forged, expired", async () => {
    const f = { id: 42, auth_date: now, username: "vne_guest" };
    const hash = await sign(f, token);
    const d = parseTelegramAuth({ ...f, hash });
    expect(await verifyTelegramAuth(d, token, now + 5)).toBe(true);
    expect(await verifyTelegramAuth({ ...d, id: 43 }, token, now + 5)).toBe(false);
    expect(await verifyTelegramAuth(d, "other", now + 5)).toBe(false);
    expect(await verifyTelegramAuth(d, token, now + 601)).toBe(false);
    expect(() => parseTelegramAuth({ id: "x", auth_date: now, hash })).toThrow();
  });
});
