// Синтетический функциональный контракт. Не является проверкой реального Auth.
import { describe, expect, test } from "bun:test";
import { readAuthConfig } from "../src/lib/auth/config";
import {
  MSG,
  classifyCallbackError,
  decideStaff,
  isSameOrigin,
  performPasswordUpdate,
  performRecovery,
  performSignIn,
  type AuthClientLike,
} from "../src/lib/auth/auth-core";

const base = {
  VNE_AUTH_ENV: "staging",
  VNE_SUPABASE_URL: "https://abcdefgh.supabase.co",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  VNE_SITE_URL: "https://vne.example",
};

describe("config fail-closed", () => {
  test("empty env disabled", () => expect(readAuthConfig({}).enabled).toBe(false));
  const cloud = {
    SUPABASE_URL: "https://cloudref.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_c",
  };
  test("cloud fallback enables staging", () => {
    const c = readAuthConfig(cloud);
    expect(c.enabled && c.env).toBe("staging");
    expect(c.enabled && c.url).toBe("https://cloudref.supabase.co");
  });
  test("cloud fallback refuses production", () =>
    expect(readAuthConfig({ ...cloud, VNE_AUTH_ENV: "production" }).enabled).toBe(false));
  test("cloud fallback refuses secret key", () =>
    expect(readAuthConfig({ ...cloud, SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }).enabled).toBe(
      false,
    ));
  test("explicit VNE wins over cloud", () => {
    const c = readAuthConfig({ ...cloud, ...base });
    expect(c.enabled && c.url).toBe("https://abcdefgh.supabase.co");
  });
  test("partial env disabled", () =>
    expect(readAuthConfig({ ...base, VNE_SITE_URL: undefined }).enabled).toBe(false));
  test("production env refused", () =>
    expect(readAuthConfig({ ...base, VNE_AUTH_ENV: "production" })).toEqual({
      enabled: false,
      reason: "env_not_allowed",
    }));
  test("http refused for staging", () =>
    expect(readAuthConfig({ ...base, VNE_SUPABASE_URL: "http://127.0.0.1:54321" }).enabled).toBe(
      false,
    ));
  test("local http allowed only in development", () =>
    expect(
      readAuthConfig({
        ...base,
        VNE_AUTH_ENV: "development",
        VNE_SUPABASE_URL: "http://127.0.0.1:54321",
      }).enabled,
    ).toBe(true));
  test("owner-confirmed test project allowed as staging", () =>
    expect(
      readAuthConfig({ ...base, VNE_SUPABASE_URL: "https://xrocuwlofxhxoxajukne.supabase.co" })
        .enabled,
    ).toBe(true));
  test("test project still refused as production", () =>
    expect(
      readAuthConfig({
        ...base,
        VNE_AUTH_ENV: "production",
        VNE_SUPABASE_URL: "https://xrocuwlofxhxoxajukne.supabase.co",
      }).enabled,
    ).toBe(false));
  test("secret key refused", () =>
    expect(readAuthConfig({ ...base, VNE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }).enabled).toBe(
      false,
    ));
  test("valid staging enabled", () => expect(readAuthConfig(base).enabled).toBe(true));
});

function client(err: { status?: number; message?: string } | null, throws = false): AuthClientLike {
  const r = async () => {
    if (throws) throw new Error("net");
    return { error: err };
  };
  return { auth: { signInWithPassword: r, signOut: r, resetPasswordForEmail: r, updateUser: r } };
}

describe("sign-in contract", () => {
  test("success uses safe redirect", async () =>
    expect(
      await performSignIn(client(null), {
        email: "a@b.invalid",
        password: "x",
        redirect: "//evil.example",
      }),
    ).toEqual({ ok: true, redirect: "/member" }));
  test("allowed redirect kept", async () =>
    expect(
      await performSignIn(client(null), { email: "a@b.invalid", password: "x", redirect: "/scan" }),
    ).toEqual({ ok: true, redirect: "/scan" }));
  test("unknown user and wrong password same message", async () => {
    const a = await performSignIn(client({ status: 400, message: "Invalid login credentials" }), {
      email: "a@b.invalid",
      password: "x",
      redirect: null,
    });
    const b = await performSignIn(client({ status: 400, message: "Email not confirmed" }), {
      email: "a@b.invalid",
      password: "x",
      redirect: null,
    });
    expect(a).toEqual({ ok: false, message: MSG.invalid });
    expect(b).toEqual(a);
  });
  test("network error", async () =>
    expect(
      await performSignIn(client(null, true), {
        email: "a@b.invalid",
        password: "x",
        redirect: null,
      }),
    ).toEqual({ ok: false, message: MSG.network }));
  test("invalid input never calls client", async () =>
    expect(
      await performSignIn(client(null, true), { email: "bad", password: "x", redirect: null }),
    ).toEqual({ ok: false, message: MSG.input }));
});

describe("recovery contract", () => {
  test("same answer for existing and missing account", async () => {
    expect(await performRecovery(client(null), { email: "a@b.invalid" }, "https://x/cb")).toEqual({
      ok: true,
    });
    expect(
      await performRecovery(
        client({ status: 400, message: "User not found" }),
        { email: "a@b.invalid" },
        "https://x/cb",
      ),
    ).toEqual({ ok: true });
  });
  test("weak password refused", async () =>
    expect(await performPasswordUpdate(client(null), { password: "short" })).toEqual({
      ok: false,
      message: MSG.weak,
    }));
});

describe("callback, origin, staff", () => {
  test("expired", () =>
    expect(classifyCallbackError({ status: 403, code: "otp_expired" })).toBe("expired"));
  test("invalid", () =>
    expect(classifyCallbackError({ status: 400, message: "bad code" })).toBe("invalid"));
  test("network", () => expect(classifyCallbackError({ status: 503 })).toBe("network"));
  test("origin", () => {
    expect(isSameOrigin("https://vne.example", "https://vne.example/_serverFn/x")).toBe(true);
    expect(isSameOrigin("https://evil.example", "https://vne.example/_serverFn/x")).toBe(false);
    expect(isSameOrigin(null, "https://vne.example/")).toBe(false);
  });
  test("staff AND semantics", () => {
    expect(decideStaff({ configured: false, userId: "u", aal: "aal2", rpcAllowed: true })).toBe(
      "unconfigured",
    );
    expect(decideStaff({ configured: true, userId: null, aal: null, rpcAllowed: null })).toBe(
      "signin",
    );
    expect(decideStaff({ configured: true, userId: "u", aal: "aal1", rpcAllowed: true })).toBe(
      "mfa",
    );
    expect(decideStaff({ configured: true, userId: "u", aal: "aal2", rpcAllowed: false })).toBe(
      "denied",
    );
    expect(decideStaff({ configured: true, userId: "u", aal: "aal2", rpcAllowed: null })).toBe(
      "error",
    );
    expect(decideStaff({ configured: true, userId: "u", aal: "aal2", rpcAllowed: true })).toBe(
      "allowed",
    );
  });
});
