/**
 * Точечные проверки идемпотентности подачи заявки по неизменяемому отпечатку исходной команды
 * (событие, имя, возраст, версия согласия). Синтетика *.invalid, очистка только по manifest точных UUID.
 * Guard: VNE_INTEGRATION=cloud-synthetic, иначе exit 77.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupByManifest, writeManifest, type RunManifest } from "./manifest-cleanup";

const url = process.env["SUPABASE_URL"];
const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
import { randomUUID } from "node:crypto";
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
const CV = "draft-2026-09";
type SubmitResult = {
  id?: string;
  outcome?: "created" | "replay" | "existing";
  display_name?: string;
};

const result = (data: unknown) => data as SubmitResult | null;
const snap = async (id: string) =>
  (
    await admin
      .from("applications")
      .select("display_name,version,status,submit_fingerprint,idempotency_key")
      .eq("id", id)
      .single()
  ).data;
const count = async (uid: string) =>
  (await admin.from("applications").select("id", { count: "exact", head: true }).eq("user_id", uid))
    .count ?? -1;

try {
  const uid = await mkUser("idem");
  const ev = await mkEvent("idem");
  const g = await signIn("idem");
  const key = randomUUID();
  const base = {
    _event: ev.id,
    _display_name: "Имя A",
    _age_confirmed: true,
    _consent_version: CV,
    _idempotency: key,
  };
  const s1 = await g.rpc("submit_application_v2", base);
  const id = (s1.data as { id?: string } | null)?.id;
  if (id) m.apps.push(id);
  writeManifest(m);
  check("create → outcome=created", !s1.error && result(s1.data)?.outcome === "created" && !!id);
  const fp0 = (await snap(id!))?.submit_fingerprint;
  check("fingerprint stored (64 hex)", typeof fp0 === "string" && /^[0-9a-f]{64}$/.test(fp0));

  const r1 = await g.rpc("submit_application_v2", base);
  check(
    "identical retry → same id, outcome=replay",
    !r1.error && result(r1.data)?.id === id && result(r1.data)?.outcome === "replay",
  );

  const before = JSON.stringify(await snap(id!));
  const n0 = await count(uid);
  const cn = await g.rpc("submit_application_v2", { ...base, _display_name: "Имя B" });
  check("same key + changed name → PT422", cn.error?.code === "PT422" && cn.data === null);
  const cc = await g.rpc("submit_application_v2", { ...base, _consent_version: "draft-2026-01" });
  check("same key + changed consent_version → PT422", cc.error?.code === "PT422");
  const ca = await g.rpc("submit_application_v2", { ...base, _age_confirmed: false });
  check("same key + changed age_confirmed → PT422", ca.error?.code === "PT422");
  check(
    "conflicts changed nothing (row + count)",
    JSON.stringify(await snap(id!)) === before && (await count(uid)) === n0,
  );

  const rn = await g.rpc("guest_update_display_name", {
    _app: id,
    _name: "Имя C",
    _expected_version: 1,
  });
  const afterEdit = await snap(id!);
  check(
    "legitimate edit name → v2, fingerprint unchanged",
    rn.data === 2 && afterEdit?.display_name === "Имя C" && afterEdit?.submit_fingerprint === fp0,
  );
  const r2 = await g.rpc("submit_application_v2", base);
  check(
    "identical retry after edit → same id, replay, actual name returned (not overwritten)",
    !r2.error &&
      result(r2.data)?.id === id &&
      result(r2.data)?.outcome === "replay" &&
      result(r2.data)?.display_name === "Имя C" &&
      (await snap(id!))?.display_name === "Имя C",
  );

  const n1 = await count(uid);
  const nk = await g.rpc("submit_application_v2", {
    ...base,
    _display_name: "Имя D",
    _idempotency: randomUUID(),
  });
  check(
    "new key on existing active app → outcome=existing, same id, actual data, name NOT saved",
    !nk.error &&
      result(nk.data)?.outcome === "existing" &&
      result(nk.data)?.id === id &&
      result(nk.data)?.display_name === "Имя C" &&
      (await snap(id!))?.display_name === "Имя C" &&
      (await count(uid)) === n1,
  );
  const legacy = await g.rpc("submit_application", base);
  check("legacy public submit_application wrapper → same id", !legacy.error && legacy.data === id);
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
