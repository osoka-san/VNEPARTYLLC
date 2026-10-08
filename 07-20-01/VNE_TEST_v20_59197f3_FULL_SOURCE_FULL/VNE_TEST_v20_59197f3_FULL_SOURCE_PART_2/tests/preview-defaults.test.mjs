import assert from "node:assert/strict";
import { build } from "esbuild";
import gate from "../scripts/auth/admin-gate.mjs";
import { testEnv } from "./site-access-fixture.mjs";
async function moduleFrom(file) {
  const r = await build({
    entryPoints: [file],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64")
  );
}
const { settingsApi } = await moduleFrom("scripts/auth/settings-api.ts");
const { PREVIEW_GROUPS, mergePreviewGroups, changedPreviewGroups } = await moduleFrom(
  "src/lib/preview-defaults.ts",
);
const {
  defaultMotionSettings,
  sanitizeMotionSettings,
  parseImportedSettings,
  exportMotionSettings,
  matchPreset,
  motionPresets,
} = await moduleFrom("src/lib/motion-settings.ts");
const firstEvent = "light-study-01",
  secondEvent = "threshold-study-02";
assert.notDeepEqual(
  defaultMotionSettings.eventBackgrounds[firstEvent],
  defaultMotionSettings.eventBackgrounds[secondEvent],
);
const legacy = { ...defaultMotionSettings };
delete legacy.eventBackgrounds;
delete legacy.loading;
assert.deepEqual(
  sanitizeMotionSettings(legacy).loading,
  defaultMotionSettings.loading,
  "legacy settings acquire neon loading defaults",
);
const oldLoading = sanitizeMotionSettings({ loading: { showBrand: false, size: 62 } }).loading;
assert.equal(oldLoading.size, 62, "Existing loader settings survive new percent controls");
assert.equal(oldLoading.showBrand, false);
assert.equal(oldLoading.showPercent, true, "Older stored settings show the new percent indicator");
assert.equal(
  oldLoading.percentScale,
  0.65,
  "Older settings receive the 35% smaller percent default",
);
assert.equal(oldLoading.percentGap, 14);
assert.deepEqual(
  sanitizeMotionSettings(legacy).eventBackgrounds,
  defaultMotionSettings.eventBackgrounds,
  "old saved defaults acquire both event palettes",
);
const eventEdit = {
  ...defaultMotionSettings,
  eventBackgrounds: {
    ...defaultMotionSettings.eventBackgrounds,
    [firstEvent]: {
      ...defaultMotionSettings.eventBackgrounds[firstEvent],
      speed: 1.6,
      color: "#00aabb",
    },
  },
};
assert.deepEqual(
  parseImportedSettings(exportMotionSettings(eventEdit), defaultMotionSettings).settings,
  eventEdit,
);
const partialImport = parseImportedSettings(
  JSON.stringify({ eventBackgrounds: { [firstEvent]: { glow: 12 } } }),
  eventEdit,
);
assert.equal(partialImport.settings.eventBackgrounds[firstEvent].speed, 1.6);
assert.equal(partialImport.settings.eventBackgrounds[firstEvent].glow, 12);
assert.deepEqual(
  partialImport.settings.eventBackgrounds[secondEvent],
  defaultMotionSettings.eventBackgrounds[secondEvent],
);
const invalidEvent = sanitizeMotionSettings({
  ...eventEdit,
  eventBackgrounds: {
    [firstEvent]: {
      color: "url(https://example.test)",
      speed: 100,
      density: -50,
      direction: "sideways",
    },
  },
});
assert.equal(
  invalidEvent.eventBackgrounds[firstEvent].color,
  defaultMotionSettings.eventBackgrounds[firstEvent].color,
);
assert.equal(invalidEvent.eventBackgrounds[firstEvent].speed, 2);
assert.equal(invalidEvent.eventBackgrounds[firstEvent].density, 12);
for (const [key, preset] of Object.entries(motionPresets))
  assert.equal(
    matchPreset(sanitizeMotionSettings(preset.values)),
    key,
    "nested event settings match presets",
  );
assert.ok(
  Object.values(motionPresets.off.values.eventBackgrounds).every((config) => !config.animated),
);
assert.deepEqual(
  PREVIEW_GROUPS.flatMap((g) => g.keys).sort(),
  Object.keys(defaultMotionSettings).sort(),
  "every setting belongs to exactly one group",
);
const current = {
  ...defaultMotionSettings,
  duration: 0.6,
  textDuration: 1.4,
  magneticStrength: 0.5,
};
assert.deepEqual(changedPreviewGroups(current, defaultMotionSettings), [
  "reveal",
  "text",
  "pointer",
]);
const partial = mergePreviewGroups(defaultMotionSettings, current, ["text"]);
assert.equal(partial.duration, defaultMotionSettings.duration);
assert.equal(partial.textDuration, 1.4);
assert.equal(partial.magneticStrength, defaultMotionSettings.magneticStrength);
const env = testEnv(),
  origin = "https://vne.test",
  app = gate({ fetch: () => new Response("ok") });
const loginPage = await app.fetch(new Request(origin + "/admin-login"), env, {});
assert.match(loginPage.headers.get("content-security-policy"), /img-src 'self'/);
const loginHtml = await loginPage.text();
assert.ok(
  loginHtml.indexOf('class="vne-loading-brand"') < loginHtml.indexOf('class="vne-wormhole"'),
  "The original masked wordmark is above the native gate's wormhole",
);
assert.doesNotMatch(loginHtml, /class="vne-loading-brand">ВНЕ/);
async function login(username, password) {
  const r = await app.fetch(
    new Request(origin + "/admin-login", {
      method: "POST",
      headers: { origin },
      body: new URLSearchParams({ username, password }),
    }),
    env,
    {},
  );
  assert.equal(r.status, 303);
  return r.headers.get("set-cookie").split(";")[0];
}
const admin = await login("synthetic-admin", env.VNE_ADMIN_PASSWORD),
  review = await login("testrev1", env.VNE_REVIEW_PASSWORD);
const req = (cookie, payload, extra = {}) =>
  new Request(origin + "/api/site-admin/defaults", {
    method: payload ? "POST" : "GET",
    headers: { cookie, origin, "Content-Type": "application/json", ...extra },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
const get = async (cookie) => {
  const r = await settingsApi(req(cookie), env);
  assert.equal(r.status, 200);
  return r.json();
};
assert.equal((await settingsApi(req(""), env)).status, 401);
const initial = await get(review);
assert.equal(initial.version, 0);
const patch = { expectedVersion: 0, groups: ["text"], settings: current };
assert.equal((await settingsApi(req(review, patch), env)).status, 403);
assert.equal(
  (await settingsApi(req(admin, patch, { origin: "https://evil.test" }), env)).status,
  403,
);
assert.equal(
  (await settingsApi(req(admin, { ...patch, groups: ["nonexistent"] }), env)).status,
  400,
);
assert.equal(
  (await settingsApi(req(admin, { ...patch, settings: { textDuration: 1.4 } }), env)).status,
  400,
);
assert.equal((await settingsApi(req(admin, patch), env)).status, 200);
const saved = await get(review);
assert.equal(saved.version, 1);
assert.equal(saved.settings.textDuration, 1.4);
assert.equal(saved.settings.duration, defaultMotionSettings.duration);
assert.equal(saved.settings.magneticStrength, defaultMotionSettings.magneticStrength);
// A second user's new preview and an explicit refresh read the same persisted version.
assert.deepEqual(
  (await get(await login("testrev1", env.VNE_REVIEW_PASSWORD))).settings,
  saved.settings,
);
assert.equal((await settingsApi(req(admin, patch), env)).status, 409);
const all = { expectedVersion: 1, groups: PREVIEW_GROUPS.map((g) => g.id), settings: current };
const race = await Promise.all([
  settingsApi(req(admin, all), env),
  settingsApi(req(admin, { ...all, settings: { ...current, duration: 0.7 } }), env),
]);
assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
const published = await get(review);
assert.equal(published.version, 2);
assert.ok([0.6, 0.7].includes(published.settings.duration));
assert.equal(published.settings.magneticStrength, 0.5);
assert.equal(
  env.sql.prepare("SELECT COUNT(*) n FROM site_audit WHERE action='settings.published'").get().n,
  2,
  "conflicting saves produce no false audit",
);
// A selected event-background group changes neither unrelated motion nor the other event.
const eventPatch = { expectedVersion: 2, groups: ["event-backgrounds"], settings: eventEdit };
assert.equal((await settingsApi(req(review, eventPatch), env)).status, 403);
assert.equal((await settingsApi(req(admin, eventPatch), env)).status, 200);
const eventSaved = await get(review);
assert.equal(eventSaved.settings.eventBackgrounds[firstEvent].speed, 1.6);
assert.deepEqual(
  eventSaved.settings.eventBackgrounds[secondEvent],
  defaultMotionSettings.eventBackgrounds[secondEvent],
);
assert.equal(eventSaved.settings.duration, published.settings.duration);
assert.equal(eventSaved.settings.textDuration, published.settings.textDuration);
assert.deepEqual(changedPreviewGroups(eventEdit, defaultMotionSettings), ["event-backgrounds"]);
const loadingEdit = {
  ...eventSaved.settings,
  loading: {
    ...defaultMotionSettings.loading,
    mode: "orbit",
    mint: "#00ffcc",
    blur: 20,
    showDelay: 500,
    speed: 1.5,
    showPercent: false,
    percentScale: 0.4,
    percentGap: 0,
  },
};
assert.deepEqual(
  parseImportedSettings(exportMotionSettings(loadingEdit), defaultMotionSettings).settings,
  loadingEdit,
);
const loaderPartial = parseImportedSettings(
  JSON.stringify({ loading: { darkness: 0.6 } }),
  loadingEdit,
);
assert.equal(loaderPartial.settings.loading.darkness, 0.6);
assert.equal(loaderPartial.settings.loading.showPercent, false);
assert.equal(loaderPartial.settings.loading.percentScale, 0.4);
assert.equal(loaderPartial.settings.loading.percentGap, 0);
assert.equal(
  loaderPartial.settings.loading.blur,
  20,
  "partial import preserves other loading settings",
);
const loadingPatch = { expectedVersion: 3, groups: ["loading"], settings: loadingEdit };
assert.equal((await settingsApi(req(review, loadingPatch), env)).status, 403);
assert.equal((await settingsApi(req(admin, loadingPatch), env)).status, 200);
const loadingSaved = await get(review);
assert.deepEqual(loadingSaved.settings.loading, loadingEdit.loading);
assert.equal(loadingSaved.settings.loading.showPercent, false, "False persists across sessions");
assert.equal(loadingSaved.settings.loading.percentGap, 0, "Zero gap persists across sessions");
assert.deepEqual(loadingSaved.settings.eventBackgrounds, eventSaved.settings.eventBackgrounds);
assert.equal(loadingSaved.settings.textDuration, eventSaved.settings.textDuration);
assert.deepEqual(changedPreviewGroups(loadingEdit, eventSaved.settings), ["loading"]);
const unsafeLoading = sanitizeMotionSettings({
  loading: {
    mode: "<script>",
    mint: "url(https://example.test)",
    blur: Infinity,
    size: -100,
    ringCount: 999,
    speed: 0,
    slowAfter: 0,
    showPercent: "false",
    percentScale: 999,
    percentGap: -100,
  },
}).loading;
assert.equal(unsafeLoading.mode, "wormhole");
assert.equal(unsafeLoading.mint, defaultMotionSettings.loading.mint);
assert.equal(unsafeLoading.blur, 17.5);
assert.equal(unsafeLoading.size, 24);
assert.equal(unsafeLoading.ringCount, 16);
assert.equal(unsafeLoading.speed, 0.25);
assert.equal(unsafeLoading.slowAfter, 5000);
assert.equal(unsafeLoading.showPercent, true, "Strings cannot masquerade as a boolean setting");
assert.equal(unsafeLoading.percentScale, 1.5);
assert.equal(unsafeLoading.percentGap, 0);
assert.equal(sanitizeMotionSettings({ loading: { percentScale: -1 } }).loading.percentScale, 0.35);
assert.equal(sanitizeMotionSettings({ loading: { percentGap: 100 } }).loading.percentGap, 48);
assert.equal(sanitizeMotionSettings({ loading: { percentScale: NaN } }).loading.percentScale, 0.65);
assert.equal(motionPresets.off.values.loading.mode, "static");
const navbarEdit = {
  ...loadingSaved.settings,
  navbar: {
    ...loadingSaved.settings.navbar,
    accent: "blue",
    width: 1280,
    radius: 0,
    blur: 0,
    showInvite: false,
    showMember: false,
    inviteLabel: "Присоединиться",
  },
};
const navbarPatch = {
  expectedVersion: loadingSaved.version,
  groups: ["navbar"],
  settings: navbarEdit,
};
assert.equal((await settingsApi(req(review, navbarPatch), env)).status, 403);
assert.equal((await settingsApi(req(admin, navbarPatch), env)).status, 200);
const navbarSaved = await get(review);
assert.deepEqual(navbarSaved.settings.navbar, navbarEdit.navbar);
assert.deepEqual(navbarSaved.settings.loading, loadingSaved.settings.loading);
assert.deepEqual(changedPreviewGroups(navbarEdit, loadingSaved.settings), ["navbar"]);
assert.deepEqual(
  parseImportedSettings(exportMotionSettings(navbarEdit), defaultMotionSettings).settings.navbar,
  navbarEdit.navbar,
);
assert.equal(
  parseImportedSettings(JSON.stringify({ navbar: { width: 1200 } }), navbarEdit).settings.navbar
    .showInvite,
  false,
);
const unsafeNavbar = sanitizeMotionSettings({
  navbar: {
    accent: "url(https://invalid.test)",
    width: 9999,
    height: -100,
    radius: NaN,
    blur: -10,
    showMember: "false",
    inviteLabel: " ",
  },
}).navbar;
assert.equal(unsafeNavbar.accent, "orange");
assert.equal(unsafeNavbar.width, 1440);
assert.equal(unsafeNavbar.height, 52);
assert.equal(unsafeNavbar.radius, 9);
assert.equal(unsafeNavbar.blur, 0);
assert.equal(unsafeNavbar.showMember, true);
assert.equal(unsafeNavbar.inviteLabel, "Приглашение");
const { default: withLoadingPresentation, loadingBootstrapMarkup } = await moduleFrom(
  "scripts/auth/loading-presentation.ts",
);
const presentationWorker = withLoadingPresentation({
  fetch: async () =>
    new Response("<html><head></head><body>Страница</body></html>", {
      headers: { "Content-Type": "text/html" },
    }),
});
const firstPaint = await presentationWorker.fetch(new Request(origin + "/admin-login"), env, {});
const firstPaintHtml = await firstPaint.text();
assert.match(firstPaintHtml, /--loader-animation:vne-wormhole-orbit/);
assert.match(firstPaintHtml, /--loading-blur:20px/);
assert.match(firstPaintHtml, /--loading-percent-display:none/);
assert.match(firstPaintHtml, /--loading-percent-scale:0.4/);
assert.match(firstPaintHtml, /--loading-percent-gap:0px/);
const embedded = JSON.parse(firstPaintHtml.match(/id="vne-loading-defaults">(.*?)<\/script>/)[1]);
assert.deepEqual(
  embedded,
  loadingSaved.settings.loading,
  "saved defaults reach first HTML before hydration and without a login",
);
assert.equal(firstPaint.headers.get("cache-control"), "private, no-store");
assert.doesNotMatch(
  loadingBootstrapMarkup({
    mint: "</style><img src=x onerror=alert(1)>",
    mode: "</script>",
    password: "not-public",
  }),
  /onerror|not-public/,
);
const failedStorage = await presentationWorker.fetch(
  new Request(origin),
  {
    DB: {
      prepare() {
        throw new Error("offline");
      },
    },
  },
  {},
);
assert.match(
  await failedStorage.text(),
  /--loading-blur:17.5px/,
  "optional presentation storage failure preserves page",
);
console.log(
  JSON.stringify({
    status: "PASS",
    settings: Object.keys(defaultMotionSettings).length,
    groups: PREVIEW_GROUPS.length,
    checks:
      "coverage, partial merge, admin-only write, reviewer refresh, cross-session persistence, CSRF, validation, concurrent update, audit",
    network: "disabled",
  }),
);
env.sql.close();
