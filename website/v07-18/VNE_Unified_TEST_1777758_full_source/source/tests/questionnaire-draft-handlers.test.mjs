import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
const calls = [],
  headers = new Map();
const owner = randomUUID();
let response = null,
  verified = true,
  rpcError = null;
globalThis.fetch = async () => {
  throw Error("Network disabled in synthetic tests");
};
globalThis.__vneDraftTest = {
  request: new Request("https://vne.example.test/apply", {
    headers: { origin: "https://vne.example.test" },
  }),
  setHeader: (k, v) => headers.set(k, v),
  open() {
    calls.push("open");
    return {
      pending: [{ name: "refreshed", value: "synthetic", options: {} }],
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
const bundle = async (entry) => {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    plugins: [
      {
        name: "synthetic-only",
        setup(plugin) {
          plugin.onResolve({ filter: /^@tanstack\/react-start(?:\/server)?$/ }, ({ path }) => ({
            path,
            namespace: "fixture",
          }));
          plugin.onResolve({ filter: /^\.\/auth\/supabase\.server$/ }, () => ({
            path: "client",
            namespace: "fixture",
          }));
          plugin.onResolve({ filter: /^@supabase\/ssr$/ }, () => ({
            path: "cookies",
            namespace: "fixture",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path.endsWith("/server")
              ? "export const getRequest=()=>globalThis.__vneDraftTest.request;export const setResponseHeader=(k,v)=>globalThis.__vneDraftTest.setHeader(k,v);"
              : path === "client"
                ? "export const createRequestClient=()=>globalThis.__vneDraftTest.open();"
                : path === "cookies"
                  ? "export const serializeCookieHeader=(n,v)=>n+'='+v+'; HttpOnly';"
                  : "export const createServerFn=()=>({inputValidator(){return this},handler(fn){return fn}});",
            loader: "js",
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64")
  );
};
const handlers = await bundle("src/lib/questionnaire-draft.functions.ts");
const submission = await bundle("src/lib/questionnaire.functions.ts");
const { emptyDraftPayload } = await bundle("src/lib/questionnaire-draft.ts");
const controlled = [
  "VNE_SUPABASE_URL",
  "SUPABASE_URL",
  "VNE_SUPABASE_PUBLISHABLE_KEY",
  "VNE_SITE_URL",
  "VNE_AUTH_ENV",
  "VNE_MEMBERSHIP_QUESTIONNAIRE",
  "VNE_QUESTIONNAIRE_DRAFTS",
];
const original = { ...process.env };
function setup(enabled = true) {
  controlled.forEach((k) => delete process.env[k]);
  Object.assign(process.env, {
    VNE_SUPABASE_URL: "https://xrocuwlofxhxoxajukne.supabase.co",
    VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_only",
    VNE_SITE_URL: "https://vne.example.test",
    VNE_AUTH_ENV: "staging",
    VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
    ...(enabled ? { VNE_QUESTIONNAIRE_DRAFTS: "test" } : {}),
  });
  calls.length = 0;
  headers.clear();
  verified = true;
  rpcError = null;
  response = {
    ownerUserId: owner,
    creationIssuedAt: new Date().toISOString(),
    draft: null,
    submitted: false,
  };
  globalThis.__vneDraftTest.request = new Request("https://vne.example.test/apply", {
    headers: { origin: "https://vne.example.test" },
  });
}
process.on("exit", () =>
  controlled.forEach((k) => {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }),
);
const command = () => ({
  expectedOwnerUserId: owner,
  creationIssuedAt: new Date().toISOString(),
  id: randomUUID(),
  mutationId: randomUUID(),
  expectedVersion: 0,
  payload: emptyDraftPayload(),
});
test("draft rollout defaults off and makes no Auth/database call", async () => {
  setup(false);
  assert.deepEqual(await handlers.getMyQuestionnaireDraft(), { ok: false, reason: "unconfigured" });
  assert.deepEqual(await handlers.saveMyQuestionnaireDraft({ data: command() }), {
    ok: false,
    reason: "unconfigured",
  });
  assert.deepEqual(calls, []);
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  assert.equal(headers.get("Vary"), "Cookie");
});
test("foreign/absent origin and oversized body are rejected before Auth/RPC", async () => {
  setup();
  for (const origin of [null, "https://foreign.invalid"]) {
    globalThis.__vneDraftTest.request = new Request("https://vne.example.test/apply", {
      headers: origin ? { origin } : {},
    });
    assert.deepEqual(await handlers.saveMyQuestionnaireDraft({ data: command() }), {
      ok: false,
      reason: "invalid",
    });
  }
  setup();
  assert.deepEqual(await handlers.saveMyQuestionnaireDraft({ data: { huge: "x".repeat(32769) } }), {
    ok: false,
    reason: "invalid",
  });
  assert.deepEqual(calls, ["open"]);
});
test("read projects verified owner/draft with private headers and refresh cookies", async () => {
  setup();
  assert.deepEqual(await handlers.getMyQuestionnaireDraft(), { ok: true, ...response });
  assert.deepEqual(calls, [
    "open",
    "getUser",
    { name: "vne_read_my_questionnaire_draft", args: {} },
  ]);
  assert.deepEqual(headers.get("Set-Cookie"), ["refreshed=synthetic; HttpOnly"]);
});
test("save calls only exact owner-bound RPC; partial payload succeeds", async () => {
  setup();
  const data = command();
  data.payload.contact = "unfinished@";
  response = {
    ok: true,
    ownerUserId: owner,
    draft: {
      id: data.id,
      version: 1,
      payload: data.payload,
      savedAt: "2026-10-07T12:00:00.000Z",
      expiresAt: "2026-12-13T12:00:00.000Z",
    },
  };
  assert.deepEqual(await handlers.saveMyQuestionnaireDraft({ data }), response);
  assert.equal(calls.at(-1).name, "vne_save_my_questionnaire_draft");
  assert.deepEqual(calls.at(-1).args, { _command: data });
});
test("Auth/session rejection clears via signin and invalid payload is a definitive safe failure", async () => {
  setup();
  verified = false;
  assert.deepEqual(await handlers.getMyQuestionnaireDraft(), { ok: false, reason: "signin" });
  assert.deepEqual(calls, ["open", "getUser"]);
  setup();
  rpcError = { code: "42501", details: "RAW SENSITIVE CONTENT" };
  assert.deepEqual(await handlers.getMyQuestionnaireDraft(), { ok: false, reason: "signin" });
  assert.deepEqual(await handlers.saveMyQuestionnaireDraft({ data: command() }), {
    ok: false,
    reason: "signin",
  });
  rpcError = { code: "22023", details: "RAW SENSITIVE CONTENT" };
  assert.deepEqual(await handlers.saveMyQuestionnaireDraft({ data: command() }), {
    ok: false,
    reason: "invalid",
  });
});
test("enabled rollout cannot bypass finalizer by omitting or falsifying draftReference", async () => {
  setup();
  for (const data of [
    {},
    { draftReference: undefined },
    { draftReference: null },
    { draftReference: { id: randomUUID(), version: 0 } },
  ]) {
    assert.deepEqual(await submission.submitOwnedMembershipQuestionnaire({ data }), {
      ok: false,
      reason: "invalid",
    });
  }
  assert.ok(calls.every((v) => v === "open"));
});
