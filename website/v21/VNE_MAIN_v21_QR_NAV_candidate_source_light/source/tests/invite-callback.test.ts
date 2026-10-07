import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  expireAuthCookies,
  finishCallback,
  sha256Hex,
  type FinishDeps,
} from "../src/lib/auth/invite-callback";

const base = (o: Partial<FinishDeps> = {}): FinishDeps & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    getUserId: async () => "u1",
    accept: async () => "accepted",
    revokeAsUser: async () => (calls.push("user"), true),
    revokeAsAdmin: async () => (calls.push("admin"), true),
    ...o,
  };
};

describe("auth callback fail-closed (review cf258c05 P1)", () => {
  test("accepted / not_required → ok, no revoke", async () => {
    for (const v of ["accepted", "not_required"]) {
      const d = base({ accept: async () => v });
      expect(await finishCallback(d, null, "/member")).toEqual({ ok: true, to: "/member" });
      expect(d.calls).toEqual([]);
    }
  });
  test("DB unavailable (accept throws) → deny + revoke", async () => {
    const d = base({
      accept: async () => {
        throw new Error("db down");
      },
    });
    const r = await finishCallback(d, "h", "/member");
    expect(r).toEqual({ ok: false, to: "/login?error=network", revoked: true });
  });
  test("getUser throws → deny + revoke", async () => {
    const d = base({
      getUserId: async () => {
        throw new Error("x");
      },
    });
    expect((await finishCallback(d, null, "/member")).ok).toBe(false);
  });
  test("denied + user signOut error → admin revoke fallback", async () => {
    const d = base({ accept: async () => "denied", revokeAsUser: async () => false });
    const r = await finishCallback(d, "h", "/member");
    expect(r).toEqual({ ok: false, to: "/login?error=invite", revoked: true });
  });
  test("denied + both revokes throw → explicit revoke failure, still deny", async () => {
    const d = base({
      accept: async () => "denied",
      revokeAsUser: async () => {
        throw new Error("a");
      },
      revokeAsAdmin: async () => {
        throw new Error("b");
      },
    });
    expect(await finishCallback(d, "h", "/member")).toEqual({
      ok: false,
      to: "/login?error=revoke",
      revoked: false,
    });
  });
  test("expire cookies: only sb-*, empty value, maxAge 0", () => {
    const c = expireAuthCookies(["sb-x-auth-token", "vne_motion"], ["sb-x-auth-token.0"]);
    expect(c.map((x) => x.name).sort()).toEqual(["sb-x-auth-token", "sb-x-auth-token.0"]);
    expect(c.every((x) => x.value === "" && x.options.maxAge === 0)).toBe(true);
  });
  test("route: deny path never forwards exchange cookies; no raw catch go(network)", () => {
    const src = readFileSync("src/routes/auth.callback.ts", "utf8");
    expect(src).toContain("return deny(result.to)");
    expect(src).toContain('return deny("/login?error=network")');
    expect(src).not.toMatch(/catch\s*\{\s*return go\(/);
    expect(src).not.toMatch(/console\.\w+\([^)]*nonce/);
  });
  test("sha256 hex", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
