/**
 * День 06 — живая проверка бизнес-логики заказов на подключённой базе (общая preview-база!).
 * Guard: VNE_INTEGRATION=cloud-synthetic. Только синтетика (*@synthetic.invalid, события is_synthetic,
 * вымышленная площадка). Провайдер — FakePaymentProvider (sandbox); настоящий провайдер NOT VERIFIED.
 * Очистка только по manifest точных UUID. Секреты и токены не печатаются.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { cleanupByManifest, writeManifest, type RunManifest } from "./manifest-cleanup";
import {
  FakePaymentProvider,
  buildScenario,
  processNotification,
} from "../../src/lib/payments/fake-provider.server";

const url = process.env["SUPABASE_URL"];
const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (process.env["VNE_INTEGRATION"] !== "cloud-synthetic" || !url || !pub || !svc) {
  console.log("NOT VERIFIED (skip): VNE_INTEGRATION!=cloud-synthetic или нет ключей");
  process.exit(77);
}

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, svc, opts);
const anon = createClient(url, pub, opts);
const run = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}`;
const users: Record<string, string> = {};
const created: RunManifest = { run, users: [], events: [], apps: [], assignments: [] };
const provider = new FakePaymentProvider(`test-secret-${randomUUID()}`);

function totp(secretB32: string, t = Date.now()): string {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretB32.replace(/=+$/, "").toUpperCase())
    bits += alpha.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
async function mkUser(tag: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${tag}-${run}@synthetic.invalid`,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${tag}`);
  users[tag] = data.user.id;
  created.users.push(data.user.id);
  writeManifest(created);
  const ad = await admin.rpc("set_admission_service", {
    _user: data.user.id,
    _state: "admitted",
    _source: `test-run:${run}`,
  });
  if (ad.error) throw new Error(`admission ${tag}`);
}
async function signIn(tag: string, mfa = false): Promise<SupabaseClient> {
  const c = createClient(url!, pub!, opts);
  const { error } = await c.auth.signInWithPassword({
    email: `${tag}-${run}@synthetic.invalid`,
    password,
  });
  if (error) throw new Error(`signIn ${tag}`);
  if (mfa) {
    const { data: en } = await c.auth.mfa.enroll({ factorType: "totp" });
    const v = await c.auth.mfa.challengeAndVerify({
      factorId: en!.id,
      code: totp(en!.totp.secret),
    });
    if (v.error) throw new Error(`mfa ${tag}`);
  }
  return c;
}
async function mkEvent(tag: string, capacity: number, ttl = 15) {
  const start = new Date(Date.now() + 7 * 864e5).toISOString();
  const close = new Date(Date.now() + 6 * 864e5).toISOString();
  const { data, error } = await admin
    .from("events")
    .insert({
      slug: `synthetic-d6-${tag}-${run}`,
      title: `DEMO день 06 ${tag}`,
      status: "published",
      starts_at: start,
      sales_close_at: close,
      capacity,
      reserve_ttl_minutes: ttl,
      is_synthetic: true,
      sales_open: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`event ${tag} ${error.code} ${error.message}`);
  created.events.push(data.id);
  writeManifest(created);
  const { data: t } = await admin
    .from("event_tiers")
    .insert({ event_id: data.id, name: "Стандарт", amount_minor: 250000, currency: "RUB" })
    .select("id")
    .single();
  return { id: data.id as string, tier: t!.id as string };
}
async function approve(eventId: string, tag: string) {
  const { data } = await admin
    .from("applications")
    .insert({ event_id: eventId, user_id: users[tag]!, display_name: tag, status: "approved" })
    .select("id")
    .single();
  created.apps.push(data!.id);
  writeManifest(created);
}
const order = async (id: string) =>
  (await admin.from("orders").select("*").eq("id", id).single()).data as {
    id: string;
    status: string;
    amount_minor: number;
    currency: string;
  };
const reserve = (c: SupabaseClient, e: { id: string; tier: string }, idem = randomUUID()) =>
  c.rpc("reserve_seat", { _event: e.id, _tier: e.tier, _idem: idem });

try {
  for (const t of ["ga", "gb", "gc", "gd", "staffadm", "fin"]) await mkUser(t);
  const far = new Date(Date.now() + 864e5).toISOString();
  const { data: asg } = await admin
    .from("staff_assignments")
    .insert([
      { user_id: users["staffadm"]!, role: "admin", valid_until: far },
      { user_id: users["fin"]!, role: "finance", valid_until: far },
    ])
    .select("id");
  created.assignments = (asg ?? []).map((a) => a.id as string);
  writeManifest(created);

  const e1 = await mkEvent("last", 1);
  for (const t of ["ga", "gb"]) await approve(e1.id, t);
  const [ga, gb, gc, gd] = await Promise.all([
    signIn("ga"),
    signIn("gb"),
    signIn("gc"),
    signIn("gd"),
  ]);

  // 1. Последнее место двумя параллельными запросами
  const idemA = randomUUID();
  const [ra, rb] = await Promise.all([reserve(ga, e1, idemA), reserve(gb, e1)]);
  const wins = [ra, rb].filter((r) => !r.error);
  const loser = [ra, rb].find((r) => r.error);
  check("last seat: ровно один успех", wins.length === 1);
  check(
    "last seat: второй получает sold out P0003",
    loser?.error?.code === "P0003",
    loser?.error?.code,
  );
  const winnerIsA = !ra.error;
  const winClient = winnerIsA ? ga : gb;
  const winOrderId = (winnerIsA ? ra : rb).data.order_id as string;

  // 2. Двойное нажатие / повтор после сбоя сети
  if (winnerIsA) {
    const again = await reserve(ga, e1, idemA);
    check(
      "повтор с тем же ключом → тот же заказ",
      again.data?.order_id === winOrderId && again.data?.replayed === true,
    );
  }
  const { count: ordersE1 } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", e1.id);
  check("заказов на событие ровно 1", ordersE1 === 1, String(ordersE1));

  // 3. Подмена цены/владельца
  const tamper = await ga.rpc("reserve_seat", {
    _event: e1.id,
    _tier: e1.tier,
    _idem: randomUUID(),
    _amount: 1,
  } as never);
  check("параметр цены отклонён (нет такой сигнатуры)", Boolean(tamper.error), tamper.error?.code);
  const ins = await ga.from("orders").insert({
    reservation_id: randomUUID(),
    user_id: users["gb"],
    event_id: e1.id,
    tier_id: e1.tier,
    tier_name: "x",
    amount_minor: 1,
    currency: "RUB",
    environment: "sandbox",
  });
  check("прямая вставка заказа гостем → 42501", ins.error?.code === "42501", ins.error?.code);
  const o1 = await order(winOrderId);
  check(
    "сумма заказа — серверный снимок тарифа",
    Number(o1.amount_minor) === 250000 && o1.currency === "RUB",
  );

  // 4. Без одобрения
  const nd = await reserve(gd, e1);
  check("без одобренной заявки → 42501", nd.error?.code === "42501", nd.error?.code);

  // 5. Чужой заказ
  const otherClient = winnerIsA ? gb : ga;
  const peek = await otherClient.from("orders").select("id").eq("id", winOrderId);
  check(
    "гость не читает чужой заказ (пустой успешный SELECT)",
    peek.error === null && peek.data?.length === 0,
  );
  const own = await winClient.from("orders").select("id").eq("id", winOrderId);
  check("владелец читает свой заказ", own.data?.length === 1);

  // 6. Гость и anon не подтверждают оплату и не делают возврат
  const args = {
    _provider: "fake",
    _env: "sandbox",
    _event_id: `evt_forge_${run}`,
    _payment_id: `pay_forge_${run}`,
    _order: winOrderId,
    _kind: "succeeded",
    _amount: 250000,
    _currency: "RUB",
    _occurred_at: new Date().toISOString(),
  };
  const forgeG = await ga.rpc("apply_payment_event", args);
  check("гость → apply_payment_event 42501", forgeG.error?.code === "42501", forgeG.error?.code);
  const forgeA = await anon.rpc("apply_payment_event", args);
  check("anon → apply_payment_event отклонён", Boolean(forgeA.error), forgeA.error?.code);
  const refG = await ga.rpc("refund_sandbox", {
    _order: winOrderId,
    _amount: 1,
    _idem: randomUUID(),
  });
  check("гость → refund_sandbox 42501", refG.error?.code === "42501", refG.error?.code);
  check(
    "после попыток подделки заказ не оплачен",
    (await order(winOrderId)).status === "awaiting_payment",
  );

  // 7. Webhook: подпись, неизвестный заказ, сумма, успех, дубликат, перестановка
  const ord = { id: winOrderId, amountMinor: 250000, currency: "RUB" };
  const [bad] = await buildScenario(provider, ord, "bad_signature");
  check(
    "неверная подпись → отклонено",
    (await processNotification(admin, provider, bad!)) === "rejected_signature",
  );
  const [unk] = await buildScenario(provider, { ...ord, id: randomUUID() }, "success").then((x) => [
    x[1]!,
  ]);
  check(
    "неизвестный заказ → unknown_order",
    (await processNotification(admin, provider, unk!)) === "unknown_order",
  );
  const [wa] = await buildScenario(provider, ord, "wrong_amount");
  check(
    "неверная сумма → mismatch",
    (await processNotification(admin, provider, wa!)) === "mismatch",
  );
  check(
    "после отказов заказ без изменений",
    (await order(winOrderId)).status === "awaiting_payment",
  );
  const reorder = await buildScenario(provider, ord, "reorder");
  const out1 = await processNotification(admin, provider, reorder[0]!);
  const out2 = await processNotification(admin, provider, reorder[1]!);
  check("успех → paid", out1 === "paid", out1);
  check(
    "поздний pending не откатывает оплату",
    out2 === "stale" && (await order(winOrderId)).status === "paid",
    out2,
  );
  const dup = await processNotification(admin, provider, reorder[0]!);
  check("дубликат уведомления → duplicate", dup === "duplicate", dup);
  const { count: parts } = await admin
    .from("participations")
    .select("id", { count: "exact", head: true })
    .eq("order_id", winOrderId);
  check("участие создано ровно одно", parts === 1);
  const { count: outbox } = await admin
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("order_id", winOrderId);
  check("в журнале провайдера 2 принятых события (без отклонённых)", outbox === 2, String(outbox));

  // 8. Изменение цены после оформления
  await admin.from("event_tiers").update({ amount_minor: 999900 }).eq("id", e1.tier);
  check(
    "смена цены тарифа не меняет заказ",
    Number((await order(winOrderId)).amount_minor) === 250000,
  );

  // 9. Отказ провайдера освобождает место
  const e2 = await mkEvent("fail", 1);
  await approve(e2.id, "gc");
  await approve(e2.id, "gb");
  const rc = await reserve(gc, e2);
  const oc = rc.data.order_id as string;
  const fail = await buildScenario(
    provider,
    { id: oc, amountMinor: 250000, currency: "RUB" },
    "failure",
  );
  for (const f of fail) await processNotification(admin, provider, f);
  check("отказ → failed", (await order(oc)).status === "failed");
  const rb2 = await reserve(gb, e2);
  check("после отказа место снова доступно", !rb2.error, rb2.error?.code);

  // 10. Истечение резерва без cron + поздняя оплата
  const e3 = await mkEvent("late", 1, 5);
  await approve(e3.id, "ga");
  await approve(e3.id, "gc");
  const r3 = await reserve(ga, e3);
  const o3 = r3.data.order_id as string;
  // имитация прошедшего времени (TTL в прошлом); cron не запускается
  await admin
    .from("reservations")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("event_id", e3.id);
  const r3c = await reserve(gc, e3);
  check("истёкший резерв освобождает место без cron", !r3c.error, r3c.error?.code);
  check("истёкший заказ помечен expired", (await order(o3)).status === "expired");
  const late = await buildScenario(
    provider,
    { id: o3, amountMinor: 250000, currency: "RUB" },
    "success",
  );
  let lateOut = "";
  for (const l of late) lateOut = await processNotification(admin, provider, l);
  check(
    "поздняя оплата → needs_review",
    lateOut === "needs_review" && (await order(o3)).status === "needs_review",
    lateOut,
  );
  const { data: taken } = await admin.rpc("expire_reservations");
  const active3 =
    (
      (await admin.from("participations").select("id").eq("event_id", e3.id).eq("status", "active"))
        .data ?? []
    ).length +
    (
      (await admin.from("reservations").select("id").eq("event_id", e3.id).eq("status", "active"))
        .data ?? []
    ).length;
  check(
    "мест не больше вместимости после поздней оплаты",
    active3 <= 1,
    `${active3} (cleanup ${taken})`,
  );

  // 11. Sandbox-возврат: отдельное полномочие, MFA, идемпотентность
  const adm = await signIn("staffadm", true);
  const fin = await signIn("fin", true);
  const admRef = await adm.rpc("refund_sandbox", {
    _order: winOrderId,
    _amount: 250000,
    _idem: randomUUID(),
  });
  check(
    "админ без роли finance → возврат 42501",
    admRef.error?.code === "42501",
    admRef.error?.code,
  );
  const k = randomUUID();
  const f1 = await fin.rpc("refund_sandbox", { _order: winOrderId, _amount: 250000, _idem: k });
  check(
    "finance + aal2 → возврат выполнен",
    !f1.error && f1.data?.replayed === false,
    f1.error?.code,
  );
  const f2 = await fin.rpc("refund_sandbox", { _order: winOrderId, _amount: 250000, _idem: k });
  check("повтор возврата тем же ключом → replayed", f2.data?.replayed === true);
  const f3 = await fin.rpc("refund_sandbox", { _order: winOrderId, _amount: 1000, _idem: k });
  check("тот же ключ с другой суммой → 22023", f3.error?.code === "22023", f3.error?.code);
  const f4 = await fin.rpc("refund_sandbox", {
    _order: winOrderId,
    _amount: 1,
    _idem: randomUUID(),
  });
  check("сверх суммы заказа → отказ", Boolean(f4.error), f4.error?.code);
  const { count: refunds } = await admin
    .from("refunds")
    .select("id", { count: "exact", head: true })
    .eq("order_id", winOrderId);
  check("возврат ровно один", refunds === 1);
  check("заказ refunded", (await order(winOrderId)).status === "refunded");
  const finNoMfa = await signIn("fin");
  const f5 = await finNoMfa.rpc("refund_sandbox", {
    _order: o3,
    _amount: 250000,
    _idem: randomUUID(),
  });
  check("finance без aal2 → 42501", f5.error?.code === "42501", f5.error?.code);

  // 12. Закрытый адрес
  const pd = await adm.rpc("admin_save_private_details", {
    _event: e1.id,
    _address: "Вымышленная ул., 0",
    _notes: "синтетика",
  });
  check("админ сохраняет закрытый адрес", !pd.error, pd.error?.code);
  const pa = await anon.from("event_private_details").select("venue_address");
  check("anon не читает закрытый адрес", Boolean(pa.error) || (pa.data ?? []).length === 0);
  const pg = await ga.from("event_private_details").select("venue_address");
  check("гость не читает закрытый адрес", pg.error === null && (pg.data ?? []).length === 0);
  const pubEvent = await anon.from("events").select("*").eq("id", e1.id).single();
  check(
    "публичная строка события не содержит адреса",
    !JSON.stringify(pubEvent.data ?? {}).includes("Вымышленная ул."),
  );

  // 13. Гость не управляет событиями
  const gEv = await ga.rpc("admin_event_transition", {
    _id: e1.id,
    _action: "archive",
    _expected_version: 1,
  });
  check("гость → admin_event_transition 42501", gEv.error?.code === "42501", gEv.error?.code);
} catch (e) {
  failed++;
  console.log(`FAIL harness: ${(e as Error).message}`);
} finally {
  const c = await cleanupByManifest(admin, created);
  if (!c.ok) failed++;
}
console.log(failed ? `RESULT: ${failed} FAIL` : "RESULT: ALL PASS");
process.exit(failed ? 1 : 0);
