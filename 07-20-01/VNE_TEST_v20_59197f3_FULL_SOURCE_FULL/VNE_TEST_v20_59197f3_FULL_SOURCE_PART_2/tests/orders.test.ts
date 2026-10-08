import { describe, expect, test } from "bun:test";
import {
  ORDER_TRANSITIONS,
  formatMoney,
  parseMajorToMinor,
  utcToZonedInput,
  validateEventForm,
  zonedInputToUtc,
} from "../src/lib/orders";
import {
  hmacHex,
  parseEventBody,
  resolvePaymentMode,
  safeEqualHex,
} from "../src/lib/payments/provider";
import { FakePaymentProvider, buildScenario } from "../src/lib/payments/fake-provider.server";

describe("payment mode", () => {
  test("production без конфигурации — безопасный отказ, не fake", () => {
    expect(resolvePaymentMode({ FAKE_PAYMENT_WEBHOOK_SECRET: "x" }, false)).toEqual({
      mode: "unconfigured",
      reason: "fake_forbidden_in_production",
    });
  });
  test("неизвестный провайдер — unconfigured", () => {
    expect(resolvePaymentMode({ VNE_PAYMENT_PROVIDER: "bank" }, true).mode).toBe("unconfigured");
  });
  test("dev без секрета — unconfigured", () => {
    expect(resolvePaymentMode({}, true)).toEqual({ mode: "unconfigured", reason: "no_secret" });
  });
  test("dev + секрет — fake sandbox", () => {
    expect(resolvePaymentMode({ FAKE_PAYMENT_WEBHOOK_SECRET: "s" }, true).mode).toBe("fake");
  });
});

describe("money & time", () => {
  test("minor units без плавающей арифметики", () => {
    expect(parseMajorToMinor("2500.5")).toBe(250050);
    expect(parseMajorToMinor("0,01")).toBe(1);
    expect(parseMajorToMinor("1.234")).toBeNull();
    expect(parseMajorToMinor("-1")).toBeNull();
  });
  test("formatMoney", () => {
    expect(formatMoney(250000, "RUB")).toContain("2");
  });
  test("часовой пояс события туда-обратно", () => {
    const iso = zonedInputToUtc("2026-10-10T23:30", "Europe/Moscow");
    expect(iso).toBe("2026-10-10T20:30:00.000Z");
    expect(utcToZonedInput(iso, "Europe/Moscow")).toBe("2026-10-10T23:30");
    expect(zonedInputToUtc("2026-03-29T03:00", "Europe/Berlin")).toBe("2026-03-29T01:00:00.000Z");
  });
  test("порядок дат", () => {
    const base = {
      slug: "demo",
      title: "Demo",
      description: "",
      timezone: "UTC",
      capacity: 10,
      reserve_ttl_minutes: 15,
      qr_release_at: null,
      address_reveal_at: null,
      entry_opens_at: null,
      entry_closes_at: null,
    };
    expect(
      validateEventForm({
        ...base,
        starts_at: "2026-10-10T20:00:00Z",
        sales_close_at: "2026-10-11T00:00:00Z",
      }),
    ).not.toBeNull();
    expect(
      validateEventForm({
        ...base,
        starts_at: "2026-10-10T20:00:00Z",
        sales_close_at: "2026-10-10T18:00:00Z",
      }),
    ).toBeNull();
  });
  test("refunded — терминальный статус", () => {
    expect(ORDER_TRANSITIONS.refunded).toEqual([]);
    expect(ORDER_TRANSITIONS.paid).not.toContain("awaiting_payment");
  });
});

describe("fake provider signature", () => {
  const p = new FakePaymentProvider("secret-1");
  const order = { id: "11111111-1111-4111-8111-111111111111", amountMinor: 100, currency: "RUB" };
  test("подписанное событие проходит", async () => {
    const [e] = await buildScenario(p, order, "delay");
    const v = await p.verifyWebhook(e!.body, e!.signature);
    expect(v?.kind).toBe("pending");
    expect(v?.amountMinor).toBe(100);
  });
  test("неверная подпись и чужой секрет отклоняются", async () => {
    const [bad] = await buildScenario(p, order, "bad_signature");
    expect(await p.verifyWebhook(bad!.body, bad!.signature)).toBeNull();
    const [ok] = await buildScenario(p, order, "delay");
    expect(
      await new FakePaymentProvider("other").verifyWebhook(ok!.body, ok!.signature),
    ).toBeNull();
    expect(await p.verifyWebhook(ok!.body.replace("100", "1"), ok!.signature)).toBeNull();
  });
  test("строгий разбор тела", () => {
    expect(parseEventBody("{}", "fake")).toBeNull();
    expect(parseEventBody("not json", "fake")).toBeNull();
  });
  test("hmac и сравнение", async () => {
    const a = await hmacHex("k", "b");
    expect(a).toHaveLength(64);
    expect(safeEqualHex(a, a)).toBe(true);
    expect(safeEqualHex(a, "0".repeat(64))).toBe(false);
  });
  test("дубликат — одинаковый event id", async () => {
    const d = await buildScenario(p, order, "duplicate");
    expect(d[0]!.body).toBe(d[1]!.body);
  });
});
