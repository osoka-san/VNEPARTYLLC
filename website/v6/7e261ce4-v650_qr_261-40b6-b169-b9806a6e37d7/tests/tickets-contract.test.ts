import { describe, expect, test } from "bun:test";
import {
  passPathFromServiceUrl,
  sanitizePass,
  validateManualIssue,
  validateServiceUrl,
} from "../src/lib/tickets/contract";
import {
  handleAdminAction,
  handleReadPass,
  readPassConfig,
  type FetchLike,
} from "../src/lib/tickets/pass-proxy.server";

const KEY = "k".repeat(40);
const TOKEN = "a".repeat(43);
const future = new Date(Date.now() + 86400000).toISOString();
const payload = {
  userId: "synthetic-user-1",
  name: "SYNTHETIC GUEST",
  telegram: null,
  access: "VIP",
  validUntil: future,
  event: {
    id: "synthetic-event",
    title: "SYNTHETIC",
    date: "2099-01-02",
    shuttleTime: "20:00",
    meetingPoint: "Synthetic point",
    totalTickets: 40,
  },
  recipient: null,
};
const pass = {
  id: "11111111-1111-1111-1111-111111111111",
  ticketCode: "VNE-11111111-1111-1111-1111-111111111111",
  userId: "synthetic-user-1",
  name: "SYNTHETIC",
  telegram: null,
  access: "VIP",
  theme: "gold",
  sequenceNumber: 1,
  sequenceLabel: "01/40",
  event: payload.event,
  status: "active",
  source: "manual",
  qrText: "https://x/scan#t",
  validUntil: future,
  secretField: "drop",
};

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { f, calls };
}
const cfg = { base: "https://pass.example.test", adminKey: KEY };
const idem = "22222222-2222-4222-8222-222222222222";

describe("config", () => {
  test("no config → null", () => expect(readPassConfig({})).toBeNull());
  test("http localhost only in development", () => {
    expect(validateServiceUrl("http://localhost:8787", true)).toBe("http://localhost:8787");
    expect(validateServiceUrl("http://localhost:8787", false)).toBeNull();
    expect(validateServiceUrl("http://pass.example.test", true)).toBeNull();
    expect(validateServiceUrl("https://u:p@pass.example.test", false)).toBeNull();
    expect(validateServiceUrl("https://pass.example.test/?a=1", false)).toBeNull();
    expect(validateServiceUrl("https://pass.example.test/", false)).toBe(
      "https://pass.example.test",
    );
  });
  test("short admin key is ignored", () =>
    expect(
      readPassConfig({ VNE_PASS_SERVICE_URL: "https://p.test", VNE_PASS_ADMIN_KEY: "short" })
        ?.adminKey,
    ).toBeNull());
});

describe("manual contract", () => {
  test("valid", () => expect(validateManualIssue(payload).ok).toBe(true));
  test("name or telegram", () =>
    expect(validateManualIssue({ ...payload, name: "" })).toEqual({
      ok: false,
      error: "name_or_telegram_required",
    }));
  test("bad telegram", () =>
    expect(validateManualIssue({ ...payload, telegram: "bad" })).toEqual({
      ok: false,
      error: "invalid_telegram",
    }));
  test("bad access", () =>
    expect(validateManualIssue({ ...payload, access: "ADMIN" }).ok).toBe(false));
  test("past validUntil", () =>
    expect(validateManualIssue({ ...payload, validUntil: "2000-01-01T00:00:00Z" }).ok).toBe(false));
  test("non-integer total", () =>
    expect(
      validateManualIssue({ ...payload, event: { ...payload.event, totalTickets: 1.5 } }).ok,
    ).toBe(false));
  test("bad date", () =>
    expect(
      validateManualIssue({ ...payload, event: { ...payload.event, date: "2099-02-30" } }).ok,
    ).toBe(false));
});

describe("admin actions fail closed", () => {
  test("no config → not_configured, no network", async () => {
    const m = mockFetch(200, {});
    const r = await handleAdminAction(
      { kind: "issue", input: { payload, idempotencyKey: idem } },
      { originOk: true, staffOk: async () => true, config: null, fetchImpl: m.f },
    );
    expect(r).toEqual({ ok: false, error: "not_configured" });
    expect(m.calls.length).toBe(0);
  });
  test("unauthorized staff → no network", async () => {
    const m = mockFetch(200, {});
    const r = await handleAdminAction(
      { kind: "issue", input: { payload, idempotencyKey: idem } },
      { originOk: true, staffOk: async () => false, config: cfg, fetchImpl: m.f },
    );
    expect(r).toEqual({ ok: false, error: "unauthorized" });
    expect(m.calls.length).toBe(0);
  });
  test("cross origin → forbidden, staff not even checked", async () => {
    let checked = false;
    const r = await handleAdminAction(
      { kind: "get", input: { id: "x" } },
      { originOk: false, staffOk: async () => ((checked = true), true), config: cfg },
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(checked).toBe(false);
  });
  test("invalid action / input", async () => {
    const d = { originOk: true, staffOk: async () => true, config: cfg };
    expect(
      await handleAdminAction({ kind: "issue", input: { payload, idempotencyKey: "nope" } }, d),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(await handleAdminAction({ kind: "get", input: { id: "../etc" } }, d)).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(await handleAdminAction({ kind: "revoke", input: { id: "abc" } }, d)).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(
      await handleAdminAction(
        { kind: "retry" as "get", input: { id: "abc" } },
        { ...d, config: null },
      ),
    ).toEqual({ ok: false, error: "invalid_action" });
  });
  test("issue: fixed path, bearer + idempotency, sanitized DTO, site pass path", async () => {
    const m = mockFetch(200, {
      pass,
      url: `https://pass.example.test/pass#${TOKEN}`,
      duplicate: false,
      delivery: [],
    });
    const r = await handleAdminAction(
      { kind: "issue", input: { payload, idempotencyKey: idem } },
      { originOk: true, staffOk: async () => true, config: cfg, fetchImpl: m.f },
    );
    expect(m.calls[0]!.url).toBe("https://pass.example.test/api/admin/issue");
    const h = m.calls[0]!.init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe(`Bearer ${KEY}`);
    expect(h["Idempotency-Key"]).toBe(idem);
    expect(r.ok && r.result.passPath).toBe(`/pass#${TOKEN}`);
    expect(r.ok && "secretField" in r.result.pass).toBe(false);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  test("service unauthorized hides details", async () => {
    const m = mockFetch(401, { error: "unauthorized" });
    const r = await handleAdminAction(
      { kind: "get", input: { id: "abc" } },
      { originOk: true, staffOk: async () => true, config: cfg, fetchImpl: m.f },
    );
    expect(r).toEqual({ ok: false, error: "service_misconfigured" });
  });
});

describe("read pass", () => {
  test("invalid token, no network", async () => {
    const m = mockFetch(200, {});
    expect(
      await handleReadPass({ token: "short" }, { originOk: true, config: cfg, fetchImpl: m.f }),
    ).toEqual({ state: "invalid" });
    expect(m.calls.length).toBe(0);
  });
  test("unconfigured", async () =>
    expect(await handleReadPass({ token: TOKEN }, { originOk: true, config: null })).toEqual({
      state: "unconfigured",
    }));
  test("no admin key sent; revoked has no QR", async () => {
    const m = mockFetch(200, { ...pass, status: "revoked" });
    const r = await handleReadPass(
      { token: TOKEN },
      { originOk: true, config: cfg, fetchImpl: m.f },
    );
    expect(m.calls[0]!.url).toBe("https://pass.example.test/api/pass/read");
    expect((m.calls[0]!.init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    expect(r.state === "ok" && r.pass.status).toBe("revoked");
    expect(r.state === "ok" && r.pass.qrText).toBeNull();
  });
  test("network failure → unavailable, never active", async () => {
    const f: FetchLike = async () => {
      throw new Error("down");
    };
    expect(
      await handleReadPass({ token: TOKEN }, { originOk: true, config: cfg, fetchImpl: f }),
    ).toEqual({ state: "unavailable" });
  });
  test("helpers", () => {
    expect(passPathFromServiceUrl("https://x/pass#bad")).toBeNull();
    expect(sanitizePass({ ...pass, access: "ROOT" })).toBeNull();
  });
});
