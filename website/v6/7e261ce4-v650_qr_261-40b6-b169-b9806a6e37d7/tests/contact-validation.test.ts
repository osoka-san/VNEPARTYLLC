import { describe, expect, test } from "bun:test";
import { isValidContact } from "../src/lib/contact-validation";

describe("isValidContact", () => {
  test.each([
    "",
    "   ",
    "-------",
    "(((((((",
    "+ ( ) -",
    "123456",
    "1234567890123456",
    "a@b@c.ru",
    "name@example",
    "name @example.com",
    "abc",
    "+7 abc 123 45 67",
  ])("rejects %p", (v) => expect(isValidContact(v)).toBe(false));
  test.each(["test@example.invalid", "+7 (999) 123-45-67", "8 999 123 45 67", "1234567"])(
    "accepts %p",
    (v) => expect(isValidContact(v)).toBe(true),
  );
});
