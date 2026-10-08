import { database } from "../tests/site-access-fixture.mjs";
// Run against the packaged Worker with synthetic credentials and no backend/network.
// This checks SSR and the outer gate; it does not substitute for browser QA.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../dist/server/index.js";

for (const key of ["VNE_SUPABASE_URL", "SUPABASE_URL", "VNE_PASS_SERVICE_URL"]) {
  assert.ok(!process.env[key], "Build smoke must run without a backend configuration");
}
globalThis.fetch = async () => {
  throw new Error("Network is disabled in build smoke");
};
const origin = "https://vne.example.test";
const { DB, sql } = database();
const env = {
  DB,
  VNE_REVIEW_PASSWORD: "synthetic-review-password",
  VNE_ADMIN_USERNAME: "synthetic-admin",
  VNE_ADMIN_PASSWORD: "synthetic-build-password",
  VNE_ADMIN_SESSION_SECRET: "synthetic-build-secret-1234567890",
  VNE_DELIVERY_MODE: "disabled",
};
const context = { waitUntil() {} };
const loginPage = await worker.fetch(new Request(origin + "/admin-login"), env, context);
const loginHtml = await loginPage.text();
assert.equal(loginPage.status, 200);
assert.match(loginHtml, /data-gate-loading hidden/);
assert.match(loginHtml, /loading\/wormhole.css/);
assert.match(loginHtml, /loading\/gate.js/);
assert.match(loginHtml, /vne-loading-brand[^>]*role="img"[^>]*aria-label="ВНЕ"/);
assert.ok(
  loginHtml.indexOf('class="vne-loading-brand"') < loginHtml.indexOf('class="vne-wormhole"'),
);
assert.match(loginHtml, /id="vne-loading-defaults"/);
assert.match(loginHtml, /--loading-blur:12.5px/);
assert.match(loginHtml, /form method="post" action="\/admin-login"/);
assert.match(loginPage.headers.get("content-security-policy"), /frame-ancestors 'none'/);
assert.match(await readFile("dist/client/loading/wormhole.css", "utf8"), /backdrop-filter: blur/);
assert.match(await readFile("dist/client/loading/gate.js", "utf8"), /pageshow/);
const anonymous = await worker.fetch(new Request(origin + "/admin/tickets"), env, context);
assert.equal(anonymous.status, 303);
assert.ok(anonymous.headers.get("location").startsWith("/admin-login"));
const login = await worker.fetch(
  new Request(origin + "/admin-login", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({
      username: env.VNE_ADMIN_USERNAME,
      password: env.VNE_ADMIN_PASSWORD,
      next: "/admin/tickets",
    }),
  }),
  env,
  context,
);
assert.equal(login.status, 303);
const cookie = login.headers.get("set-cookie").split(";")[0];
const results = [];
for (const route of [
  "/",
  "/events",
  "/events/light-study-01",
  "/events/threshold-study-02",
  "/about",
  "/rules",
  "/faq",
  "/contact",
  "/apply",
  "/apply?event=light-study-01",
  "/member",
  "/member?event=light-study-01",
  "/cookies",
  "/admin",
  "/admin/tickets",
  "/admin/qr-studio",
  "/admin/qr-studio?template=marble",
  "/admin/tickets?view=preview&template=enamel",
  "/admin/events",
  "/admin/applications",
  "/admin/orders",
  "/admin?section=accounts",
  "/admin?section=team",
  "/admin?section=content",
  "/admin?section=operations",
  "/admin?section=overview",
  "/admin?section=motion",
  "/admin/tickets?view=preview&template=marble&access=GENERAL",
  "/admin/tickets?view=preview&template=marble&access=VIP",
  "/admin/tickets?view=preview&template=marble&access=SECURITY",
  "/admin/tickets?view=preview&template=marble&access=ARTIST",
  "/admin/qr-studio?access=VIP",
  "/admin?section=requests",
  "/pass",
  "/scan",
]) {
  const response = await worker.fetch(
    new Request(origin + route, { headers: { Cookie: cookie } }),
    env,
    context,
  );
  const html = await response.text();
  assert.equal(response.status, 200, route);
  assert.match(response.headers.get("content-type"), /text\/html/, route);
  assert.match(html, /ВНЕ/, route);
  assert.doesNotMatch(html, /SSR_ERROR|Internal Server Error/, route);
  if (route.startsWith("/apply")) {
    assert.match(html, /id="vne-questionnaire"/);
    assert.match(html, /Ввести анкетные данные самостоятельно/);
    assert.equal((html.match(/class="vne-questionnaire-card"/g) || []).length, 7);
    assert.match(html, /Что помогает тебе довериться человеку/);
    assert.equal((html.match(/class="vne-wave-range"/g) || []).length, 3);
    assert.match(html, /Сколько общения тебе хочется этой ночью/);
    assert.match(html, /Какой ритм вечера тебе ближе/);
    assert.match(html, /Насколько тебе комфортна спонтанность/);
    assert.match(html, /Указать возраст/);
    assert.match(html, /до 3 ответов в сумме/);
    assert.match(html, /Заполни все вопросы/);
  }
  if (route.startsWith("/member")) {
    assert.match(html, /Твои заявки, ответы и настройки профиля/);
    assert.match(html, /Мои заявки/);
    assert.match(html, /Профиль и вход/);
    assert.match(html, /Тестовый режим/);
    assert.doesNotMatch(html, /Личное пространство готовится|Кабинет недоступен/);
  }
  assert.match(
    html,
    /data-site-loading="true"|data-site-loading=""/,
    route + " SSR loading overlay",
  );
  assert.match(html, /data-bootstrap="true"/, route + " safe bootstrap fallback");
  assert.match(
    html,
    /\[data-site-loading\]\{display:none!important\}/,
    route + " no-JS content remains visible",
  );
  assert.match(html, /loading\/wormhole.css/, route + " shared loader stylesheet");
  assert.equal(response.headers.get("cache-control"), "private, no-store", route);
  if (route.startsWith("/events/")) {
    assert.ok(html.includes(`data-event-background="${route.split("/").at(-1)}"`));
    assert.match(
      html,
      /data-motion="static"/,
      "SSR has deterministic reduced-motion-safe background",
    );
    assert.match(html, /Демо \/ не анонс/);
    assert.match(html, /Заявка на событие — войти/);
  }
  if (["/", "/events", "/about", "/cookies"].includes(route)) {
    assert.match(html, /class="vne-navbar"/, route + " shared navigation");
    assert.match(html, /aria-label="Открыть меню"/, route + " menu trigger");
    assert.match(html, /aria-haspopup="dialog"/, route + " accessible menu");
    assert.match(html, /wordmark-flow-light.svg/, route + " original brand asset");
    assert.match(html, /Настройки cookies/, route + " reopen cookie notice");
    assert.doesNotMatch(
      html,
      /class="vne-cookie-notice"/,
      "SSR does not flash a notice before reading the stored choice",
    );
  }
  if (route === "/cookies") {
    assert.match(html, /Чтобы сохранить выбранный режим/, "existing cookie wording");
    assert.match(html, /Открыть уведомление cookies/, "working entry to notice");
    assert.doesNotMatch(
      html,
      /редакционным заполнителем/,
      "cookie details replace the placeholder",
    );
  }
  if (route === "/admin?section=motion") {
    assert.match(html, /id="navbar-settings"/);
    assert.match(html, /Плотность на главной/);
    for (const label of [
      "Фоны событий",
      "Световая сессия 01",
      "Порог: эскиз 02",
      "Скорость",
      "Свечение",
      "Направление",
      "Сбросить фон события",
      "Загрузка сайта",
      "Туннель",
      "Пульсация",
      "Орбита",
      "Статичный",
      "Выключен",
      "Сбросить загрузчик",
      "Предложить продолжить через",
    ])
      assert.ok(html.includes(label), label);
  }
  if (route.includes("&access=")) {
    const access = new URL(origin + route).searchParams.get("access");
    assert.ok(html.includes(`data-ticket-type="${access}"`));
    assert.ok(html.includes(`data-qr-palette="${access}"`));
    assert.ok(html.includes(`marble-${access.toLowerCase()}.webp`));
  }
  if (route === "/admin/qr-studio?access=VIP") {
    assert.equal((html.match(/data-pass-type="VIP"/g) || []).length, 16);
    assert.match(html, /marble-vip.webp/);
  }
  if (route === "/admin/tickets") {
    assert.match(html, /Выдача ещё не подключена/);
    assert.match(html, /Выпустить билет/);
    assert.match(html, /Основание выдачи/);
    assert.match(html, /Посмотреть QR/);
  }

  if (route === "/admin/qr-studio") {
    assert.match(html, /Коллекция макетов/);
    for (const label of [
      "Сцепление",
      "Синкопа",
      "Диалог",
      "Встречный поток",
      "Внутренний круг",
      "Тихий сдвиг",
      "Рёбра",
      "Складки",
      "Эмаль",
      "Рельеф",
      "Базальт",
      "Порталы",
      "Плетение",
      "Оригами",
      "Созвездие",
      "Мрамор",
    ])
      assert.ok(html.includes(label), label);
    assert.equal((html.match(/data-template=/g) || []).length, 16);
    assert.match(html, /На карточке/);
  }
  if (route === "/admin/qr-studio?template=marble") {
    assert.match(html, /Проверьте перед экспортом/);
    assert.match(html, /Сохранить в библиотеку/);
    assert.match(html, /Посмотреть на карточке/);
  }
  if (route === "/admin/tickets?view=preview&template=enamel") {
    assert.match(html, /Эмаль/);
    assert.match(html, /data-side="back"/);
    assert.match(html, /Изменить QR в студии/);
    assert.doesNotMatch(html, /Выпустить билет|Основание выдачи/);
  }
  if (route.startsWith("/admin")) {
    const nav = html.match(/<nav aria-label="Разделы админки">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav, route + " missing shared admin menu");
    assert.match(html, /Актуализировать настройки/, route);
    const unavailable = ["team", "orders"].some(
      (key) => route.includes("section=" + key) || route === "/admin/" + key,
    );
    assert.equal((nav.match(/aria-current="page"/g) || []).length, unavailable ? 0 : 1, route);
    assert.equal((nav.match(/<li/g) || []).length, 12, route);
    assert.match(html, /На сайт/, route + " return to website");
    for (const label of [
      "Учётные записи",
      "Анимация",
      "Билеты",
      "QR-студия",
      "Мероприятия",
      "Заявки",
      "Заказы",
      "Членство",
      "Команда",
      "Контент",
      "Операции",
      "Обзор",
    ])
      assert.ok(nav.includes(label), route + " missing " + label);
  }
  if (["/admin?section=requests", "/admin/applications"].includes(route)) {
    assert.match(html, /data-request-kind=/, "Prepared queue replaces unavailable placeholder");
    assert.match(html, /История|Тестовая очередь/, "Queue presentation");
    assert.doesNotMatch(html, /Раздел ещё не заполнен/, "Requests are enabled");
  }
  results.push({ route, status: response.status, htmlBytes: Buffer.byteLength(html) });
}
const reviewLogin = await worker.fetch(
  new Request(origin + "/admin-login", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({ username: "testrev1", password: env.VNE_REVIEW_PASSWORD }),
  }),
  env,
  context,
);
assert.equal(reviewLogin.status, 303);
const reviewCookie = reviewLogin.headers.get("set-cookie").split(";")[0];
for (const route of [
  "/admin",
  "/admin/qr-studio",
  "/admin/tickets?view=preview&template=marble",
  "/admin?section=accounts",
  "/admin?section=requests",
  "/admin/applications",
]) {
  const response = await worker.fetch(
    new Request(origin + route, { headers: { cookie: reviewCookie } }),
    env,
    context,
  );
  assert.equal(response.status, 200, "reviewer " + route);
  assert.doesNotMatch(await response.text(), /SSR_ERROR|Internal Server Error/);
}
const reviewerSession = await worker.fetch(
  new Request(origin + "/api/site-admin/session", { headers: { cookie: reviewCookie } }),
  env,
  context,
);
assert.equal((await reviewerSession.json()).actor.username, "testrev1");
const reviewerWrite = await worker.fetch(
  new Request(origin + "/api/qr-studio/patterns", {
    method: "POST",
    headers: { cookie: reviewCookie, origin, "Content-Type": "application/json" },
    body: "{}",
  }),
  env,
  context,
);
assert.equal(reviewerWrite.status, 403);
const requestApi = (path, actorCookie, payload) =>
  worker.fetch(
    new Request(origin + "/api/site-admin/requests" + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: { cookie: actorCookie, origin, "content-type": "application/json" },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }),
    env,
    context,
  );
assert.equal((await (await requestApi("/config", cookie)).json()).enabled, true);
const requestId = crypto.randomUUID();
const requestPayload = {
  action: "create",
  kind: "membership",
  id: requestId,
  name: "Synthetic guest",
  email: "guest@example.com",
  telegram: "test_guest",
  details: "Build smoke only",
};
assert.equal((await requestApi("", cookie, requestPayload)).status, 200);
const queueRead = await requestApi("?id=" + requestId, reviewCookie);
assert.equal(queueRead.status, 200);
assert.equal((await queueRead.json()).item.name, "Synthetic guest");
assert.equal(
  (await requestApi("", reviewCookie, { ...requestPayload, id: crypto.randomUUID() })).status,
  403,
);
const defaultsRead = await worker.fetch(
  new Request(origin + "/api/site-admin/defaults", { headers: { cookie: reviewCookie } }),
  env,
  context,
);
assert.equal(defaultsRead.status, 200);
const initialDefaults = await defaultsRead.json();
const defaultsBody = JSON.stringify({
  expectedVersion: initialDefaults.version,
  groups: ["reveal"],
  settings: { ...initialDefaults.settings, duration: 0.8 },
});
assert.equal(
  (
    await worker.fetch(
      new Request(origin + "/api/site-admin/defaults", {
        method: "POST",
        headers: { cookie: reviewCookie, origin, "Content-Type": "application/json" },
        body: defaultsBody,
      }),
      env,
      context,
    )
  ).status,
  403,
);
assert.equal(
  (
    await worker.fetch(
      new Request(origin + "/api/site-admin/defaults", {
        method: "POST",
        headers: { cookie, origin, "Content-Type": "application/json" },
        body: defaultsBody,
      }),
      env,
      context,
    )
  ).status,
  200,
);
const updatedDefaults = await worker.fetch(
  new Request(origin + "/api/site-admin/defaults", { headers: { cookie: reviewCookie } }),
  env,
  context,
);
assert.equal((await updatedDefaults.json()).settings.duration, 0.8);
const viewerId = "synthetic-site-viewer";
env.DB.prepare(
  "INSERT INTO site_accounts (id, username, display_name, password_hash, created_at) SELECT ?, ?, ?, password_hash, created_at FROM site_accounts WHERE id = 'site-owner'",
)
  .bind(viewerId, "site-viewer", "Site viewer")
  .run();
env.DB.prepare(
  "INSERT INTO staff_assignments (account_id, role, permissions) VALUES (?, 'custom', '[]')",
)
  .bind(viewerId)
  .run();
const viewerLogin = await worker.fetch(
  new Request(origin + "/admin-login", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({ username: "site-viewer", password: env.VNE_ADMIN_PASSWORD }),
  }),
  env,
  context,
);
const viewerCookie = viewerLogin.headers.get("set-cookie").split(";")[0];
assert.equal(
  (
    await worker.fetch(
      new Request(origin + "/admin", {
        headers: { cookie: viewerCookie, "x-vne-site-admin-access": "allowed" },
      }),
      env,
      context,
    )
  ).status,
  403,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      network: "disabled",
      backend: "unconfigured",
      browser: "NOT VERIFIED",
      routes: results,
    },
    null,
    2,
  ),
);

sql.close();
