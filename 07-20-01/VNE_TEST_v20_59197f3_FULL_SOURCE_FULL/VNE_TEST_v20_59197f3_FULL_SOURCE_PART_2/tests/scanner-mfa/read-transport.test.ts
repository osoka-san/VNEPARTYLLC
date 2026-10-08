/** Real installed TanStack response parsing; mock HTTP only, no Auth/server network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { serverFnFetcher } from "../../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import { readScannerMfaState } from "../../src/lib/auth/scanner-mfa-read.ts";
const url = "https://isolated-day07.test/_serverFn/synthetic";
async function check(response: Response) {
  let calls = 0;
  const result = await readScannerMfaState(
    async (options) => {
      const wire = await runWithStartContext({ startOptions: {} }, () =>
        serverFnFetcher(url, [{ method: "GET", fetch: options.fetch }], () => {
          throw Error("unexpected fallback transport");
        }),
      );
      return wire.result;
    },
    async (input, init) => {
      calls++;
      assert.equal(input, url);
      assert.equal(init?.method, "GET");
      assert.equal(init?.body, undefined);
      return response;
    },
  );
  assert.equal(calls, 1);
  return result;
}
test("actual plain-text access refusals remain forbidden through TanStack", async () => {
  for (const status of [401, 403]) {
    assert.deepEqual(await check(new Response("TEST access unavailable", { status })), {
      ok: false,
      reason: "forbidden",
    });
  }
});
test("disabled route has a separate safe reason", async () => {
  for (const status of [404]) {
    assert.deepEqual(await check(new Response("TEST access unavailable", { status })), {
      ok: false,
      reason: "unconfigured",
    });
  }
});
test("other HTTP errors discard arbitrary bodies and successful-looking failure payloads", async () => {
  for (const response of [
    new Response("PRIVATE_ERROR_DO_NOT_DISPLAY", { status: 500 }),
    new Response("TEST access unavailable", { status: 503 }),
    Response.json({ result: { ok: true, secret: "NEVER_RETAIN" } }, { status: 500 }),
  ]) {
    assert.deepEqual(await check(response), { ok: false, reason: "unavailable" });
  }
});
test("successful GET keeps the actual status contract without extra requests", async () => {
  const state = {
    ok: true,
    userId: "1e7259c2-ad13-43a1-b34b-cba71533e844",
    aal2: false,
    hasVerifiedTotp: true,
  };
  assert.deepEqual(await check(Response.json({ result: state })), state);
});
test("network failure and rejected parsing project no raw exception", async () => {
  for (const message of ["SECRET_LIKE_NETWORK_DETAIL", "Unexpected token in PRIVATE response"]) {
    assert.deepEqual(
      await readScannerMfaState(async () => {
        throw Error(message);
      }),
      { ok: false, reason: "unavailable" },
    );
  }
});
