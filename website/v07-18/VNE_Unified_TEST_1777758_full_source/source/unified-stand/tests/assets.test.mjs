import test from "node:test";
import assert from "node:assert/strict";
import { serveUnifiedAsset } from "../assets.mjs";
const make = (path = "/assets/app.js", method = "GET") =>
  new Request("https://test.invalid" + path, { method });
for (const method of ["GET", "HEAD"]) {
  test(`${method} missing or throwing binding fails closed without a response body leak`, async () => {
    for (const ASSETS of [
      undefined,
      {},
      { fetch: null },
      {
        fetch: async () => {
          throw new Error("private details");
        },
      },
    ]) {
      const r = await serveUnifiedAsset(make(undefined, method), { ASSETS });
      assert.equal(r.status, 503);
      assert.equal(r.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.equal(await r.text(), method === "HEAD" ? "" : "Static asset unavailable");
    }
  });
  for (const [status, type, location] of [
    [200, "text/html", false],
    [200, "Text/Html; charset=utf-8", false],
    [404, "text/javascript", false],
    [500, "text/plain", false],
    [302, "text/javascript", true],
    [200, "text/css", false],
    [200, "text/javascript", true],
  ]) {
    test(`${method} rejects asset ${status}/${type}/redirect=${location}`, async () => {
      const r = await serveUnifiedAsset(make(undefined, method), {
        ASSETS: {
          fetch: async () =>
            new Response("<html>private SSR</html>", {
              status,
              headers: {
                "content-type": type,
                "set-cookie": "private=value",
                ...(location ? { location: "/login" } : {}),
              },
            }),
        },
      });
      assert.equal(r.status, 404);
      assert.equal(r.headers.get("set-cookie"), null);
      assert.equal(r.headers.get("location"), null);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      assert.equal(r.headers.get("cache-control"), "private, no-store");
      assert.equal(await r.text(), method === "HEAD" ? "" : "Static asset unavailable");
    });
  }
  test(`${method} allows only matching successful emitted-file content type`, async () => {
    for (const [path, type] of [
      ["/assets/app.js", "text/javascript"],
      ["/loading/app.css", "text/css"],
      ["/media/art.avif", "image/avif"],
      ["/fonts/core.woff2", "font/woff2"],
      ["/brand/wordmark/a.svg", "image/svg+xml"],
    ]) {
      const r = await serveUnifiedAsset(make(path, method), {
        ASSETS: {
          fetch: async () =>
            new Response("synthetic-asset", {
              headers: { "content-type": type, "set-cookie": "bad=value" },
            }),
        },
      });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("set-cookie"), null);
      assert.equal(await r.text(), method === "HEAD" ? "" : "synthetic-asset");
    }
  });
}
