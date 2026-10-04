import { describe, expect, it } from "vitest";
import { safeRedirect } from "../src/lib/auth/safe-redirect";

describe("safeRedirect", () => {
  it("keeps allowed internal routes", () => {
    expect(safeRedirect("/member")).toBe("/member");
    expect(safeRedirect("/admin?tab=1")).toBe("/admin?tab=1");
    expect(safeRedirect("/events/synthetic-a")).toBe("/events/synthetic-a");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/memberx",
    "/unknown",
    "",
    null,
    "/member\n",
  ])("rejects %s", (v) => {
    expect(safeRedirect(v)).toBe("/member");
  });
});
