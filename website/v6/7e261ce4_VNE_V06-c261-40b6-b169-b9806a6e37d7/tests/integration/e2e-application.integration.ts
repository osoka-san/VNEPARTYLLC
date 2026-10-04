/**
 * Один сквозной сценарий stage05 на актуальной схеме (синтетика *.invalid, очистка по manifest точных UUID):
 * guest RPC submit → чтение после нового входа → mod take → request_info(public) → гость видит вопрос →
 * reply → история вопрос/ответ → mod approve → гость видит approved, одобрение не даёт QR/оплату.
 * Вторая заявка: rename, запрет owner/status/event, stale/null version, withdraw. Отказ ничего не меняет.
 * Скриншоты — штатным входом через e2e_screens.py (учётные данные только в env дочернего процесса).
 * Guard: VNE_INTEGRATION=cloud-synthetic, иначе exit 77.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { cleanupByManifest, writeManifest, type RunManifest } from "./manifest-cleanup";

const url = process.env["SUPABASE_URL"];
const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const SHOTS = process.env["E2E_SHOTS_DIR"];
if (process.env["VNE_INTEGRATION"] !== "cloud-synthetic" || !url || !pub || !svc) {
  console.log("NOT VERIFIED (skip): VNE_INTEGRATION!=cloud-synthetic или нет ключей");
  process.exit(77);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, svc, opts);
const run = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}`;
const m: RunManifest = { run, users: [], events: [], apps: [], assignments: [] };
let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
};
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
const email = (tag: string) => `${tag}-${run}@synthetic.invalid`;
async function mkUser(tag: string, admit = true) {
  const { data, error } = await admin.auth.admin.createUser({
    email: email(tag),
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${tag}`);
  if (admit) {
    // доверенная тестовая подготовка: явный допуск только точного id этого прогона
    const ad = await admin.rpc("set_admission_service", {
      _user: data.user.id,
      _state: "admitted",
      _source: `test-run:${run}`,
    });
    if (ad.error) throw new Error(`admission ${tag} ${ad.error.code}`);
  }
  m.users.push(data.user.id);
  writeManifest(m);
  return data.user.id;
}
async function signIn(tag: string): Promise<SupabaseClient> {
  const c = createClient(url!, pub!, opts);
  const { error } = await c.auth.signInWithPassword({ email: email(tag), password });
  if (error) throw new Error(`signIn ${tag}`);
  return c;
}
async function mkEvent(suffix: string) {
  const slug = `synthetic-e2e${suffix}-${run}`;
  const { data, error } = await admin
    .from("events")
    .insert({ slug, title: `DEMO синтетика E2E${suffix} ${run}`, status: "published" })
    .select("id")
    .single();
  if (error || !data) throw new Error("event");
  m.events.push(data.id);
  writeManifest(m);
  return { id: data.id as string, slug };
}
const shots: unknown[] = [];
async function screens(phase: string, tag: string, extra: Record<string, string>) {
  if (!SHOTS) return console.log(`NOT VERIFIED screenshots ${phase}: E2E_SHOTS_DIR not set`);
  const p = Bun.spawn(["python3", "docs/sprint/evidence/05/scripts/e2e_screens.py", phase, SHOTS], {
    env: { ...process.env, E2E_EMAIL: email(tag), E2E_PASS: password, ...extra },
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text();
  const code = await p.exited;
  try {
    const j = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    shots.push({ ...j, exit: code });
    console.log(
      `SCREENS ${phase} exit=${code} ${JSON.stringify(j.checks)} shots=${j.shots?.length ?? 0}`,
    );
  } catch {
    console.log(`NOT VERIFIED screenshots ${phase}: exit=${code} (no result)`);
  }
}
const evCount = async (app: string) =>
  (
    await admin
      .from("application_events")
      .select("id", { count: "exact", head: true })
      .eq("application_id", app)
  ).count ?? -1;

try {
  const guest = await mkUser("guest");
  const mod = await mkUser("mod");
  const evB = await mkEvent("b");
  const evC = await mkEvent("c");
  const soon = new Date(Date.now() + 3 * 3600_000).toISOString();
  const { data: sa } = await admin
    .from("staff_assignments")
    .insert({ user_id: mod, role: "moderator", event_id: evB.id, valid_until: soon })
    .select("id")
    .single();
  if (!sa) throw new Error("assignment");
  m.assignments.push(sa.id);
  writeManifest(m);

  // 1. guest submit через публичную RPC
  const g1 = await signIn("guest");
  const sub = await g1.rpc("submit_application", {
    _event: evB.id,
    _display_name: "Гость E2E",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: randomUUID(),
  });
  const appB = sub.data as string;
  if (appB) m.apps.push(appB);
  writeManifest(m);
  check("1 guest submit via public RPC", !sub.error && !!appB);
  console.log(`APP_B=${appB}`);

  // 2. чтение после нового входа (эквивалент reload/new request)
  const g2 = await signIn("guest");
  const r2 = await g2
    .from("applications")
    .select("status, version, user_id")
    .eq("id", appB)
    .single();
  check(
    "2 read after new sign-in: own, submitted, v1",
    r2.data?.status === "submitted" && r2.data?.version === 1 && r2.data?.user_id === guest,
  );

  // 3. модератор aal2
  const mc = await signIn("mod");
  const { data: en } = await mc.auth.mfa.enroll({ factorType: "totp" });
  const secret = en!.totp.secret;
  const v = await mc.auth.mfa.challengeAndVerify({ factorId: en!.id, code: totp(secret) });
  check("3 moderator aal2 via real TOTP", !v.error);
  const ev0 = await evCount(appB);
  const take = await mc.rpc("moderate_application", {
    _app: appB,
    _action: "take",
    _expected_version: 1,
  });
  const q = "Уточните, пожалуйста, с кем вы придёте.";
  const ri = await mc.rpc("moderate_application", {
    _app: appB,
    _action: "request_info",
    _expected_version: 2,
    _public_message: q,
  });
  check(
    "3 mod take → under_review, request_info → needs_info",
    take.data === "under_review" && ri.data === "needs_info",
  );
  check("3 one history row per success (2)", (await evCount(appB)) === ev0 + 2);

  // 4. гость видит вопрос (новый вход)
  const g3 = await signIn("guest");
  const r4 = await g3
    .from("applications")
    .select("status, public_message, version")
    .eq("id", appB)
    .single();
  const h4 = await g3
    .from("application_events")
    .select("to_status, public_message")
    .eq("application_id", appB);
  check(
    "4 guest sees needs_info + question (row and history)",
    r4.data?.status === "needs_info" &&
      r4.data?.public_message === q &&
      (h4.data ?? []).some((e) => e.public_message === q),
  );
  await screens("guest_question", "guest", { E2E_APP_ID: appB, E2E_EVENT_SLUG: evC.slug });

  // 5. ответ гостя
  const reply = "Приду один.";
  const before5 = await evCount(appB);
  const badReply = await g3.rpc("guest_application_action", {
    _app: appB,
    _action: "reply",
    _expected_version: 2,
    _reply: reply,
  });
  check(
    "5 stale reply → PT409, no history",
    badReply.error?.code === "PT409" && (await evCount(appB)) === before5,
  );
  const rep = await g3.rpc("guest_application_action", {
    _app: appB,
    _action: "reply",
    _expected_version: 3,
    _reply: reply,
  });
  check("5 reply → under_review", rep.data === "under_review");
  const h5 = await g3
    .from("application_events")
    .select("at, to_status, public_message, guest_message")
    .eq("application_id", appB)
    .order("at");
  const hist = h5.data ?? [];
  check(
    "5 history: question then reply, timestamps, submit+take+question+reply rows",
    hist.length === ev0 + 3 &&
      hist.some((e) => e.public_message === q) &&
      hist.some((e) => e.guest_message === reply) &&
      hist.every((e) => !!e.at),
  );
  await screens("guest_history", "guest", { E2E_APP_ID: appB });
  await screens("staff_queue", "mod", { E2E_TOTP_SECRET: secret });

  // 6. approve → гость видит approved, без QR/оплаты
  const ap = await mc.rpc("moderate_application", {
    _app: appB,
    _action: "approve",
    _expected_version: 4,
  });
  check("6 mod approve → approved", ap.data === "approved");
  const g4 = await signIn("guest");
  const r6 = await g4.from("applications").select("*").eq("id", appB).single();
  const keys = Object.keys(r6.data ?? {});
  check("6 guest sees approved v5", r6.data?.status === "approved" && r6.data?.version === 5);
  check(
    "6 approval row has no qr/pass/payment fields",
    !keys.some((k) => /qr|pass|payment|order|price|amount/i.test(k)),
  );
  const noTables = await Promise.all(
    ["passes", "payments", "orders", "checkins"].map((t) => g4.from(t).select("*").limit(1)),
  );
  check(
    "6 no pass/payment/order/checkin tables exposed (stage 06 not started)",
    noTables.every((r) => !!r.error),
  );
  const again = await g4.rpc("guest_application_action", {
    _app: appB,
    _action: "withdraw",
    _expected_version: 5,
  });
  check("6 final approved: guest withdraw → 22023", again.error?.code === "22023");

  // 7. вторая заявка: rename, запреты, stale/null, withdraw
  const subC = await g4.rpc("submit_application", {
    _event: evC.id,
    _display_name: "Имя 1",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: randomUUID(),
  });
  const appC = subC.data as string;
  if (appC) m.apps.push(appC);
  writeManifest(m);
  console.log(`APP_C=${appC}`);
  const rn = await g4.rpc("guest_update_display_name", {
    _app: appC,
    _name: "Имя 2",
    _expected_version: 1,
  });
  check("7 rename → v2", rn.data === 2);
  const e0 = await evCount(appC);
  const snap = async () =>
    (
      await admin
        .from("applications")
        .select("user_id,status,event_id,version,display_name")
        .eq("id", appC)
        .single()
    ).data;
  const s0 = await snap();
  const dOwner = await g4.from("applications").update({ user_id: mod }).eq("id", appC).select("id");
  const dStatus = await g4
    .from("applications")
    .update({ status: "approved" })
    .eq("id", appC)
    .select("id");
  const dEvent = await g4
    .from("applications")
    .update({ event_id: evB.id })
    .eq("id", appC)
    .select("id");
  const stale = await g4.rpc("guest_update_display_name", {
    _app: appC,
    _name: "X",
    _expected_version: 1,
  });
  const nul = await g4.rpc("guest_update_display_name", {
    _app: appC,
    _name: "X",
    _expected_version: null,
  });
  const wNull = await g4.rpc("guest_application_action", {
    _app: appC,
    _action: "withdraw",
    _expected_version: null,
  });
  check(
    "7 direct owner/status/event updates denied",
    [dOwner, dStatus, dEvent].every((r) => Boolean(r.error) || (r.data ?? []).length === 0),
  );
  check(
    "7 stale → PT409, null → 22023 (rename and withdraw)",
    stale.error?.code === "PT409" && nul.error?.code === "22023" && wNull.error?.code === "22023",
  );
  check(
    "7 refusals changed nothing (row + history)",
    JSON.stringify(await snap()) === JSON.stringify(s0) && (await evCount(appC)) === e0,
  );
  const wd = await g4.rpc("guest_application_action", {
    _app: appC,
    _action: "withdraw",
    _expected_version: 2,
  });
  check(
    "7 withdraw → withdrawn, +1 history",
    wd.data === "withdrawn" && (await evCount(appC)) === e0 + 1,
  );
  const mForeign = await mc.rpc("moderate_application", {
    _app: appC,
    _action: "take",
    _expected_version: 3,
  });
  check("7 moderator of other event cannot act on appC", mForeign.error?.code === "42501");
} catch (e) {
  console.log(`FAIL setup: ${(e as Error).message}`);
  failed++;
} finally {
  writeManifest(m);
  const res = await cleanupByManifest(admin, m);
  if (!res.ok) failed++;
}
console.log(failed ? `RESULT: ${failed} FAIL` : "RESULT: ALL PASS");
process.exit(failed ? 1 : 0);
