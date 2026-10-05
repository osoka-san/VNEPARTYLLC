/**
 * FakePaymentProvider — ТОЛЬКО development/test. Публичного маршрута нет: события
 * подписываются и проверяются внутри процесса и проходят тот же путь проверки, что и настоящий webhook.
 * Возврат с платёжной страницы доказательством оплаты не считается.
 */
import {
  hmacHex,
  parseEventBody,
  safeEqualHex,
  type PaymentProvider,
  type ProviderEventKind,
  type SimulationScenario,
  type VerifiedEvent,
} from "./provider";

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly environment = "sandbox" as const;
  constructor(private readonly secret: string) {
    if (!secret) throw new Error("fake provider: secret missing");
  }
  async createCheckout(input: { orderId: string }) {
    return { providerRef: `fakepay_${input.orderId.replace(/-/g, "")}`, redirectUrl: null };
  }
  async sign(body: string) {
    return hmacHex(this.secret, body);
  }
  async verifyWebhook(rawBody: string, signature: string | null): Promise<VerifiedEvent | null> {
    if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
    const expected = await hmacHex(this.secret, rawBody);
    if (!safeEqualHex(expected, signature)) return null;
    return parseEventBody(rawBody, this.name);
  }
}

type Order = { id: string; amountMinor: number; currency: string };
export type Envelope = { body: string; signature: string };

/** Строит подписанные уведомления для сценария. */
export async function buildScenario(
  p: FakePaymentProvider,
  order: Order,
  scenario: SimulationScenario,
): Promise<Envelope[]> {
  const ref = (await p.createCheckout({ orderId: order.id })).providerRef;
  const base = Date.now();
  const nonce = crypto.randomUUID().slice(0, 8);
  const ev = async (kind: ProviderEventKind, n: number, dt: number, amount = order.amountMinor) => {
    const body = JSON.stringify({
      event_id: `evt_${nonce}_${n}`,
      payment_id: ref,
      order_id: order.id,
      kind,
      amount_minor: amount,
      currency: order.currency,
      environment: "sandbox",
      occurred_at: new Date(base + dt).toISOString(),
    });
    return { body, signature: await p.sign(body) };
  };
  switch (scenario) {
    case "success":
      return [await ev("pending", 1, 0), await ev("succeeded", 2, 1000)];
    case "failure":
      return [await ev("pending", 1, 0), await ev("failed", 2, 1000)];
    case "delay":
      return [await ev("pending", 1, 0)];
    case "duplicate": {
      const s = await ev("succeeded", 2, 1000);
      return [s, s];
    }
    case "reorder":
      // успех приходит раньше, чем запоздавший pending — pending не откатывает оплату
      return [await ev("succeeded", 2, 1000), await ev("pending", 1, 0)];
    case "bad_signature": {
      const s = await ev("succeeded", 2, 1000);
      return [{ body: s.body, signature: "0".repeat(64) }];
    }
    case "wrong_amount":
      return [await ev("succeeded", 2, 1000, order.amountMinor + 1)];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/** Общий путь обработки: подпись → разбор → согласованная сверка в БД. */
export async function processNotification(
  admin: AdminClient,
  provider: FakePaymentProvider,
  env: Envelope,
): Promise<string> {
  const ev = await provider.verifyWebhook(env.body, env.signature);
  if (!ev) return "rejected_signature";
  const { data, error } = await admin.rpc("apply_payment_event", {
    _provider: ev.provider,
    _env: ev.environment,
    _event_id: ev.eventId,
    _payment_id: ev.paymentId,
    _order: ev.orderId,
    _kind: ev.kind,
    _amount: ev.amountMinor,
    _currency: ev.currency,
    _occurred_at: ev.occurredAt,
  });
  if (error) return `error:${error.code ?? "unknown"}`;
  return String(data);
}
