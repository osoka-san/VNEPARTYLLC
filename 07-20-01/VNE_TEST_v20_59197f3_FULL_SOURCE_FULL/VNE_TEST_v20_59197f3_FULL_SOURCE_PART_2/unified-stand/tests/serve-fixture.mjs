// Local visual fixture of the compiled Unified Worker. No real Auth/QR access.
// Synthetic ADMIN_TEST is injected only by this loopback fixture, never deploy output.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { QR_TEST_ACCOUNT_IDS } from "../../src/lib/admission/test-accounts.ts";
const origin = "https://vne-test-20261007.can-avci48.chatgpt.site";
const sb = "https://xrocuwlofxhxoxajukne.supabase.co";
const id = "02e03845-bc0d-4a9b-8500-87bb1f11ccf6";
const env = {
  VNE_QR_TEST_ACCOUNT_IDS: QR_TEST_ACCOUNT_IDS.join(","),
  VNE_QR_ADMISSION: "test-explicit-v2",
  VNE_TEST_VARIANT: "qr-admission-only",
  VNE_TEST_AUTH_MODE: "supabase-synthetic",
  VNE_AUTH_ENV: "staging",
  VNE_SITE_URL: origin,
  VNE_SUPABASE_URL: sb,
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
  VNE_DELIVERY_MODE: "disabled",
  VNE_INCIDENTS_MODE: "test",
  VNE_TEST_ADMIN_MFA: "enabled",
  VNE_TEST_SCANNER_MFA: "enabled",
};
Object.assign(process.env, env);
const user = {
  id,
  is_anonymous: false,
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic@example.invalid",
  factors: [],
};
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: id, exp: 4102444800, role: "authenticated", aal: "aal1" }),
    ).toString("base64url"),
    "c3ludGhldGlj",
  ].join("."),
  refresh_token: "synthetic-refresh-not-valid",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const cookie =
  "sb-xrocuwlofxhxoxajukne-auth-token=base64-" +
  Buffer.from(JSON.stringify(session)).toString("base64url");
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.origin === sb && u.pathname === "/auth/v1/user") return Response.json(user);
  throw Error("Local QA fixture blocks all external requests");
};
const { default: worker } = await import("../../dist/server/index.js");
const assets = new Set(
  JSON.parse(await readFile(".sites-runtime/day07-allowlist.json", "utf8")).assets,
);
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const readAsset = async (pathname) =>
  new Response(await readFile(path.join(process.cwd(), "dist/client", pathname)), {
    headers: { "Content-Type": mime[path.extname(pathname)] || "application/octet-stream" },
  });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end("Read-only synthetic fixture");
      return;
    }
    let response;
    if (assets.has(url.pathname)) response = await readAsset(url.pathname);
    else
      response = await worker.fetch(
        new Request(url, {
          method: req.method,
          headers: { ...req.headers, cookie, host: new URL(origin).host, origin },
        }),
        { ...env, ASSETS: { fetch: (r) => readAsset(new URL(r.url).pathname) } },
        { waitUntil() {} },
      );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Synthetic fixture failed");
  }
});
server.listen(4188, "127.0.0.1", () =>
  console.log("Synthetic read-only Unified TEST fixture: http://127.0.0.1:4188"),
);
