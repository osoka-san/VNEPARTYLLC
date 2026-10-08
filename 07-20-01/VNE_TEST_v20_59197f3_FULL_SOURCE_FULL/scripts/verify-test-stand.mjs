import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ORIGIN, TEST_SUPABASE } from "../test-stand/guard.mjs";
const env = {
  VNE_TEST_VARIANT: "questionnaire-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: TEST_ORIGIN,
  VNE_SUPABASE_URL: TEST_SUPABASE,
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_public_key",
};
Object.assign(process.env, env);
let requests = [];
globalThis.fetch = async (req) => {
  requests.push(String(req));
  throw Error("Network disabled in synthetic TEST smoke");
};
const { default: worker } = await import("../dist/server/index.js");
const headers = { "oai-authenticated-user-id": "synthetic-platform-owner" },
  results = [];
for (const route of ["/login"]) {
  const response = await worker.fetch(new Request(TEST_ORIGIN + route, { headers }), env, {
    waitUntil() {},
  });
  const html = await response.text();
  assert.equal(response.status, 200, route + " " + html.slice(0, 150));
  assert.match(html, /ВНЕ/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  for (const forbidden of [
    "/api/site-admin",
    "/admin-login",
    "getMediaOverrides",
    "getMemberState",
    "signInWithTelegram",
  ])
    assert.ok(!html.includes(forbidden), forbidden);
  if (route === "/login") {
    assert.match(html, /type="password"/);
    assert.match(html, /method="post"/);
  }
  if (route === "/apply") {
    assert.match(html, /vne-questionnaire/);
    assert.match(html, /Согласен/);
  }
  if (route === "/member") assert.match(html, /Войдите в аккаунт/);
  results.push({ route, status: response.status, htmlBytes: html.length });
}
assert.equal(requests.length, 0, "Unexpected SSR backend fetch without session");
const config = JSON.parse(await readFile(".sites-runtime/test-allowlist.json", "utf8"));
for (const [path, fn] of Object.entries(config.functions))
  if (fn.name === "getAuthAvailability") {
    const r = await worker.fetch(
      new Request(TEST_ORIGIN + path, {
        headers: {
          ...headers,
          "x-tsr-serverFn": "true",
          origin: TEST_ORIGIN,
          "sec-fetch-site": "same-origin",
        },
      }),
      env,
      { waitUntil() {} },
    );
    assert.equal(r.status, 200, fn.name);
    results.push({ function: fn.name, status: r.status });
  }
assert.equal(requests.length, 0);
for (const path of ["/apply", "/member"]) {
  const response = await worker.fetch(new Request(TEST_ORIGIN + path, { headers }), env, {
    waitUntil() {},
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/login");
  results.push({ route: path, status: response.status, unauthenticated: true });
}
console.log(
  JSON.stringify(
    {
      status: "PASS",
      network: "disabled",
      backend: "synthetic public config; no account session",
      browser: "NOT VERIFIED",
      results,
    },
    null,
    2,
  ),
);
