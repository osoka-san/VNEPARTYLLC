import { expect, test } from "bun:test";
import { normalizeTelegramUsername } from "../src/lib/telegram-username";
test("telegram accepts @, bare and t.me links", () => {
  for (const v of ["@vne_guest", "vne_guest", "https://t.me/vne_guest", "t.me/vne_guest?x=1"])
    expect(normalizeTelegramUsername(v)).toBe("vne_guest");
});
