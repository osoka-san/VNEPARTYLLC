import { database } from "../site-access-fixture.mjs";
// Real SQLite, actual Worker handler, synthetic sessions; no network or shared DB.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import gate from "../../scripts/auth/admin-gate.mjs";
const bundle = await build({
  entryPoints: ["scripts/qr-studio/library-api.ts"],
  bundle: true,
  platform: "neutral",
  mainFields: ["module", "main"],
  format: "esm",
  write: false,
});
const { libraryApi } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { DB, sql } = database();
const origin = "https://vne.test";
const env = {
  DB,
  VNE_REVIEW_PASSWORD: "synthetic-review-password",
  VNE_ADMIN_PASSWORD: "synthetic-api-password",
  VNE_ADMIN_SESSION_SECRET: "synthetic-api-secret-123456789012345",
};
const session = async () => {
  const res = await gate({ fetch: () => new Response("OK") }).fetch(
    new Request(origin + "/admin-login", {
      method: "POST",
      headers: { origin },
      body: new URLSearchParams({
        username: "admin",
        password: env.VNE_ADMIN_PASSWORD,
        next: "/admin/qr-studio",
      }),
    }),
    env,
    {},
  );
  assert.equal(res.status, 303);
  return res.headers.get("set-cookie").split(";")[0];
};
const cookie = await session(),
  secondCookie = await session();
const req = (method = "GET", payload, headers = {}, query = "") =>
  new Request(origin + "/api/qr-studio/patterns" + query, {
    method,
    headers: { cookie, origin, "content-type": "application/json", ...headers },
    ...(payload === undefined
      ? {}
      : { body: typeof payload === "string" ? payload : JSON.stringify(payload) }),
  });
const call = async (request, context = env) => {
  const r = await libraryApi(request, context);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  return { status: r.status, body: await r.json() };
};
let checks = 0;
async function expect(request, status, code, context = env) {
  const r = await call(request, context);
  assert.equal(r.status, status, JSON.stringify(r.body));
  if (code) assert.equal(r.body.error, code);
  checks++;
  return r.body;
}
const pattern = {
  schema: 1,
  name: "Лес / тест",
  event: "НОЧЬ",
  geometry: "flow",
  palette: "mint",
  rounding: 0.36,
  accents: true,
};
const make = (p = {}) => ({
  id: crypto.randomUUID(),
  expectedVersion: 0,
  operationId: crypto.randomUUID(),
  pattern,
  archived: false,
  engineVersion: "vne-glyphs-0.5.0",
  ...p,
});
await expect(req("GET", undefined, { cookie: "" }), 401, "AUTH_REQUIRED");
await expect(req("GET", undefined, { cookie: cookie + "x" }), 401, "AUTH_REQUIRED");
await expect(req("POST", make(), { origin: "https://other.test" }), 403, "ORIGIN_REJECTED");
await expect(req("GET", undefined, { "sec-fetch-site": "cross-site" }), 403, "ORIGIN_REJECTED");
await expect(req("DELETE"), 405, "METHOD_NOT_ALLOWED");
for (const k of [
  "VNE_SUPABASE_URL",
  "VNE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "VNE_AUTH_ENV",
])
  await expect(req(), 503, "STAFF_GUARD_REQUIRED", { ...env, [k]: "configured" });
process.env.VNE_AUTH_ENV = "production";
await expect(req(), 503, "STAFF_GUARD_REQUIRED");
delete process.env.VNE_AUTH_ENV;
await expect(req(), 503, "STORAGE_UNAVAILABLE", { ...env, DB: undefined });
await expect(req("POST", "{"), 400, "INVALID_INPUT");
await expect(req("POST", make({ payload: "must never persist" })), 400, "INVALID_INPUT");
await expect(
  req("POST", make({ pattern: { ...pattern, qrText: "secret" } })),
  400,
  "INVALID_INPUT",
);
await expect(
  req("POST", make({ pattern: { ...pattern, geometry: ["flow"] } })),
  400,
  "INVALID_INPUT",
);
await expect(req("POST", make({ expectedVersion: -1 })), 400, "INVALID_INPUT");
await expect(req("POST", "x".repeat(12001)), 413, "BODY_TOO_LARGE");
await expect(
  req("POST", make(), { "content-type": "text/plain" }),
  400,
  "UNSUPPORTED_CONTENT_TYPE",
);
const initial = make();
let result = await expect(req("POST", initial), 201);
assert.equal(result.item.version, 1);
await expect(req("POST", initial), 200);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM qr_pattern_versions").get().n, 1);
await expect(
  req("POST", { ...initial, pattern: { ...pattern, name: "changed" } }),
  409,
  "OPERATION_REUSED",
);
result = await expect(req("GET", undefined, { cookie: secondCookie }), 200);
assert.equal(result.items[0].id, initial.id);
result = await expect(req("GET", undefined, {}, "?q=" + encodeURIComponent("ночь")), 200);
assert.equal(result.items.length, 1);
const update = make({
  id: initial.id,
  expectedVersion: 1,
  pattern: { ...pattern, name: "Вторая" },
});
const race = await Promise.all([
  call(req("POST", update)),
  call(req("POST", make({ id: initial.id, expectedVersion: 1 }))),
]);
assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
checks++;
const archive = make({ id: initial.id, expectedVersion: 2, archived: true });
const repeat = await Promise.all([call(req("POST", archive)), call(req("POST", archive))]);
assert.deepEqual(repeat.map((r) => r.status).sort(), [200, 201]);
checks++;
result = await expect(req(), 200);
assert.equal(result.items.length, 0);
result = await expect(req("GET", undefined, {}, "?archived=1"), 200);
assert.equal(result.items[0].version, 3);
await expect(req("POST", make({ id: initial.id, expectedVersion: 3 })), 201);
result = await expect(req("GET", undefined, {}, "?id=" + initial.id), 200);
assert.deepEqual(
  result.items.map((i) => i.version),
  [4, 3, 2, 1],
);
assert.equal(result.items[3].pattern.name, pattern.name);
await expect(req("GET", undefined, {}, "?id=bad"), 400, "INVALID_INPUT");
await expect(req("GET", undefined, {}, "?page=-1"), 400, "INVALID_INPUT");
await expect(req("GET", undefined, {}, "?q=" + "a".repeat(101)), 400, "INVALID_INPUT");
for (let i = 0; i < 25; i++)
  await expect(req("POST", make({ pattern: { ...pattern, name: "Page " + i } })), 201);
result = await expect(req(), 200);
assert.equal(result.items.length, 24);
assert.equal(result.hasMore, true);
result = await expect(req("GET", undefined, {}, "?page=1"), 200);
assert.equal(result.items.length, 2);
assert.equal(result.hasMore, false);
assert.deepEqual(
  sql
    .prepare("PRAGMA table_info(qr_pattern_versions)")
    .all()
    .map((c) => c.name),
  [
    "pattern_id",
    "version",
    "recipe",
    "search_text",
    "engine_version",
    "archived",
    "created_at",
    "operation_id",
  ],
);
for (const template of [
  "coupling",
  "syncopa",
  "dialogue",
  "flow",
  "circle",
  "shift",
  "ribs",
  "folds",
  "enamel",
  "relief",
  "basalt",
  "portals",
  "weave",
  "origami",
  "constellation",
  "marble",
]) {
  const request = make({ pattern: { ...pattern, template } });
  await expect(req("POST", request), 201);
  const saved = await expect(req("GET", undefined, {}, "?id=" + request.id), 200);
  assert.equal(saved.items[0].pattern.template, template);
}
await expect(
  req("POST", make({ pattern: { ...pattern, template: "untrusted" } })),
  400,
  "INVALID_INPUT",
);

// Renderer IDs are explicit; creating the new Origami does not rewrite v0.5 recipes.
const newOrigami = make({
  pattern: { ...pattern, template: "origami" },
  engineVersion: "vne-origami-1.0.0",
});
const newOrigamiResult = await expect(req("POST", newOrigami), 201);
assert.equal(newOrigamiResult.item.engineVersion, "vne-origami-1.0.0");
const oldOrigami = make({ pattern: { ...pattern, template: "origami" } });
await expect(req("POST", oldOrigami), 201);
const archivedOldOrigami = await expect(
  req("POST", {
    ...oldOrigami,
    expectedVersion: 1,
    operationId: crypto.randomUUID(),
    archived: true,
  }),
  201,
);
assert.equal(archivedOldOrigami.item.engineVersion, "vne-glyphs-0.5.0");
await expect(
  req(
    "POST",
    make({ engineVersion: "vne-origami-1.0.0", pattern: { ...pattern, template: "basalt" } }),
  ),
  400,
  "INVALID_INPUT",
);
await expect(req("POST", make({ engineVersion: "untrusted-renderer" })), 400, "INVALID_INPUT");

// All six named engines can save/archive without changing their recipe or engine.
for (const template of ["basalt", "portals", "constellation", "folds", "weave"]) {
  const original = make({
    pattern: { ...pattern, template },
    engineVersion: `vne-${template}-1.0.0`,
  });
  const created = await expect(req("POST", original), 201);
  assert.equal(created.item.engineVersion, original.engineVersion);
  const archiveRequest = {
    ...original,
    expectedVersion: 1,
    operationId: crypto.randomUUID(),
    archived: true,
  };
  const archived = await expect(req("POST", archiveRequest), 201);
  assert.equal(archived.item.engineVersion, original.engineVersion);
  assert.deepEqual(archived.item.pattern, original.pattern);
  const replay = await expect(req("POST", archiveRequest), 200);
  assert.equal(replay.item.version, archived.item.version);
}

// A review session can list designs but never save or archive them.
const reviewLogin = await gate({ fetch: () => new Response("OK") }).fetch(
  new Request(origin + "/admin-login", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({ username: "testrev1", password: env.VNE_REVIEW_PASSWORD }),
  }),
  env,
  {},
);
const reviewCookie = reviewLogin.headers.get("set-cookie").split(";")[0];
await expect(req("GET", undefined, { cookie: reviewCookie }), 200);
await expect(req("POST", make(), { cookie: reviewCookie }), 403, "PERMISSION_DENIED");
await expect(
  req("POST", make({ archived: true }), { cookie: reviewCookie }),
  403,
  "PERMISSION_DENIED",
);

console.log(
  JSON.stringify({
    status: "PASS",
    checks,
    database: "real in-memory SQLite",
    sessions: 2,
    concurrency: "CAS and idempotent retry",
    network: "disabled",
  }),
);
sql.close();
