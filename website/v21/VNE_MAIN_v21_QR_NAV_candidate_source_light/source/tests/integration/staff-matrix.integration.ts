/**
 * Реальный Auth + PostgREST + TOTP + logout на подключённом бэкенде (общая preview/future-prod база!).
 * Guard: VNE_INTEGRATION=cloud-synthetic. Без ключей — NOT VERIFIED, exit 77. Никогда не PASS без проверки.
 * Только синтетика: пользователи *@synthetic.invalid через admin.createUser (email_confirm, без писем),
 * событие в статусе draft (не видно публично). Всё созданное удаляется/отзывается в finally.
 * Секреты и токены не печатаются.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { cleanupByManifest, writeManifest, type RunManifest } from "./manifest-cleanup";

const SKIP = 77;
const url = process.env["SUPABASE_URL"];
const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (process.env["VNE_INTEGRATION"] !== "cloud-synthetic" || !url || !pub || !svc) {
  console.log("NOT VERIFIED (skip): VNE_INTEGRATION!=cloud-synthetic или нет ключей");
  process.exit(SKIP);
}

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

let failed = 0;
const T0 = Date.now();
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, svc, opts);
const run = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}`;
const users: Record<string, string> = {};
const created: RunManifest = { run, users: [], events: [], apps: [], assignments: [] };

async function mkUser(tag: string, admit = true) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${tag}-${run}@synthetic.invalid`,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${tag} failed`);
  if (admit) {
    // доверенная тестовая подготовка: явный допуск только точного id этого прогона
    const ad = await admin.rpc("set_admission_service", {
      _user: data.user.id,
      _state: "admitted",
      _source: `test-run:${run}`,
    });
    if (ad.error) throw new Error(`admission ${tag} ${ad.error.code}`);
  }
  users[tag] = data.user.id;
  created.users.push(data.user.id);
  writeManifest(created);
}
async function signIn(tag: string): Promise<SupabaseClient> {
  const c = createClient(url!, pub!, opts);
  const { error } = await c.auth.signInWithPassword({
    email: `${tag}-${run}@synthetic.invalid`,
    password,
  });
  if (error) throw new Error(`signIn ${tag} failed`);
  return c;
}
async function aal2(c: SupabaseClient) {
  const { data: en, error } = await c.auth.mfa.enroll({ factorType: "totp" });
  if (error || !en) throw new Error("enroll failed");
  const wrong = await c.auth.mfa.challengeAndVerify({ factorId: en.id, code: "000000" });
  const ok = await c.auth.mfa.challengeAndVerify({ factorId: en.id, code: totp(en.totp.secret) });
  return { wrongRejected: Boolean(wrong.error), ok: !ok.error };
}

try {
  for (const t of [
    "guesta",
    "guestb",
    "modown",
    "modown2",
    "modother",
    "modrevoked",
    "modexpired",
    "editor",
  ])
    await mkUser(t);
  const { data: ev } = await admin
    .from("events")
    .insert({ slug: `synthetic-${run}`, title: `Synthetic ${run}`, status: "draft" })
    .select("id")
    .single();
  if (ev?.id) created.events.push(ev.id as string);
  writeManifest(created);
  const { data: ev2 } = await admin
    .from("events")
    .insert({ slug: `synthetic-o-${run}`, title: `Synthetic O ${run}`, status: "draft" })
    .select("id")
    .single();
  if (ev2?.id) created.events.push(ev2.id as string);
  writeManifest(created);
  const { data: ev3 } = await admin
    .from("events")
    .insert({ slug: `synthetic-demo-${run}`, title: `DEMO синтетика ${run}`, status: "published" })
    .select("id")
    .single();
  if (ev3?.id) created.events.push(ev3.id as string);
  writeManifest(created);
  const demoEvent = ev3!.id as string;
  // Второе DEMO-событие с тем же названием: проверка, что ключ не переносится между событиями.
  const { data: ev4 } = await admin
    .from("events")
    .insert({ slug: `synthetic-demo2-${run}`, title: `DEMO синтетика ${run}`, status: "published" })
    .select("id")
    .single();
  if (ev4?.id) created.events.push(ev4.id as string);
  writeManifest(created);
  const demoEvent2 = ev4!.id as string;
  const eventId = ev!.id as string;
  const otherEvent = ev2!.id as string;
  const { data: apps } = await admin
    .from("applications")
    .insert([
      { event_id: eventId, user_id: users["guesta"]!, display_name: "A" },
      { event_id: eventId, user_id: users["guestb"]!, display_name: "B" },
    ])
    .select("id, user_id");
  created.apps = (apps ?? []).map((a) => a.id);
  const appA = apps!.find((a) => a.user_id === users["guesta"])!.id as string;
  const past = new Date(Date.now() - 60_000).toISOString();
  const from = new Date(Date.now() - 3600_000).toISOString();
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const noExp = await admin
    .from("staff_assignments")
    .insert({ user_id: users["modown"]!, role: "moderator", event_id: eventId, valid_until: null })
    .select("id");
  for (const r of noExp.data ?? []) created.assignments.push(r.id as string);
  check("DB constraint: event role without expiry rejected (23514)", noExp.error?.code === "23514");
  const { data: sa, error: saErr } = await admin
    .from("staff_assignments")
    .insert([
      {
        user_id: users["modown"]!,
        role: "moderator",
        event_id: eventId,
        valid_from: from,
        valid_until: soon,
        revoked_at: null,
      },
      {
        user_id: users["modother"]!,
        role: "moderator",
        event_id: otherEvent,
        valid_from: from,
        valid_until: soon,
        revoked_at: null,
      },
      {
        user_id: users["modrevoked"]!,
        role: "moderator",
        event_id: eventId,
        valid_from: from,
        valid_until: soon,
        revoked_at: past,
      },
      {
        user_id: users["modexpired"]!,
        role: "moderator",
        event_id: eventId,
        valid_from: from,
        valid_until: past,
        revoked_at: null,
      },
      {
        user_id: users["modown2"]!,
        role: "moderator",
        event_id: eventId,
        valid_from: from,
        valid_until: soon,
        revoked_at: null,
      },
      {
        user_id: users["editor"]!,
        role: "editor",
        event_id: null,
        valid_from: from,
        valid_until: soon,
        revoked_at: null,
      },
    ])
    .select("id");
  if (saErr || (sa ?? []).length !== 6)
    throw new Error(`staff fixtures not created: ${saErr?.code ?? "count"}`);
  created.assignments.push(...(sa ?? []).map((s) => s.id as string));
  writeManifest(created);

  // Гости A/B через реальный Auth + PostgREST
  const ga = await signIn("guesta");
  const gb = await signIn("guestb");
  const ra = await ga.from("applications").select("id");
  check("guest A reads only own application", ra.data?.length === 1 && ra.data[0]!.id === appA);
  const rb = await gb.from("applications").select("id").eq("id", appA);
  // Скрытая чужая строка: запрос обязан пройти успешно (error === null) и вернуть 0 строк.
  // Сетевая/иная ошибка успешным отказом не считается.
  check(
    "guest B cannot read A by id (успешный SELECT, 0 строк)",
    rb.error === null && (rb.data ?? []).length === 0,
  );
  const wb = await gb.rpc("guest_application_action", {
    _app: appA,
    _action: "withdraw",
    _expected_version: 1,
  });
  check("guest B cannot withdraw A (42501)", wb.error?.code === "42501");
  const up = await gb.from("applications").update({ status: "approved" }).eq("id", appA);
  const { data: afterUp } = await admin
    .from("applications")
    .select("status, version")
    .eq("id", appA)
    .single();
  // Недоступная запись: конкретный код прав доступа + неизменность строки.
  check(
    "guest direct UPDATE denied (42501, строка не изменилась)",
    up.error?.code === "42501" && afterUp?.status === "submitted" && afterUp?.version === 1,
  );
  const { count: insBefore } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  const ins = await ga
    .from("applications")
    .insert({ event_id: eventId, user_id: users["guestb"]!, status: "approved" });
  const { count: insAfter } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  check(
    "guest direct INSERT with spoofed user_id/status denied (42501, строк не прибавилось)",
    ins.error?.code === "42501" && insAfter === insBefore,
  );
  const gm = await ga.rpc("moderate_application", {
    _app: appA,
    _action: "approve",
    _expected_version: 1,
  });
  check("guest cannot call moderation RPC", gm.error?.code === "42501");

  // Модератор своего события: aal1 → отказ; реальный TOTP → aal2 → разрешено
  const mo = await signIn("modown");
  const m1 = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "take",
    _expected_version: 1,
  });
  check("own moderator aal1 denied", m1.error?.code === "42501");
  const f = await aal2(mo);
  check("wrong TOTP rejected", f.wrongRejected);
  check("correct real TOTP verified (aal2)", f.ok);
  const m2 = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "take",
    _expected_version: 1,
  });
  if (m2.error) console.log(`info m2: ${m2.error.code} ${m2.error.message}`);
  check("own moderator aal2 takes application", !m2.error && m2.data === "under_review");
  const m3 = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "approve",
    _expected_version: 1,
  });
  check("stale version rejected (PT409)", m3.error?.code === "PT409");
  const mNull = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "approve",
    _expected_version: null as never,
  });
  check("moderator NULL version rejected (22023, CAS not skipped)", mNull.error?.code === "22023");
  const gNull = await ga.rpc("guest_application_action", {
    _app: appA,
    _action: "withdraw",
    _expected_version: null as never,
  });
  const gStale = await ga.rpc("guest_application_action", {
    _app: appA,
    _action: "withdraw",
    _expected_version: 1,
  });
  check(
    "guest NULL version rejected and stale version PT409",
    gNull.error?.code === "22023" && gStale.error?.code === "PT409",
  );

  // Устаревший RPC одобрения без версии/истории/outbox должен быть недоступен.
  const { count: histBefore } = await admin
    .from("application_events")
    .select("id", { count: "exact", head: true })
    .eq("application_id", appA);
  const legacy = await mo.rpc(
    "review_application" as never,
    {
      _application: appA,
      _decision: "approved",
    } as never,
  );
  const { data: afterLegacy } = await admin
    .from("applications")
    .select("status, version")
    .eq("id", appA)
    .single();
  const { count: histAfter } = await admin
    .from("application_events")
    .select("id", { count: "exact", head: true })
    .eq("application_id", appA);
  console.log(`info legacy: ${legacy.error?.code ?? "no error"}`);
  check(
    "legacy review_application unavailable (no approve without CAS/history/outbox)",
    Boolean(legacy.error) &&
      afterLegacy?.status === "under_review" &&
      afterLegacy?.version === 2 &&
      histBefore === histAfter,
  );

  for (const tag of ["modother", "modrevoked", "modexpired"]) {
    const c = await signIn(tag);
    const r = await aal2(c);
    const d = await c.rpc("moderate_application", {
      _app: appA,
      _action: "approve",
      _expected_version: 2,
    });
    check(`${tag} with real aal2 denied`, r.ok && d.error?.code === "42501");
  }

  // Editor: только контент
  const ed = await signIn("editor");
  const er = await aal2(ed);
  const eCont = await ed.rpc("staff_can", { _cap: "content" });
  const eMem = await ed.rpc("staff_can", { _cap: "membership" });
  const eMod = await ed.rpc("moderate_application", {
    _app: appA,
    _action: "approve",
    _expected_version: 2,
  });
  const eReq = await ed.from("membership_requests").select("id").limit(1);
  const eDec = await ed.rpc("membership_decide", { _request: randomUUID(), _decision: "approved" });
  check("editor real aal2: content allowed", er.ok && eCont.data === true);
  check("editor: membership capability denied", eMem.data === false);
  check("editor: moderation RPC denied", eMod.error?.code === "42501");
  check(
    "editor: membership requests not readable (успешный SELECT, 0 строк)",
    eReq.error === null && (eReq.data ?? []).length === 0,
  );
  check("editor: membership_decide denied", eDec.error?.code === "42501");

  // Вопрос/ответ/новое уточнение + узкое редактирование имени
  const evCount = async () =>
    (
      await admin
        .from("application_events")
        .select("id", { count: "exact", head: true })
        .eq("application_id", appA)
    ).count ?? 0;
  const ev0 = await evCount();
  const q1 = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "request_info",
    _expected_version: 2,
    _public_message: "Q1",
  });
  const rep = await ga.rpc("guest_application_action", {
    _app: appA,
    _action: "reply",
    _expected_version: 3,
    _reply: "A1",
  });
  const q2 = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "request_info",
    _expected_version: 4,
    _public_message: "Q2",
  });
  const { data: cur } = await admin
    .from("applications")
    .select("guest_reply, public_message, version")
    .eq("id", appA)
    .single();
  check(
    "new request_info clears old guest_reply, keeps new question",
    !q1.error &&
      !rep.error &&
      !q2.error &&
      cur?.guest_reply === null &&
      cur?.public_message === "Q2",
  );
  const { data: hist } = await ga
    .from("application_events")
    .select("public_message, guest_message")
    .eq("application_id", appA)
    .order("at");
  const hm = (hist ?? []).map((h) => h.public_message ?? h.guest_message).filter(Boolean);
  check("guest history shows Q1 → A1 → Q2 in order", JSON.stringify(hm) === '["Q1","A1","Q2"]');
  check("one history row per successful transition", (await evCount()) === ev0 + 3);
  const bad = await mo.rpc("moderate_application", {
    _app: appA,
    _action: "take",
    _expected_version: 5,
  });
  const { data: afterBad } = await admin
    .from("applications")
    .select("version, status")
    .eq("id", appA)
    .single();
  check(
    "rejected transition: no history, no version change (rollback)",
    bad.error?.code === "22023" &&
      afterBad?.version === 5 &&
      afterBad?.status === "needs_info" &&
      (await evCount()) === ev0 + 3,
  );
  const rn = await ga.rpc("guest_update_display_name", {
    _app: appA,
    _name: "Новое имя",
    _expected_version: 5,
  });
  const rnStale = await ga.rpc("guest_update_display_name", {
    _app: appA,
    _name: "X",
    _expected_version: 5,
  });
  const rnOther = await gb.rpc("guest_update_display_name", {
    _app: appA,
    _name: "X",
    _expected_version: 6,
  });
  const rnNull = await ga.rpc("guest_update_display_name", {
    _app: appA,
    _name: "X",
    _expected_version: null,
  });
  const { data: rnRow } = await admin
    .from("applications")
    .select("display_name, status, event_id, user_id, version")
    .eq("id", appA)
    .single();
  check(
    "owner rename: ok, version+1, status/event unchanged",
    !rn.error &&
      rnRow?.display_name === "Новое имя" &&
      rnRow?.status === "needs_info" &&
      rnRow?.version === 6,
  );
  check(
    "rename stale PT409 / other guest 42501 / NULL 22023",
    rnStale.error?.code === "PT409" &&
      rnOther.error?.code === "42501" &&
      rnNull.error?.code === "22023",
  );
  const colUp = await ga
    .from("applications")
    .update({ display_name: "direct" })
    .eq("id", appA)
    .select();
  const { data: afterCol } = await admin
    .from("applications")
    .select("display_name, version")
    .eq("id", appA)
    .single();
  check(
    "direct column UPDATE still denied (42501, значение не изменилось)",
    colUp.error?.code === "42501" &&
      afterCol?.display_name === "Новое имя" &&
      afterCol?.version === 6,
  );

  // Конкурентные решения двух модераторов одной версии
  const mo2 = await signIn("modown2");
  check("second own moderator real aal2", (await aal2(mo2)).ok);
  const [c1, c2] = await Promise.all([
    mo.rpc("moderate_application", { _app: appA, _action: "reject", _expected_version: 6 }),
    mo2.rpc("moderate_application", { _app: appA, _action: "reject", _expected_version: 6 }),
  ]);
  const wins = [c1, c2].filter((r) => !r.error).length;
  const conflicts = [c1, c2].filter((r) => r.error?.code === "PT409").length;
  check("concurrent decisions: exactly one wins, other PT409", wins === 1 && conflicts === 1);
  const { data: fin } = await admin
    .from("applications")
    .select("version, status")
    .eq("id", appA)
    .single();
  check(
    "concurrent decisions: single version bump + one history row",
    fin?.version === 7 && (await evCount()) === ev0 + 4,
  );
  const rnFinal = await ga.rpc("guest_update_display_name", {
    _app: appA,
    _name: "X",
    _expected_version: 7,
  });
  check("rename in final status denied", rnFinal.error?.code === "22023");

  // Повторные/параллельные отправки заявки на DEMO-событие
  const key = randomUUID();
  const sub = (k: string) =>
    gb.rpc("submit_application", {
      _event: demoEvent,
      _display_name: "B",
      _age_confirmed: true,
      _consent_version: "draft-2026-09",
      _idempotency: k,
    });
  const subs = await Promise.all([sub(key), sub(key), sub(randomUUID())]);
  const ids = new Set(subs.map((r) => r.data));
  check(
    "duplicate/parallel submits → one application id",
    subs.every((r) => !r.error) && ids.size === 1,
  );
  const { count } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("event_id", demoEvent)
    .eq("user_id", users["guestb"]!);
  check("duplicate submits: one row in DB", count === 1);
  // Ключ, реально сохранённый победившим параллельным запросом (гонка выбирает любой из трёх).
  const { data: stored } = await admin
    .from("applications")
    .select("idempotency_key")
    .eq("event_id", demoEvent)
    .eq("user_id", users["guestb"]!)
    .single();
  const reuse = await gb.rpc("submit_application", {
    _event: demoEvent2,
    _display_name: "B",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: stored?.idempotency_key,
  });
  const { count: cReuse } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("event_id", demoEvent2)
    .eq("user_id", users["guestb"]!);
  check(
    "same key + different event rejected (PT422), no old application returned",
    reuse.error?.code === "PT422" && !reuse.data && cReuse === 0,
  );
  const freshKey = randomUUID();
  const fresh = await gb.rpc("submit_application", {
    _event: demoEvent2,
    _display_name: "B",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: freshKey,
  });
  const retry = await gb.rpc("submit_application", {
    _event: demoEvent2,
    _display_name: "B",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: freshKey,
  });
  check(
    "lost-response retry (same key+payload) → same id",
    !retry.error && retry.data === fresh.data,
  );
  check(
    "same-title second event gets its own application",
    !fresh.error && Boolean(fresh.data) && !ids.has(fresh.data),
  );
  const { data: own } = await admin
    .from("applications")
    .select("contact_email")
    .eq("event_id", demoEvent)
    .eq("user_id", users["guestb"]!)
    .single();
  check(
    "contact taken from Auth, not client",
    own?.contact_email === `guestb-${run}@synthetic.invalid`,
  );
  const noAge = await ga.rpc("submit_application", {
    _event: demoEvent,
    _display_name: "A",
    _age_confirmed: false,
    _consent_version: "draft-2026-09",
    _idempotency: randomUUID(),
  });
  check("submit without age confirmation rejected", noAge.error?.code === "22023");
  const badConsent = await ga.rpc("submit_application", {
    _event: demoEvent2,
    _display_name: "A",
    _age_confirmed: true,
    _consent_version: "any-client-string",
    _idempotency: randomUUID(),
  });
  check("arbitrary consent_version rejected by DB", badConsent.error?.code === "22023");

  // Реальный logout → старый, ещё не истёкший aal2 JWT не проходит критическую RPC
  const { data: s } = await mo.auth.getSession();
  const stale = s.session!.access_token;
  const so = await mo.auth.signOut({ scope: "local" });
  check("real signOut succeeded", !so.error);
  const staleClient = createClient(url, pub, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${stale}` } },
  });
  const after = await staleClient.rpc("moderate_application", {
    _app: appA,
    _action: "approve",
    _expected_version: 2,
  });
  check(
    "stale unexpired aal2 JWT after logout denied (session row gone)",
    after.error?.code === "42501",
  );
} catch (e) {
  console.log(`FAIL setup: ${(e as Error).message}`);
  failed++;
} finally {
  writeManifest(created);
  const res = await cleanupByManifest(admin, created);
  if (!res.ok) failed++;
}
console.log(failed ? `RESULT: ${failed} FAIL` : "RESULT: ALL PASS");
process.exit(failed ? 1 : 0);
