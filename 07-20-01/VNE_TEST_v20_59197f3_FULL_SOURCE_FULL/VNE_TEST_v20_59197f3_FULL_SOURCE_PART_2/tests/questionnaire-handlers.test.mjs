import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const calls = [];
const headers = new Map();
const owner = "a0000000-0000-4000-8000-000000000001";
const receipt = {
  requestId: "b0000000-0000-4000-8000-000000000001",
  ownerUserId: owner,
  correlationId: "c0000000-0000-4000-8000-000000000001",
  questionnaireVersion: 3,
  status: "pending",
  createdAt: "2026-10-06T12:00:00Z",
};
let response = [receipt];
let verified = true;
let rpcError = null;
globalThis.fetch = async () => {
  throw new Error("Network disabled in handler tests");
};
globalThis.__vneQuestionnaireTest = {
  request: new Request("https://vne.example.test/apply", {
    headers: { origin: "https://vne.example.test" },
  }),
  setHeader: (key, value) => headers.set(key, value),
  open() {
    calls.push("open");
    return {
      pending: [{ name: "refreshed", value: "synthetic", options: { path: "/", httpOnly: true } }],
      supabase: {
        auth: {
          getUser: async () => {
            calls.push("getUser");
            return { data: { user: verified ? { id: owner } : null }, error: null };
          },
        },
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: response, error: rpcError };
        },
      },
    };
  },
};

const result = await build({
  entryPoints: ["src/lib/questionnaire.functions.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "safe-handler-fixtures",
      setup(plugin) {
        plugin.onResolve({ filter: /^@tanstack\/react-start(?:\/server)?$/ }, ({ path }) => ({
          path,
          namespace: "fixture",
        }));
        plugin.onResolve({ filter: /^\.\/auth\/supabase\.server$/ }, () => ({
          path: "request-client",
          namespace: "fixture",
        }));
        plugin.onResolve({ filter: /^@supabase\/ssr$/ }, () => ({
          path: "cookies",
          namespace: "fixture",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: path.endsWith("/server")
            ? "export const getRequest=()=>globalThis.__vneQuestionnaireTest.request; export const setResponseHeader=(k,v)=>globalThis.__vneQuestionnaireTest.setHeader(k,v);"
            : path === "request-client"
              ? "export const createRequestClient=()=>globalThis.__vneQuestionnaireTest.open();"
              : path === "cookies"
                ? "export const serializeCookieHeader=(n,v)=>n+'='+v+'; HttpOnly';"
                : "export const createServerFn=()=>({inputValidator(){return this},handler(fn){return fn}});",
          loader: "js",
        }));
      },
    },
  ],
});
const handlers = await import(
  "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
);
const oldEnv = { ...process.env };
const controlled = [
  "VNE_SUPABASE_URL",
  "SUPABASE_URL",
  "VNE_SUPABASE_PUBLISHABLE_KEY",
  "VNE_SITE_URL",
  "VNE_AUTH_ENV",
  "VNE_MEMBERSHIP_QUESTIONNAIRE",
];
function setup(enabled = true) {
  for (const key of controlled) delete process.env[key];
  Object.assign(process.env, {
    VNE_SUPABASE_URL: "https://xrocuwlofxhxoxajukne.supabase.co",
    VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_only",
    VNE_SITE_URL: "https://vne.example.test",
    VNE_AUTH_ENV: "staging",
    ...(enabled ? { VNE_MEMBERSHIP_QUESTIONNAIRE: "test" } : {}),
  });
  calls.length = 0;
  headers.clear();
  verified = true;
  rpcError = null;
  response = [receipt];
  globalThis.__vneQuestionnaireTest.request = new Request("https://vne.example.test/apply", {
    headers: { origin: "https://vne.example.test" },
  });
}
process.on("exit", () => {
  for (const key of controlled) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
});

test("default-off handlers perform no Auth or RPC call and always mark private responses", async () => {
  setup(false);
  assert.deepEqual(await handlers.getQuestionnaireAvailability(), {
    configured: true,
    enabled: false,
  });
  assert.deepEqual(await handlers.getMyMembershipQuestionnaires(), {
    ok: false,
    reason: "unconfigured",
  });
  assert.deepEqual(await handlers.submitOwnedMembershipQuestionnaire({ data: {} }), {
    ok: false,
    reason: "unconfigured",
  });
  assert.deepEqual(calls, []);
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  assert.equal(headers.get("Vary"), "Cookie");
});

test("foreign or absent origin rejected before opening request client", async () => {
  setup();
  for (const origin of ["https://evil.example", null]) {
    globalThis.__vneQuestionnaireTest.request = new Request("https://vne.example.test/apply", {
      headers: origin ? { origin } : {},
    });
    assert.deepEqual(await handlers.submitOwnedMembershipQuestionnaire({ data: {} }), {
      ok: false,
      reason: "invalid",
    });
  }
  assert.deepEqual(calls, []);
});

test("oversized/malformed payload rejected before Auth/database access", async () => {
  setup();
  for (const data of [undefined, { huge: "x".repeat(32769) }])
    assert.deepEqual(await handlers.submitOwnedMembershipQuestionnaire({ data }), {
      ok: false,
      reason: "invalid",
    });
  assert.deepEqual(calls, []);
});

test("own list is projected, private and refresh cookies survive success", async () => {
  setup();
  response = [{ ...receipt, staffNotes: "must not escape" }];
  assert.deepEqual(await handlers.getMyMembershipQuestionnaires(), { ok: true, items: [receipt] });
  assert.deepEqual(calls, [
    "open",
    "getUser",
    { name: "vne_read_my_membership_questionnaires", args: { _request: null } },
  ]);
  assert.deepEqual(headers.get("Set-Cookie"), ["refreshed=synthetic; HttpOnly"]);
});

test("foreign-owner DB response is rejected rather than cached or exposed", async () => {
  setup();
  response = [{ ...receipt, ownerUserId: "someone-else" }];
  assert.deepEqual(await handlers.getMyMembershipQuestionnaires(), {
    ok: false,
    reason: "unavailable",
  });
});

test("invalid session and RPC error keep refreshed cookies and do not fake an empty list", async () => {
  setup();
  verified = false;
  assert.deepEqual(await handlers.getMyMembershipQuestionnaires(), { ok: false, reason: "signin" });
  assert.deepEqual(calls, ["open", "getUser"]);
  assert.ok(headers.has("Set-Cookie"));
  setup();
  rpcError = { code: "42501", details: "private original answers" };
  assert.deepEqual(await handlers.getMyMembershipQuestionnaires(), {
    ok: false,
    reason: "unavailable",
  });
  assert.ok(headers.has("Set-Cookie"));
});
