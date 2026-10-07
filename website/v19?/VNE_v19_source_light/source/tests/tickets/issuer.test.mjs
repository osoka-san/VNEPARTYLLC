import { build } from "esbuild";
import { strict as assert } from "node:assert";
const bundled = await build({
  entryPoints: ["supabase/functions/vne-ticket-issuer/handler.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { createIssuer, secretToken, sha256 } = await import(
  "data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const env = {
  SUPABASE_URL: "https://db.synthetic.invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ADMIN_KEY: "test-admin-key-".repeat(4),
  TOKEN_SECRET: "synthetic-token-secret-".repeat(4),
  TOKEN_KEY_VERSION: "k1",
  PUBLIC_ORIGIN: "https://site.synthetic.invalid",
};
const eventId = crypto.randomUUID(),
  operation = crypto.randomUUID(),
  jwt = "synthetic.jwt.signature";
let row = null,
  calls = [],
  readResult = null,
  scanResult = { outcome: "ready" },
  lastArgs;
const fetcher = async (url, init) => {
  calls.push({ url, init });
  const args = JSON.parse(init.body);
  lastArgs = args;
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  if (url.endsWith("/ticket_read")) {
    assert.equal(init.headers.Authorization, undefined);
    return Response.json(readResult);
  }
  assert.equal(init.headers.Authorization, "Bearer " + jwt);
  if (url.endsWith("/ticket_issue")) {
    const duplicate = !!row;
    if (!row)
      row = {
        id: args._id,
        name: "SYNTHETIC",
        access: "GENERAL",
        event: { id: eventId, title: "Test" },
        status: "active",
        generation: 1,
        tokenKeyVersion: "k1",
        qrEligible: true,
        version: 1,
      };
    return Response.json({ pass: row, duplicate });
  }
  if (url.endsWith("/ticket_scan")) return Response.json({ ...scanResult, pass: row });
  if (url.endsWith("/ticket_scan_catalog")) return Response.json({ events: [] });
  if (args._action === "list") return Response.json({ items: [row] });
  return Response.json({ pass: row });
};
const handle = createIssuer(env, fetcher);
const req = (path, body = {}, extra = {}) =>
  new Request("https://issuer.synthetic.invalid/functions/v1/vne-ticket-issuer" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + env.ADMIN_KEY,
      "X-VNE-User-JWT": jwt,
      "Idempotency-Key": operation,
      ...extra,
    },
    body: JSON.stringify(body),
  });
let count = 0;
async function test(name, work) {
  await work();
  count++;
  console.log("PASS " + name);
}
const body = { eventId, name: "SYNTHETIC", access: "GENERAL", reason: "synthetic test" };
let first;
await test("unknown route is rejected", async () =>
  assert.equal((await handle(req("/api/admin/delete"))).status, 404));
await test("configuration fails closed before DB", async () =>
  assert.equal((await createIssuer({}, fetcher)(req("/api/admin/issue", body))).status, 503));
await test("shared key alone is insufficient", async () => {
  const n = calls.length;
  assert.equal((await handle(req("/api/admin/issue", body, { "X-VNE-User-JWT": "" }))).status, 403);
  assert.equal(calls.length, n);
});
await test("user JWT alone is insufficient", async () =>
  assert.equal(
    (await handle(req("/api/admin/issue", body, { Authorization: "Bearer wrong" }))).status,
    401,
  ));
await test("issue returns distinct view and scan capabilities", async () => {
  const res = await handle(req("/api/admin/issue", body));
  assert.equal(res.status, 200);
  first = await res.json();
  assert.match(first.pass.qrText, /^VNE1:[A-Za-z0-9_-]{43}$/);
  const view = first.url.split("#")[1],
    scan = first.pass.qrText.slice(5);
  assert.notEqual(view, scan);
  assert.equal(lastArgs._view_hash, await sha256(view));
  assert.equal(lastArgs._scan_hash, await sha256(scan));
  assert.equal(first.pass.generation, undefined);
  assert.equal(first.pass.tokenKeyVersion, undefined);
  assert.equal(first.pass.qrEligible, undefined);
  assert.deepEqual(first.delivery, []);
});
await test("lost response retry derives original tokens from DB id", async () => {
  const again = await (await handle(req("/api/admin/issue", body))).json();
  assert.equal(again.duplicate, true);
  assert.equal(again.url, first.url);
  assert.equal(again.pass.qrText, first.pass.qrText);
});
await test("guest read works without staff headers", async () => {
  readResult = row;
  const r = await handle(
    req(
      "/api/pass/read",
      { token: first.url.split("#")[1] },
      { Authorization: "", "X-VNE-User-JWT": "" },
    ),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).pass.qrText, first.pass.qrText);
});
await test("before release no scan secret is returned", async () => {
  readResult = { ...row, qrEligible: false };
  const r = await (await handle(req("/api/pass/read", { token: first.url.split("#")[1] }))).json();
  assert.equal(r.pass.qrText, null);
});
await test("missing guest pass is404", async () => {
  readResult = null;
  assert.equal((await handle(req("/api/pass/read", { token: "x".repeat(43) }))).status, 404);
});
await test("list never exposes QR capabilities", async () => {
  const r = await (await handle(req("/api/admin/list", {}))).json();
  assert.equal(r.items[0].qrText, null);
  assert.equal(r.items[0].generation, undefined);
});
await test("verify cannot consume and hides raw QR", async () => {
  const r = await (
    await handle(req("/api/scan/verify", { eventId, token: "x".repeat(43) }))
  ).json();
  assert.equal(lastArgs._input.consume, false);
  assert.equal(r.pass.qrText, null);
});
await test("checkin carries version and idempotency", async () => {
  await handle(
    req("/api/scan/checkin", {
      eventId,
      token: "x".repeat(43),
      expectedVersion: 1,
      operationId: operation,
    }),
  );
  assert.equal(lastArgs._input.consume, true);
  assert.equal(lastArgs._input.operationId, operation);
});
await test("scanner can ask assigned event catalog", async () =>
  assert.equal((await handle(req("/api/scan/catalog", {}))).status, 200));
for (const [label, input] of [
  ["unknown field", { ...body, admin: true }],
  ["fake event", { ...body, eventId: "bad" }],
  ["missing reason", { ...body, reason: "" }],
  ["untrusted svg", { ...body, design: { svg: "<script/>" } }],
])
  await test("strict input: " + label, async () =>
    assert.equal((await handle(req("/api/admin/issue", input))).status, 400),
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
])
  await test("design template: " + template, async () => {
    const design = {
      engineVersion: "vne-glyphs-0.5.0",
      pattern: {
        schema: 1,
        name: "sample",
        event: "test",
        template,
        geometry: "flow",
        palette: "mint",
        rounding: 0.36,
        accents: true,
      },
    };
    const r = await handle(req("/api/admin/issue", { ...body, design }));
    assert.equal(r.status, 200);
    assert.equal(lastArgs._input.design.pattern.template, template);
  });
await test("untrusted design template rejected", async () => {
  const design = {
    engineVersion: "vne-glyphs-0.5.0",
    pattern: {
      schema: 1,
      name: "sample",
      event: "",
      template: "untrusted",
      geometry: "flow",
      palette: "mint",
      rounding: 0.36,
      accents: true,
    },
  };
  assert.equal((await handle(req("/api/admin/issue", { ...body, design }))).status, 400);
});
await test("invalid operation rejected", async () =>
  assert.equal(
    (await handle(req("/api/admin/issue", body, { "Idempotency-Key": "not-uuid" }))).status,
    400,
  ));
await test("stream body limit", async () =>
  assert.equal(
    (await handle(req("/api/admin/issue", { ...body, name: "a".repeat(17000) }))).status,
    413,
  ));
await test("database errors cannot leak tokens or SQL", async () => {
  const broken = createIssuer(env, async () =>
    Response.json({ message: "select secret password SQL" }, { status: 500 }),
  );
  const r = await broken(req("/api/admin/issue", body));
  assert.equal(r.status, 503);
  assert.equal(await r.text(), JSON.stringify({ error: "service_unavailable" }));
});
await test("database rejects revoked user JWT", async () => {
  const broken = createIssuer(env, async () =>
    Response.json({ message: "JWT expired" }, { status: 401 }),
  );
  assert.equal((await broken(req("/api/admin/issue", body))).status, 403);
});
await test("key version mismatch never produces wrong new token", async () => {
  row = { ...row, tokenKeyVersion: "old" };
  const r = await handle(req("/api/admin/get", { id: row.id }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "token_key_unavailable");
});
await test("purpose domain separation and determinism", async () => {
  const id = crypto.randomUUID();
  assert.equal(
    await secretToken(env.TOKEN_SECRET, "view", id, 1),
    await secretToken(env.TOKEN_SECRET, "view", id, 1),
  );
  assert.notEqual(
    await secretToken(env.TOKEN_SECRET, "scan", id, 1),
    await secretToken(env.TOKEN_SECRET, "view", id, 1),
  );
  assert.notEqual(
    await secretToken(env.TOKEN_SECRET, "scan", id, 1),
    await secretToken(env.TOKEN_SECRET, "scan", id, 2),
  );
});
console.log(JSON.stringify({ issuerTests: count, status: "PASS", remoteSupabase: "NOT VERIFIED" }));
