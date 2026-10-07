/**
 * Интеграционная проверка НАСТОЯЩЕГО локального Supabase (Auth + PostgREST + MFA + logout).
 * Guard: VNE_INTEGRATION=local-supabase и URL только localhost/127.0.0.1.
 * Без сервера: печатает NOT VERIFIED и завершается кодом 77 (skip). Никогда не PASS без проверки.
 * Нужен локальный `supabase start` с применёнными db/migrations (сейчас Docker недоступен).
 */
import { createClient } from "@supabase/supabase-js";

const SKIP = 77;
const url = process.env["VNE_LOCAL_SUPABASE_URL"];
const key = process.env["VNE_LOCAL_SUPABASE_PUBLISHABLE_KEY"];
function skip(why: string): never {
  console.log(`NOT VERIFIED (skip): ${why}`);
  process.exit(SKIP);
}
if (process.env["VNE_INTEGRATION"] !== "local-supabase") skip("VNE_INTEGRATION!=local-supabase");
if (!url || !key) skip("VNE_LOCAL_SUPABASE_URL/KEY не заданы");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") skip("разрешён только локальный Supabase");
try {
  await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
} catch {
  skip("локальный Supabase не отвечает");
}

let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const email = `it-${Date.now()}@vne-test.invalid`;
const password = "synthetic-Password-123";
const c = createClient(url, key, { auth: { persistSession: false } });

const su = await c.auth.signUp({ email, password });
check("signUp synthetic user (local autoconfirm)", !su.error);
const bad = await c.auth.signInWithPassword({ email, password: "wrong-password-000" });
const none = await c.auth.signInWithPassword({ email: `no-${email}`, password });
check(
  "wrong password and unknown user give same error",
  !!bad.error && bad.error.message === none.error?.message,
);
const si = await c.auth.signInWithPassword({ email, password });
check("signIn", !si.error && !!si.data.session);
const own = await c
  .from("profiles")
  .select("id")
  .eq("id", si.data.user?.id ?? "");
check("PostgREST own profile readable", !own.error && own.data?.length === 1);
const others = await c
  .from("profiles")
  .select("id")
  .neq("id", si.data.user?.id ?? "");
check("PostgREST other profiles hidden", !others.error && others.data?.length === 0);
const guard1 = await c.rpc("my_staff_access", { _area: "admin" });
check("guest aal1 denied by my_staff_access", guard1.data === false);
const en = await c.auth.mfa.enroll({ factorType: "totp" });
check("MFA TOTP enroll returns factor", !en.error && !!en.data?.id);
const wrong = await c.auth.mfa.challengeAndVerify({ factorId: en.data?.id ?? "", code: "000000" });
check("MFA wrong code rejected", !!wrong.error);
const oldToken = si.data.session?.access_token ?? "";
await c.auth.signOut({ scope: "local" });
const stale = createClient(url, key, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${oldToken}` } },
});
const after = await stale.rpc("my_staff_access", { _area: "admin" });
check("old JWT after logout gives no staff access", after.data !== true);
console.log(failed ? `INTEGRATION FAIL (${failed})` : "INTEGRATION PASS");
process.exit(failed ? 1 : 0);
