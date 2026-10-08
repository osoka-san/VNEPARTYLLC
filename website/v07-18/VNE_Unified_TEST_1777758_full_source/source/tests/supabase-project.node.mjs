// Offline regression checks: Node 24 type stripping; no SDK or live backend.
// Run: node --test tests/supabase-project.node.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const calls = [];
globalThis.__vneSupabaseTestCalls = calls;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@supabase/supabase-js") {
      const stub = `export function createClient(url, key, options) {
        const client = { url, key, options, from(table) { return { table }; } };
        globalThis.__vneSupabaseTestCalls.push(client);
        return client;
      }`;
      return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
    }
    if (specifier.endsWith("/supabase-project")) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { resolveSupabaseProject } = await import("../src/lib/supabase-project.ts");
const { readAuthConfig, CLOUD_DEFAULT_SITE_URL } = await import("../src/lib/auth/config.ts");
const cloud = {
  SUPABASE_URL: "https://cloud.example",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const explicit = {
  VNE_AUTH_ENV: "staging",
  VNE_SUPABASE_URL: "https://explicit.example",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_explicit_test",
  VNE_SITE_URL: "https://site.example",
};

for (const env of [{}, { VNE_SUPABASE_URL: " ", SUPABASE_URL: "\t" }]) {
  test(`no project fails closed: ${JSON.stringify(env)}`, () => {
    assert.deepEqual(resolveSupabaseProject(env), { enabled: false, reason: "not_configured" });
    assert.equal(readAuthConfig(env).enabled, false);
  });
}
test("Cloud mode keeps staging and default site URL", () => {
  assert.deepEqual(readAuthConfig(cloud), {
    enabled: true,
    env: "staging",
    url: cloud.SUPABASE_URL,
    publishableKey: cloud.SUPABASE_PUBLISHABLE_KEY,
    siteUrl: CLOUD_DEFAULT_SITE_URL,
  });
});
test("explicit mode keeps its credentials and requires its own site and environment", () => {
  assert.equal(readAuthConfig(explicit).enabled, true);
  assert.equal(readAuthConfig({ ...explicit, VNE_SITE_URL: undefined }).enabled, false);
  assert.equal(readAuthConfig({ ...explicit, VNE_AUTH_ENV: undefined }).enabled, false);
  const sameProject = { ...cloud, ...explicit, SUPABASE_URL: explicit.VNE_SUPABASE_URL };
  assert.equal(readAuthConfig(sameProject).publishableKey, explicit.VNE_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(
    readAuthConfig({ ...sameProject, VNE_SUPABASE_PUBLISHABLE_KEY: undefined }).enabled,
    false,
  );
});
for (const other of [
  "https://different.example",
  "http://explicit.example",
  "https://explicit.example:8443",
]) {
  test(`different project origin rejected: ${other}`, () => {
    const env = { ...explicit, SUPABASE_URL: other };
    assert.deepEqual(resolveSupabaseProject(env), { enabled: false, reason: "project_mismatch" });
    assert.deepEqual(readAuthConfig(env), { enabled: false, reason: "project_mismatch" });
  });
}
test("origin normalization matches existing Auth semantics", () => {
  assert.deepEqual(
    resolveSupabaseProject({
      VNE_SUPABASE_URL: " HTTPS://EXPLICIT.EXAMPLE:443/ ",
      SUPABASE_URL: "https://explicit.example",
    }),
    { enabled: true, mode: "explicit", url: "https://explicit.example" },
  );
  // Auth historically uses URL.origin, not an arbitrary path, query or fragment.
  assert.equal(
    resolveSupabaseProject({ VNE_SUPABASE_URL: "https://explicit.example/path?x=1#part" }).url,
    "https://explicit.example",
  );
});
for (const url of [
  "not-a-url",
  "data:text/plain,test",
  "file:///tmp/test",
  "blob:https://explicit.example/id",
  "ftp://localhost",
]) {
  test(`invalid/opaque origins rejected: ${url}`, () => {
    assert.deepEqual(resolveSupabaseProject({ ...explicit, SUPABASE_URL: url }), {
      enabled: false,
      reason: "invalid_url",
    });
    assert.deepEqual(resolveSupabaseProject({ VNE_SUPABASE_URL: url }), {
      enabled: false,
      reason: "invalid_url",
    });
    assert.equal(
      readAuthConfig({
        ...explicit,
        VNE_SUPABASE_URL: url,
        SUPABASE_URL: "https://explicit.example",
      }).enabled,
      false,
    );
  });
}
test("environment and public key guards remain intact", () => {
  assert.equal(readAuthConfig({ ...cloud, VNE_AUTH_ENV: "production" }).reason, "env_not_allowed");
  assert.equal(
    readAuthConfig({ ...explicit, VNE_AUTH_ENV: "production" }).reason,
    "env_not_allowed",
  );
  assert.equal(
    readAuthConfig({ ...cloud, SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }).enabled,
    false,
  );
  assert.equal(
    readAuthConfig({ ...explicit, VNE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }).enabled,
    false,
  );
  assert.equal(
    readAuthConfig({ ...explicit, VNE_SUPABASE_URL: "http://localhost:54321" }).reason,
    "insecure_url",
  );
  assert.equal(
    readAuthConfig({
      ...explicit,
      VNE_AUTH_ENV: "development",
      VNE_SUPABASE_URL: "http://localhost:54321",
    }).enabled,
    true,
  );
  assert.equal(
    readAuthConfig({
      ...explicit,
      VNE_AUTH_ENV: "development",
      VNE_SUPABASE_URL: "http://remote.example",
    }).enabled,
    false,
  );
});

test("actual admin proxy fails before SDK creation and revalidates cached clients", async () => {
  const keys = ["VNE_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const set = (env) => {
    for (const key of keys) {
      delete process.env[key];
      if (env[key] !== undefined) process.env[key] = env[key];
    }
  };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("Network forbidden in offline regression test");
  };
  try {
    const { supabaseAdmin } = await import("../src/integrations/supabase/client.server.ts");
    for (const env of [
      {},
      { VNE_SUPABASE_URL: "https://explicit.example", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      { SUPABASE_URL: "https://cloud.example" },
      {
        VNE_SUPABASE_URL: "https://explicit.example",
        SUPABASE_URL: "https://cloud.example",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      },
      {
        VNE_SUPABASE_URL: "invalid",
        SUPABASE_URL: "https://cloud.example",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      },
      {
        VNE_SUPABASE_URL: "blob:https://cloud.example/id",
        SUPABASE_URL: "https://cloud.example",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      },
      {
        SUPABASE_URL: "blob:https://cloud.example/id",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      },
    ]) {
      set(env);
      assert.throws(() => supabaseAdmin.from("membership_requests"));
      assert.equal(calls.length, 0, "invalid config must not instantiate privileged SDK");
    }
    const valid = {
      SUPABASE_URL: " HTTPS://CLOUD.EXAMPLE:443/ ",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    };
    set(valid);
    assert.deepEqual(supabaseAdmin.from("membership_requests"), { table: "membership_requests" });
    assert.equal(calls[0].url, "https://cloud.example");
    assert.equal(calls[0].key, "sb_secret_test");
    assert.equal(calls[0].options.auth.persistSession, false);
    assert.equal(calls[0].options.auth.autoRefreshToken, false);
    supabaseAdmin.from("membership_requests");
    assert.equal(calls.length, 1, "same config reuses cached SDK");
    set({ ...valid, VNE_SUPABASE_URL: "https://other.example" });
    assert.throws(() => supabaseAdmin.from("membership_requests"), /project_mismatch/);
    assert.equal(calls.length, 1, "mismatch cannot reuse or replace cached SDK");
    set({
      ...valid,
      SUPABASE_URL: "https://next.example",
      VNE_SUPABASE_URL: "https://next.example",
    });
    supabaseAdmin.from("membership_requests");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://next.example");
    set({
      SUPABASE_URL: "https://next.example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_rotated_test",
    });
    supabaseAdmin.from("membership_requests");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].key, "sb_secret_rotated_test");
    assert.equal(fetchCalls, 0);
  } finally {
    set(saved);
    globalThis.fetch = originalFetch;
    delete globalThis.__vneSupabaseTestCalls;
  }
});
