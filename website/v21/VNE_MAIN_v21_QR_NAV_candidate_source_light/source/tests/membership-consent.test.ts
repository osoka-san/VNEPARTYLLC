import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { hasExplicitConsent } from "../src/lib/membership";

describe("membership consent", () => {
  it("accepts only strict boolean true", () => {
    expect(hasExplicitConsent(true)).toBe(true);
    for (const v of [undefined, null, false, "true", "on", 1, {}])
      expect(hasExplicitConsent(v)).toBe(false);
  });
  it("server rejects before writing; /apply sends boolean consent", () => {
    const fn = readFileSync("src/lib/membership.functions.ts", "utf8");
    expect(fn.indexOf("hasExplicitConsent(data.consent)")).toBeGreaterThan(-1);
    expect(fn.indexOf("hasExplicitConsent(data.consent)")).toBeLessThan(
      fn.indexOf("submit_membership_request"),
    );
    const page = readFileSync("src/routes/apply.tsx", "utf8");
    expect(page).toMatch(/useState\(false\)/);
    expect(page).toMatch(/\n\s+consent,\n/);
    expect(page).toMatch(/method="post"/);
  });
  it("reply form is POST-only and hydration-guarded", () => {
    const s = readFileSync("src/routes/member_.applications.$id.tsx", "utf8");
    expect(s).toMatch(/method="post"/);
    expect(s).toMatch(/if \(!hydrated\) return;/);
    expect(s).toMatch(/disabled=\{!hydrated \|\| pending\}/);
  });
});
