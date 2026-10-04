import { describe, expect, test } from "bun:test";
import { validateGrantInput } from "../src/lib/team";

describe("team role grant validation", () => {
  test("rejects owner and unknown roles", () => {
    expect(validateGrantInput({ email: "a@b.co", role: "owner" }).ok).toBe(false);
    expect(validateGrantInput({ email: "a@b.co", role: "root" }).ok).toBe(false);
  });
  test("rejects bad email and non-object", () => {
    expect(validateGrantInput({ email: "nope", role: "admin" }).ok).toBe(false);
    expect(validateGrantInput(null).ok).toBe(false);
  });
  test("normalizes valid input", () => {
    expect(validateGrantInput({ email: " A@B.co ", role: "editor" })).toEqual({
      ok: true,
      email: "a@b.co",
      role: "editor",
      eventId: null,
      validUntil: null,
    });
  });
});

describe("event-scoped grants (audit P1)", () => {
  const ev = "00000000-0000-4000-b000-000000000001";
  test("event roles require an event AND an expiry", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(validateGrantInput({ email: "a@b.co", role: "moderator" }).ok).toBe(false);
    for (const role of ["moderator", "scanner", "shift_lead"])
      expect(validateGrantInput({ email: "a@b.co", role, eventId: ev }).ok).toBe(false);
    expect(
      validateGrantInput({ email: "a@b.co", role: "moderator", eventId: ev, validUntil: future })
        .ok,
    ).toBe(true);
    expect(validateGrantInput({ email: "a@b.co", role: "admin" }).ok).toBe(true);
  });
  test("global roles reject an event", () => {
    expect(validateGrantInput({ email: "a@b.co", role: "editor", eventId: ev }).ok).toBe(false);
  });
  test("expiry must be in the future", () => {
    const now = Date.parse("2026-09-25T00:00:00Z");
    expect(
      validateGrantInput(
        { email: "a@b.co", role: "scanner", eventId: ev, validUntil: "2026-09-24T00:00:00Z" },
        now,
      ).ok,
    ).toBe(false);
    const ok = validateGrantInput(
      { email: "a@b.co", role: "scanner", eventId: ev, validUntil: "2026-09-26T00:00:00Z" },
      now,
    );
    expect(ok.ok && ok.validUntil).toBe("2026-09-26T00:00:00.000Z");
  });
});
