/**
 * Целевые live-проверки review cf258c05 (синтетика *.invalid, очистка по manifest точных UUID):
 *  A) guest submit только через публичную RPC submit_application (без service_role-вставки заявки);
 *  B) live revoke: один и тот же ещё живой aal2 JWT модератора — доступ есть до отзыва, нет после;
 *  C) replaced-link через настоящий /auth/callback: Admin generateLink (без писем, ссылки не печатаются),
 *     старый nonce заменённого приглашения → отказ без новых auth cookies; текущий → вход.
 * Guard: VNE_INTEGRATION=cloud-synthetic, иначе exit 77 (NOT VERIFIED).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { cleanupByManifest, writeManifest, type RunManifest } from "./manifest-cleanup";

const url = process.env["SUPABASE_URL"];
const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const APP = process.env["VNE_APP_URL"] ?? "http://localhost:8080";
if (process.env["VNE_INTEGRATION"] !== "cloud-synthetic" || !url || !pub || !svc) {
  console.log("NOT VERIFIED (skip): VNE_INTEGRATION!=cloud-synthetic или нет ключей");
  process.exit(77);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, svc, opts);
const run = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}`;
const m: RunManifest = {
  run,
  users: [],
  events: [],
  apps: [],
  assignments: [],
  invites: [],
  requests: [],
};
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

try {
  const guest = await mkUser("guest");
  const mod = await mkUser("mod");
  const invitee = await mkUser("invitee", false); // pending: допуск только через привязанное приглашение
  const { data: ev, error: evErr } = await admin
    .from("events")
    .insert({ slug: `synthetic-rv-${run}`, title: `DEMO синтетика ${run}`, status: "published" })
    .select("id")
    .single();
  if (evErr || !ev) throw new Error("event");
  m.events.push(ev.id);
  writeManifest(m);

  // A) guest submit через публичную RPC
  const g = await signIn("guest");
  const sub = await g.rpc("submit_application", {
    _event: ev.id,
    _display_name: "Гость",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: randomUUID(),
  });
  if (sub.data) m.apps.push(sub.data as string);
  writeManifest(m);
  const { data: row } = await admin
    .from("applications")
    .select("user_id, status, consent_version")
    .eq("id", sub.data as string)
    .maybeSingle();
  check(
    "A guest submit via public RPC → own row, submitted, server consent",
    !sub.error &&
      row?.user_id === guest &&
      row?.status === "submitted" &&
      row?.consent_version === "draft-2026-09",
  );
  const direct = await g
    .from("applications")
    .insert({ event_id: ev.id, display_name: "x" })
    .select("id");
  check("A direct table insert by guest denied", Boolean(direct.error));

  // B) live revoke в том же JWT
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const { data: sa, error: saErr } = await admin
    .from("staff_assignments")
    .insert({ user_id: mod, role: "moderator", event_id: ev.id, valid_until: soon })
    .select("id")
    .single();
  if (saErr || !sa) throw new Error("assignment");
  m.assignments.push(sa.id);
  writeManifest(m);
  const mc = await signIn("mod");
  const { data: en } = await mc.auth.mfa.enroll({ factorType: "totp" });
  const v = await mc.auth.mfa.challengeAndVerify({ factorId: en!.id, code: totp(en!.totp.secret) });
  if (v.error) throw new Error("aal2");
  const jwtBefore = (await mc.auth.getSession()).data.session?.access_token;
  const before = await mc.from("applications").select("id").eq("event_id", ev.id);
  const capBefore = await mc.rpc("staff_can", { _cap: "event_moderate", _event: ev.id });
  check("B before revoke: same aal2 JWT sees event application", (before.data ?? []).length === 1);
  await admin
    .from("staff_assignments")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sa.id);
  const jwtAfter = (await mc.auth.getSession()).data.session?.access_token;
  const after = await mc.from("applications").select("id").eq("event_id", ev.id);
  const capAfter = await mc.rpc("staff_can", { _cap: "event_moderate", _event: ev.id });
  check("B JWT unchanged between checks (no re-login)", !!jwtBefore && jwtBefore === jwtAfter);
  check("B after revoke: same JWT sees nothing", !after.error && (after.data ?? []).length === 0);
  check(
    "B staff_can flips true→false in same JWT",
    capBefore.data === true && capAfter.data === false,
  );

  // C) replaced-link через /auth/callback
  const { data: req, error: reqErr } = await admin
    .from("membership_requests")
    .insert({
      email: email("invitee"),
      display_name: "Invitee",
      telegram_username: `syn_${run}`,
      status: "approved",
      reviewed_by: mod,
      reviewed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (reqErr || !req) throw new Error(`request ${reqErr?.code}`);
  m.requests!.push(req.id);
  writeManifest(m);
  const nonce1 = randomBytes(32).toString("base64url");
  const nonce2 = randomBytes(32).toString("base64url");
  const h = (n: string) => createHash("sha256").update(n).digest("hex");
  const i1 = await admin.rpc("issue_invite", { _request: req.id, _actor: mod });
  const id1 = (i1.data as { id: string }[] | null)?.[0]?.id;
  if (id1) m.invites!.push(id1);
  writeManifest(m);
  const mk1 = await admin.rpc("mark_invite", {
    _invite: id1,
    _sent: true,
    _user: invitee,
    _token_hash: h(nonce1),
  });
  const i2 = await admin.rpc("issue_invite", { _request: req.id, _actor: mod });
  const id2 = (i2.data as { id: string }[] | null)?.[0]?.id;
  if (id2) m.invites!.push(id2);
  writeManifest(m);
  const mk2 = await admin.rpc("mark_invite", {
    _invite: id2,
    _sent: true,
    _user: invitee,
    _token_hash: h(nonce2),
  });
  check(
    "C setup: two invites, first replaced",
    !i1.error && !i2.error && !mk1.error && !mk2.error && !!id1 && !!id2,
  );

  const callback = async (nonce: string) => {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: email("invitee"),
    });
    if (error || !data.properties?.hashed_token) throw new Error("generateLink");
    const u = `${APP}/auth/callback?token_hash=${data.properties.hashed_token}&type=email&inv=${nonce}&next=%2Fmember`;
    const r = await fetch(u, { redirect: "manual" });
    const cookies = r.headers.getSetCookie();
    const auth = cookies.filter((c) => c.startsWith("sb-"));
    return {
      loc: r.headers.get("location") ?? "",
      issued: auth.filter((c) => !/^sb-[^=]+=;/.test(c) && !/max-age=0/i.test(c)).length,
      expired: auth.filter((c) => /max-age=0/i.test(c)).length,
    };
  };
  // Прямое погашение токена в Auth (мимо /auth/callback) → настоящий JWT; токен не печатается.
  const directJwt = async () => {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: email("invitee"),
    });
    if (error || !data.properties?.hashed_token) throw new Error("generateLink");
    const c = createClient(url!, pub!, opts);
    const v = await c.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
    if (v.error || !v.data.session) throw new Error(`verifyOtp ${v.error?.code}`);
    return c;
  };
  const probe = async (c: SupabaseClient, label: string) => {
    const adm = await c.rpc("my_admission");
    const prof = await c.from("profiles").select("id");
    const apps = await c.from("applications").select("id");
    const sub = await c.rpc("submit_application_v2", {
      _event: ev.id,
      _display_name: "Обход",
      _age_confirmed: true,
      _consent_version: "draft-2026-09",
      _idempotency: randomUUID(),
    });
    const up = await c.storage
      .from("private-docs")
      .upload(`${invitee}/probe-${run}.txt`, new Blob(["x"]), { upsert: false });
    const self = await c.rpc("set_admission_service", {
      _user: invitee,
      _state: "admitted",
      _source: "self",
    });
    check(`D ${label}: my_admission=pending`, !adm.error && adm.data === "pending");
    check(
      `D ${label}: profiles → успешный SELECT, 0 строк`,
      prof.error === null && (prof.data ?? []).length === 0,
    );
    check(
      `D ${label}: own applications → успешный SELECT, 0 строк`,
      apps.error === null && (apps.data ?? []).length === 0,
    );
    check(`D ${label}: submit_application_v2 → 42501`, sub.error?.code === "42501");
    check(`D ${label}: private-docs upload denied`, Boolean(up.error));
    check(`D ${label}: self-admission RPC → denied`, Boolean(self.error) && self.data == null);
  };
  const noApp = async () =>
    ((await admin.from("applications").select("id").eq("user_id", invitee)).data ?? []).length ===
    0;

  const old = await callback(nonce1);
  check("C old replaced link → /login?error=invite", old.loc.includes("/login?error=invite"));
  check("C old replaced link → no new auth cookies issued", old.issued === 0);
  const st1 = await admin.from("invites").select("status").eq("id", id2!).single();
  check("C current invite untouched by old link", st1.data?.status === "sent");
  await probe(await directJwt(), "replaced token redeemed directly in Auth");

  // отозванное приглашение: id2 отзывается, выпускается id3 (текущее)
  const rv = await admin.rpc("revoke_invite", { _invite: id2, _actor: mod });
  check("C revoke current invite id2", rv.data === true);
  const rvLink = await callback(nonce2);
  check(
    "C revoked link → denied, no new auth cookies",
    rvLink.loc.includes("/login?error=invite") && rvLink.issued === 0,
  );
  await probe(await directJwt(), "revoked token redeemed directly in Auth");
  check("D no application created by bypass attempts", await noApp());

  const nonce3 = randomBytes(32).toString("base64url");
  const i3 = await admin.rpc("issue_invite", { _request: req.id, _actor: mod });
  const id3 = (i3.data as { id: string }[] | null)?.[0]?.id;
  if (id3) m.invites!.push(id3);
  writeManifest(m);
  const mk3 = await admin.rpc("mark_invite", {
    _invite: id3,
    _sent: true,
    _user: invitee,
    _token_hash: h(nonce3),
  });
  check("C setup: new current invite id3", !i3.error && !mk3.error && !!id3);
  const cur = await callback(nonce3);
  check(
    "C current bound link → /member with session cookie",
    cur.loc.endsWith("/member") && cur.issued > 0,
  );
  const st2 = await admin.from("invites").select("status").eq("id", id3!).single();
  check("C current invite accepted", st2.data?.status === "accepted");
  const ok = await directJwt();
  const adm2 = await ok.rpc("my_admission");
  const prof2 = await ok.from("profiles").select("id");
  const sub2 = await ok.rpc("submit_application_v2", {
    _event: ev.id,
    _display_name: "Принят",
    _age_confirmed: true,
    _consent_version: "draft-2026-09",
    _idempotency: randomUUID(),
  });
  const aid = (sub2.data as { id?: string } | null)?.id;
  if (aid) m.apps.push(aid);
  writeManifest(m);
  check("E accepted: my_admission=admitted", adm2.data === "admitted");
  check("E accepted: own profile visible", prof2.error === null && (prof2.data ?? []).length === 1);
  check("E accepted: submit via RPC works", !sub2.error && !!aid);
  const again = await callback(nonce1);
  check("E accepted member regular login not broken", again.loc.endsWith("/member"));
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
