/**
 * День 06: абстракция платёжного провайдера. Домен не знает конкретного провайдера.
 * Провайдер владельцем НЕ выбран → доступен только FakePaymentProvider в development.
 * В боевой сборке без конфигурации режим = "unconfigured" (безопасная ошибка), fake не включается.
 * Модуль клиентобезопасен: без секретов и без обращений к сети.
 */

export type PaymentEnvironment = "sandbox" | "live";
export type ProviderEventKind = "pending" | "succeeded" | "failed";

export type VerifiedEvent = {
  provider: string;
  environment: PaymentEnvironment;
  eventId: string;
  paymentId: string;
  orderId: string;
  kind: ProviderEventKind;
  amountMinor: number;
  currency: string;
  occurredAt: string;
};

export interface PaymentProvider {
  readonly name: string;
  readonly environment: PaymentEnvironment;
  createCheckout(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerRef: string; redirectUrl: string | null }>;
  /** Возвращает событие только после проверки подлинности; иначе null. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<VerifiedEvent | null>;
}

export type PaymentMode =
  | { mode: "fake"; environment: "sandbox" }
  | { mode: "unconfigured"; reason: "no_provider" | "fake_forbidden_in_production" | "no_secret" };

/**
 * Выбор режима — серверная конфигурация среды, не параметр запроса.
 * fake разрешён только в development-сборке и только при наличии секрета подписи.
 */
export function resolvePaymentMode(
  env: Record<string, string | undefined>,
  isDev: boolean,
): PaymentMode {
  const requested = (env["VNE_PAYMENT_PROVIDER"] ?? "fake").trim();
  if (requested !== "fake") return { mode: "unconfigured", reason: "no_provider" };
  if (!isDev) return { mode: "unconfigured", reason: "fake_forbidden_in_production" };
  if (!env["FAKE_PAYMENT_WEBHOOK_SECRET"]) return { mode: "unconfigured", reason: "no_secret" };
  return { mode: "fake", environment: "sandbox" };
}

const enc = new TextEncoder();

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Сравнение без раннего выхода. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Строгий разбор тела события после проверки подписи. */
export function parseEventBody(raw: string, provider: string): VerifiedEvent | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const kind = j["kind"];
  const env = j["environment"];
  if (kind !== "pending" && kind !== "succeeded" && kind !== "failed") return null;
  if (env !== "sandbox" && env !== "live") return null;
  const amount = j["amount_minor"];
  const currency = j["currency"];
  const orderId = j["order_id"];
  const eventId = j["event_id"];
  const paymentId = j["payment_id"];
  const at = j["occurred_at"];
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof orderId !== "string" || !UUID.test(orderId)) return null;
  if (typeof eventId !== "string" || !/^[\w.-]{6,120}$/.test(eventId)) return null;
  if (typeof paymentId !== "string" || !/^[\w.-]{6,120}$/.test(paymentId)) return null;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return {
    provider,
    environment: env,
    eventId,
    paymentId,
    orderId,
    kind,
    amountMinor: amount,
    currency,
    occurredAt: new Date(at).toISOString(),
  };
}

export const SIMULATION_SCENARIOS = [
  "success",
  "failure",
  "delay",
  "duplicate",
  "reorder",
  "bad_signature",
  "wrong_amount",
] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export const SCENARIO_LABEL: Record<SimulationScenario, string> = {
  success: "Успех",
  failure: "Отказ провайдера",
  delay: "Задержка (только pending)",
  duplicate: "Дубликат уведомления",
  reorder: "Неправильный порядок",
  bad_signature: "Неверная подпись",
  wrong_amount: "Неверная сумма",
};
