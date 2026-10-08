import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import {
  DAY07_MEMBER_TEST_ID,
  SCANNER_TEST_ACCOUNT_IDS,
} from "../src/lib/auth/scanner-test-accounts.ts";
export const TEST_ACCOUNT_ID = "2b321688-f5fe-4099-9de2-f316bf07c3d3";
// Exact six-account TEST QA scope. Membership/staff/MFA/admission rights are separate.
export const TEST_ACCOUNT_IDS = Object.freeze([
  TEST_ACCOUNT_ID,
  "02e03845-bc0d-4a9b-8500-87bb1f11ccf6",
  "996a7a9c-04fc-43f2-9251-7d5a8dd9a92b",
  DAY07_MEMBER_TEST_ID,
  ...SCANNER_TEST_ACCOUNT_IDS,
]);
export async function verifyTestSession(request, env) {
  const jar = new Map(
      parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => [c.name, c.value ?? ""]),
    ),
    pending = new Map();
  const client = createServerClient(env.VNE_SUPABASE_URL, env.VNE_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => {
        for (const c of items) {
          pending.set(c.name, c);
          if (!c.value || c.options?.maxAge === 0) jar.delete(c.name);
          else jar.set(c.name, c.value);
        }
      },
    },
    cookieOptions: { sameSite: "lax", secure: true, path: "/" },
  });
  try {
    const { data, error } = await client.auth.getUser();
    return {
      userId:
        !error &&
        data.user &&
        TEST_ACCOUNT_IDS.includes(data.user.id) &&
        data.user.is_anonymous === false
          ? data.user.id
          : null,
      allowed:
        !error && TEST_ACCOUNT_IDS.includes(data.user?.id) && data.user.is_anonymous === false,
      cookies: [...pending.values()].map((c) => serializeCookieHeader(c.name, c.value, c.options)),
      requestCookie: [...jar]
        .map(([name, value]) => serializeCookieHeader(name, value, {}).split(";")[0])
        .join("; "),
    };
  } catch {
    return { allowed: false, cookies: [] };
  }
}
