import { fromJSON } from "seroval";
import { serveUnifiedAsset } from "../unified-stand/assets.mjs";
import { PRESENTATION_PATHS, DIAGNOSTICS_PATH } from "../unified-stand/config.mjs";
import { verifyTestSession } from "./session.mjs";
import { SCANNER_TEST_ACCOUNT_IDS } from "../src/lib/auth/scanner-test-accounts.ts";
import {
  QR_TEST_ACCOUNT_IDS,
  qrTestAccountsConfigured,
} from "../src/lib/admission/test-accounts.ts";
import { publicInvitationDestination } from "../src/lib/admission/public-invites.ts";
export const TEST_PROJECT = "appgprj_6ac605807bf88191b7f2d0b5a717505d";
export const TEST_ORIGIN = "https://vne-test-20261007.can-avci48.chatgpt.site";
export const TEST_SUPABASE = "https://xrocuwlofxhxoxajukne.supabase.co";
const pages = new Set([
  "/",
  "/login",
  "/apply",
  "/member",
  "/admin/mfa",
  "/scanner/mfa",
  "/member/pass",
  "/member/qr",
  "/scan",
  "/admin",
  "/admin/tickets",
  "/admin/violations",
  "/admin/intakes",
]);
const ADMIN_TEST_ID = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6";
const mfaFunctions = new Set([
  "getAdminMfaState",
  "beginAdminMfaEnrollment",
  "completeAdminMfaChallenge",
]);
const scannerMfaFunctions = new Set([
  "getScannerMfaState",
  "beginScannerMfaEnrollment",
  "completeScannerMfaChallenge",
]);
const qrFunctions = new Set([
  "getQrAdmissionAvailability",
  "qrAdmissionRead",
  "qrAdmissionCommand",
]);
const qrPages = new Set(["/member/pass", "/member/qr", "/scan", "/admin/tickets"]);
const publicFunctions = new Set(["getAuthAvailability", "signIn"]);
function protect(response, cookies = [], privateReferrer = false) {
  const headers = new Headers(response.headers);
  // An inner handler's cookie change (especially logout) wins over preflight refresh.
  const innerCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("Set-Cookie") ?? "").split(/,(?=\s*[^;,=\s]+=)/).filter(Boolean);
  const finalCookies = new Map();
  for (const cookie of [...cookies, ...innerCookies].flatMap((value) =>
    value.split(/,(?=\s*[^;,=\s]+=)/),
  ))
    finalCookies.set(cookie.slice(0, cookie.indexOf("=")).trim(), cookie);
  headers.delete("Set-Cookie");
  for (const cookie of finalCookies.values()) headers.append("Set-Cookie", cookie);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  if (privateReferrer) {
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    headers.set("X-Frame-Options", "DENY");
  } else if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
const deny = (status = 404, cookies = []) =>
  protect(new Response("TEST access unavailable", { status }), cookies, true);
// A denied page can help switch accounts without granting access or logging out implicitly.
function wrongMfaAccount(path, cookies) {
  const admin = path !== "/scanner/mfa";
  const title = admin ? "Нужен аккаунт ADMIN_TEST" : "Нужен TEST-аккаунт сканера";
  return protect(
    new Response(
      `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main><h1>${title}</h1><p>В этом браузере открыт другой тестовый аккаунт. Доступ к этой настройке закрыт.</p><p>На странице входа завершите текущий сеанс, затем войдите в нужный аккаунт.</p><a href="/login?next=${path}">Сменить аккаунт и вернуться к настройке</a></main></html>`,
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
    ),
    cookies,
    true,
  );
}
// Reject malformed serializer envelopes before framework error reporting can inspect them.
function validQrEnvelope(raw) {
  const plain = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  try {
    const value = fromJSON(JSON.parse(raw));
    // Start adds context/method after decoding: frozen roots must never reach that mutation.
    if (!plain(value) || !Object.isExtensible(value)) return false;
    if (Object.keys(value).some((key) => key !== "data" && key !== "context")) return false;
    if (
      Object.values(Object.getOwnPropertyDescriptors(value)).some(
        (descriptor) => !Object.hasOwn(descriptor, "value") || descriptor.writable !== true,
      )
    )
      return false;
    return (
      value.context === undefined ||
      (plain(value.context) &&
        Object.isExtensible(value.context) &&
        Object.keys(value.context).length === 0)
    );
  } catch {
    return false;
  }
}
async function boundedBody(request, limit) {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes;
}
export default function withTestGuard(
  worker,
  { projectId, functions, assets, previews = {}, unified = false },
  verifySession = verifyTestSession,
) {
  if (projectId !== TEST_PROJECT || !functions || !Array.isArray(assets))
    throw new Error("Invalid TEST build");
  if (typeof unified !== "boolean") throw new Error("Invalid Unified TEST mode");
  const presentationPaths = new Set(unified ? PRESENTATION_PATHS : []);
  const staticPaths = new Set(assets);
  const previewPaths = new Set([
    "/preview",
    "/preview/menu",
    "/preview/pass",
    "/preview/violations",
  ]);
  if (Object.keys(previews).some((p) => !previewPaths.has(p) || typeof previews[p] !== "string"))
    throw new Error("Invalid TEST preview page");
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url),
        method = request.method;
      if (
        env.VNE_TEST_AUTH_MODE !== "supabase-synthetic" ||
        env.VNE_TEST_VARIANT !== "qr-admission-only" ||
        env.VNE_QR_ADMISSION !== "test-explicit-v2" ||
        !qrTestAccountsConfigured(env) ||
        env.VNE_AUTH_ENV !== "staging" ||
        env.VNE_SITE_URL !== TEST_ORIGIN ||
        url.origin !== TEST_ORIGIN ||
        env.VNE_SUPABASE_URL !== TEST_SUPABASE ||
        env.VNE_MEMBERSHIP_QUESTIONNAIRE !== "test" ||
        env.VNE_DELIVERY_MODE !== "disabled" ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.VNE_SUPABASE_PUBLISHABLE_KEY ?? "")
      )
        return deny(503);
      if (url.pathname.includes("%") || url.pathname.includes("\\")) return deny();
      if (
        unified &&
        /^\/(assets|fonts|media|loading|brand)(\/|$)/.test(url.pathname) &&
        !staticPaths.has(url.pathname)
      ) {
        return protect(
          new Response(method === "HEAD" ? null : "Asset not found", {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }),
          [],
          true,
        );
      }
      // The only public campaign mapping is fixed in source and never carries a secret.
      if (url.pathname.startsWith("/i/")) {
        const destination = publicInvitationDestination(url.pathname.slice(3));
        if (!destination || url.search || !["GET", "HEAD"].includes(method)) return deny();
        return protect(new Response(null, { status: 302, headers: { Location: destination } }));
      }
      // Synthetic preview documents are separate from the authenticated app.
      // No backend dispatch, session check, submitted data or state mutation.
      if (Object.hasOwn(previews, url.pathname)) {
        if (!["GET", "HEAD"].includes(method)) return deny(405);
        if (url.search) return deny();
        return new Response(method === "HEAD" ? null : previews[url.pathname], {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
            "Content-Security-Policy":
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'self' about:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'; frame-ancestors 'none'",
          },
        });
      }
      const fn = functions[url.pathname];
      const diagnosticsRequest = unified && url.pathname === DIAGNOSTICS_PATH;
      if (diagnosticsRequest && url.search) return deny();
      const incidentRequest =
        url.pathname === "/admin/violations" ||
        url.pathname === "/admin/intakes" ||
        fn?.name === "incidentAction";
      if (incidentRequest && env.VNE_INCIDENTS_MODE !== "test") return deny();
      const qrRequest = qrPages.has(url.pathname) || (fn && qrFunctions.has(fn.name));
      // Tokens are opaque POST data only. No secret or arbitrary fields in page/read URLs.
      if (url.pathname === "/member/pass" || url.pathname === "/member/qr") {
        const fields = [...url.searchParams.keys()];
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
        if (
          fields.length !== 2 ||
          fields.filter((k) => k === "event").length !== 1 ||
          fields.filter((k) => k === "participation").length !== 1 ||
          !uuid.test(url.searchParams.get("event") ?? "") ||
          !uuid.test(url.searchParams.get("participation") ?? "")
        )
          return deny();
      } else if (url.pathname === "/scan") {
        if (url.search && url.search !== "?qa=timed") return deny();
      } else if (qrPages.has(url.pathname) && url.search) return deny();
      if (fn && qrFunctions.has(fn.name)) {
        const keys = [...url.searchParams.keys()];
        if (fn.name === "getQrAdmissionAvailability" && keys.length) return deny(400);
        if (
          fn.method === "POST"
            ? keys.length > 0
            : keys.length > 1 || keys.some((k) => k !== "payload")
        )
          return deny(400);
      }
      if (
        url.search.length > 8192 ||
        /VNE[12](?::|%3a)/i.test(url.search) ||
        [...url.searchParams.values()].some((value) => /VNE[12](?::|%3a)/i.test(value))
      )
        return deny(400);
      if (unified && staticPaths.has(url.pathname)) return serveUnifiedAsset(request, env);
      const mfaRequest = url.pathname === "/admin/mfa" || (fn && mfaFunctions.has(fn.name));
      const scannerMfaRequest =
        url.pathname === "/scanner/mfa" || (fn && scannerMfaFunctions.has(fn.name));
      if (scannerMfaRequest && env.VNE_TEST_SCANNER_MFA !== "enabled") return deny();
      if (mfaRequest && env.VNE_TEST_ADMIN_MFA !== "enabled") return deny();
      if (fn) {
        if (method !== fn.method) return deny(405);
      } else if (
        !(
          pages.has(url.pathname) ||
          presentationPaths.has(url.pathname) ||
          diagnosticsRequest ||
          staticPaths.has(url.pathname)
        ) ||
        !["GET", "HEAD"].includes(method)
      )
        return deny();
      if (method === "POST" && request.headers.get("origin") !== TEST_ORIGIN) return deny(403);
      if (request.headers.get("sec-fetch-site") === "cross-site" && (method === "POST" || fn))
        return deny(403);
      const headers = new Headers(request.headers);
      for (const key of [...headers.keys()])
        if (
          key.startsWith("x-vne-") ||
          key.startsWith("oai-") ||
          key === "authorization" ||
          key === "x-forwarded-host" ||
          key === "x-forwarded-proto" ||
          key === "forwarded"
        )
          headers.delete(key);
      let body;
      if (method === "POST") {
        if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
          return deny(415);
        try {
          body = await boundedBody(
            request,
            fn?.name === "qrAdmissionCommand" ? 8192 : fn?.name === "signIn" ? 16384 : 65536,
          );
        } catch {
          return deny(400);
        }
        if (body === null) return deny(413);
      }
      if (fn?.name === "qrAdmissionCommand" && !validQrEnvelope(new TextDecoder().decode(body)))
        return deny(400);
      if (
        fn?.name === "qrAdmissionRead" &&
        url.searchParams.has("payload") &&
        !validQrEnvelope(url.searchParams.get("payload"))
      )
        return deny(400);
      const clean = new Request(request, { headers, ...(body ? { body } : {}) });
      const publicRequest =
        (!unified && url.pathname === "/") ||
        url.pathname === "/login" ||
        staticPaths.has(url.pathname) ||
        (fn && publicFunctions.has(fn.name));
      let session = { allowed: false, cookies: [] };
      if (!publicRequest) {
        try {
          session = await verifySession(clean, env);
        } catch {
          return deny(401);
        }
        if (!session.allowed) {
          if (!fn && ["GET", "HEAD"].includes(method))
            return protect(
              new Response(null, {
                status: 303,
                headers: {
                  Location: [
                    "/admin/mfa",
                    "/scanner/mfa",
                    "/admin/violations",
                    "/admin/intakes",
                    ...(unified ? [DIAGNOSTICS_PATH] : []),
                  ].includes(url.pathname)
                    ? "/login?next=" + url.pathname
                    : "/login",
                },
              }),
              session.cookies,
            );
          return deny(401, session.cookies);
        }
      }
      if (diagnosticsRequest && session.userId !== ADMIN_TEST_ID)
        return method === "GET"
          ? wrongMfaAccount(DIAGNOSTICS_PATH, session.cookies)
          : deny(403, session.cookies);
      if (incidentRequest && session.userId !== ADMIN_TEST_ID)
        return ["/admin/violations", "/admin/intakes"].includes(url.pathname) && method === "GET"
          ? wrongMfaAccount(url.pathname, session.cookies)
          : deny(403, session.cookies);
      if (qrRequest && !QR_TEST_ACCOUNT_IDS.includes(session.userId))
        return deny(403, session.cookies);
      if (mfaRequest && session.userId !== ADMIN_TEST_ID)
        return url.pathname === "/admin/mfa" && method === "GET"
          ? wrongMfaAccount("/admin/mfa", session.cookies)
          : deny(403, session.cookies);
      if (scannerMfaRequest && !SCANNER_TEST_ACCOUNT_IDS.includes(session.userId))
        return url.pathname === "/scanner/mfa" && method === "GET"
          ? wrongMfaAccount("/scanner/mfa", session.cookies)
          : deny(403, session.cookies);
      try {
        const forwardedHeaders = new Headers(clean.headers);
        if (session.requestCookie !== undefined)
          forwardedHeaders.set("Cookie", session.requestCookie);
        return protect(
          await worker.fetch(new Request(clean, { headers: forwardedHeaders }), env, ctx),
          session.cookies,
          diagnosticsRequest ||
            mfaRequest ||
            scannerMfaRequest ||
            incidentRequest ||
            qrRequest ||
            url.pathname === "/member",
        );
      } catch {
        return deny(503, session.cookies);
      }
    },
  };
}
