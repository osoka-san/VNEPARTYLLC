import { describe, expect, test } from "bun:test";
import {
  MEMBERSHIP_RESPONSE,
  normalizeMembershipDecision,
  validateMembershipInput,
} from "../src/lib/membership";

describe("membership request", () => {
  test("normalizes accepted fields", () => {
    const result = validateMembershipInput({
      name: "  Савик  ",
      email: " ADMIN@EXAMPLE.COM ",
      telegram: " @Savik_3003 ",
      event: "light-study-01",
    });
    expect(result).toEqual({
      ok: true,
      values: {
        displayName: "Савик",
        email: "admin@example.com",
        telegramUsername: "Savik_3003",
        eventSlug: "light-study-01",
      },
    });
  });

  test("rejects invalid and oversized values", () => {
    const result = validateMembershipInput({
      name: "",
      email: "bad",
      telegram: "@й",
      event: "../x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(["email", "event", "name", "telegram"]);
  });

  test("decision allowlist cannot assign roles", () => {
    expect(normalizeMembershipDecision("approved")).toBe("approved");
    expect(normalizeMembershipDecision("owner")).toBeNull();
    expect(normalizeMembershipDecision({ role: "owner" })).toBeNull();
  });

  test("success response does not reveal duplicate state", () => {
    expect(MEMBERSHIP_RESPONSE).not.toContain("существ");
    expect(MEMBERSHIP_RESPONSE).not.toContain("повтор");
  });
});
