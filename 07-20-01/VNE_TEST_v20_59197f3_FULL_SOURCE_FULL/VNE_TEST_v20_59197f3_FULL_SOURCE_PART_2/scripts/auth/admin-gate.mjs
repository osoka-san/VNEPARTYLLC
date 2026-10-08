import {
  COOKIE,
  PRIVATE,
  ensureBootstrapAccounts,
  getSiteSession,
  createLogin,
  logout,
  accessApi,
  can,
  boundedText,
  json,
  audit,
} from "./site-access.mjs";
export { getSiteSession } from "./site-access.mjs";
const safe = (value) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !/[\\\r\n]/.test(value)
    ? value
    : "/";
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const redirect = (path, cookie) =>
  new Response(null, {
    status: 303,
    headers: { ...PRIVATE, Location: path, ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
function login(next, error = "", status = 200) {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход — ВНЕ</title><link rel="stylesheet" href="/loading/wormhole.css?v=4"><script src="/loading/gate.js?v=4" defer></script><style>*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 10%,#19352b 0,transparent 50%),#070a09;color:#edf2ee;font:16px system-ui;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:min(430px,100%);border:1px solid #ffffff20;background:#0d1410e8;padding:clamp(24px,6vw,48px)}.brand{color:#30e5ad;letter-spacing:.22em;font-size:12px}h1{font-size:clamp(27px,6vw,36px);font-weight:500;letter-spacing:-.04em;margin:36px 0 16px}label{display:block;margin:24px 0 8px;font-size:14px}input,button{width:100%;min-height:48px;font:inherit;border:1px solid #ffffff30;padding:12px;background:#111c16;color:#edf2ee}input:focus{outline:2px solid #30e5ad;outline-offset:2px}button{margin-top:28px;background:#30e5ad;color:#070a09;border:0;cursor:pointer;font-weight:600}p{color:#aab8ae;line-height:1.6;font-size:14px}.error{color:#ffab95;border-left:2px solid #e55330;padding-left:12px}footer{margin-top:32px;border-top:1px solid #ffffff18;padding-top:20px;font-size:12px;color:#8fa396}</style></head><body><main><div class="brand">ВНЕ / PRIVATE ACCESS</div><h1>Внутри — больше.</h1><p>Войдите в сайт и панель управления с выданной учётной записью.</p><form method="post" action="/admin-login"><input type="hidden" name="next" value="${escape(next)}"><label for="username">Логин</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="100"><label for="password">Пароль</label><input id="password" type="password" name="password" autocomplete="current-password" required maxlength="200">${error ? `<p role="alert" class="error">${error}</p>` : ""}<button>Войти →</button></form><footer>Персональный доступ · действия в админке записываются в журнал.</footer></main><div class="vne-loading-glass" data-gate-loading hidden><div class="vne-loading-center"><span class="vne-loading-brand" role="img" aria-label="ВНЕ"></span><span class="vne-wormhole" aria-hidden="true"><i style="--ring-index:0"></i><i style="--ring-index:1"></i><i style="--ring-index:2"></i><i style="--ring-index:3"></i><i style="--ring-index:4"></i><i style="--ring-index:5"></i><i style="--ring-index:6"></i><i style="--ring-index:7"></i><i style="--ring-index:8"></i><i style="--ring-index:9"></i><i style="--ring-index:10"></i><i style="--ring-index:11"></i><i style="--ring-index:12"></i><i style="--ring-index:13"></i><i style="--ring-index:14"></i><i style="--ring-index:15"></i></span><span class="vne-loading-percent" data-loading-percent role="progressbar" aria-label="Оценка прогресса загрузки" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Приблизительно 0%"><span class="vne-loading-percent-value" data-loading-percent-value aria-hidden="true">0%</span><span class="vne-loading-percent-track" aria-hidden="true"><span class="vne-loading-percent-fill"></span></span></span><span class="vne-loading-label" role="status" aria-live="polite">Открываем пространство ВНЕ</span></div></div></body></html>`,
    {
      status,
      headers: {
        ...PRIVATE,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
export default function gate(worker) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      try {
        await ensureBootstrapAccounts(env);
        const actor = await getSiteSession(request, env);
        if (url.pathname === "/admin-logout") {
          if (request.method !== "POST" || request.headers.get("origin") !== url.origin)
            return json({ ok: false, error: "ORIGIN_REJECTED" }, 403);
          await logout(request, env, actor);
          return redirect(
            "/admin-login",
            `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
          );
        }
        if (url.pathname === "/admin-login") {
          const next = safe(url.searchParams.get("next"));
          if (request.method === "GET") return actor ? redirect(next) : login(next);
          if (request.method !== "POST")
            return new Response(null, { status: 405, headers: PRIVATE });
          if (
            request.headers.get("origin") !== url.origin ||
            request.headers.get("sec-fetch-site") === "cross-site"
          )
            return json({ ok: false, error: "ORIGIN_REJECTED" }, 403);
          if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
            return json({ ok: false, error: "INVALID_INPUT" }, 400);
          const form = new URLSearchParams(await boundedText(request, 4096));
          const username = form.get("username") || "",
            password = form.get("password") || "";
          if (username.length > 100 || password.length > 200)
            return login(safe(form.get("next")), "Неверный логин или пароль.", 401);
          const result = await createLogin(request, env, username, password);
          if (result.status === 429) {
            const response = login(
              safe(form.get("next")),
              "Слишком много попыток. Повторите через 15 минут.",
              429,
            );
            response.headers.set("Retry-After", "900");
            return response;
          }
          return result.status === 200
            ? redirect(safe(form.get("next")), result.cookie)
            : login(safe(form.get("next")), "Неверный логин или пароль.", 401);
        }
        if (url.pathname.startsWith("/api/site-admin/")) return accessApi(request, env, actor);
        if (!actor) {
          if (request.method !== "GET" && request.method !== "HEAD")
            return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
          return redirect(
            "/admin-login?next=" + encodeURIComponent(safe(url.pathname + url.search)),
          );
        }
        const isAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
        if (isAdmin && !can(actor, "admin.view"))
          return json({ ok: false, error: "PERMISSION_DENIED" }, 403);
        if (["/admin/qr-studio", "/admin/tickets"].includes(url.pathname) && !can(actor, "qr.read"))
          return json({ ok: false, error: "PERMISSION_DENIED" }, 403);
        // Stand accounts cannot invoke opaque server writes; those also retain their original MFA guards.
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && actor.role !== "owner") {
          await audit(env, actor, "access.denied", url.pathname);
          return json({ ok: false, error: "PERMISSION_DENIED" }, 403);
        }
        if (url.pathname === "/login" && !env.VNE_SUPABASE_URL && !env.SUPABASE_URL)
          return redirect(safe(url.searchParams.get("redirect") || "/member"));
        const forwarded = new Headers(request.headers);
        forwarded.delete("x-vne-site-admin-access");
        forwarded.set("x-vne-site-admin-access", can(actor, "admin.view") ? "allowed" : "denied");
        forwarded.delete("x-vne-site-preview");
        if (!env.VNE_SUPABASE_URL && !env.SUPABASE_URL) forwarded.set("x-vne-site-preview", "true");
        const response = await worker.fetch(new Request(request, { headers: forwarded }), env, ctx);
        const resultHeaders = new Headers(response.headers);
        for (const [k, v] of Object.entries(PRIVATE)) resultHeaders.set(k, v);
        if (response.headers.get("content-type")?.includes("text/html")) {
          if (isAdmin && request.method === "GET")
            await audit(env, actor, "view.page", url.pathname);
          const html = await response.text();
          resultHeaders.delete("content-length");
          resultHeaders.delete("content-encoding");
          const logoutForm =
            '<style>nav[aria-label="Служебные действия"]>div{padding-left:5.5rem;flex-wrap:wrap}</style><form method="post" action="/admin-logout" aria-label="Завершить сеанс" style="position:fixed;left:12px;bottom:max(0.5rem,env(safe-area-inset-bottom));z-index:40;margin:0"><button style="min-height:44px;padding:10px 12px;background:#070a09;color:#edf2ee;border:1px solid #454945;font:14px Onest,system-ui;cursor:pointer">Выйти</button></form>';
          return new Response(html.replace("</body>", logoutForm + "</body>"), {
            status: response.status,
            headers: resultHeaders,
          });
        }
        return new Response(response.body, { status: response.status, headers: resultHeaders });
      } catch (error) {
        const tooLarge = error?.message === "BODY_TOO_LARGE";
        return json(
          {
            ok: false,
            error: tooLarge ? "BODY_TOO_LARGE" : "STORAGE_UNAVAILABLE",
            message: tooLarge
              ? "Запрос слишком большой."
              : "Вход временно недоступен. Повторите позже.",
          },
          tooLarge ? 413 : 503,
        );
      }
    },
  };
}
