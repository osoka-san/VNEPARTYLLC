/** Build/serve an isolated actual-React browser fixture. No live backend imports or requests.
 * node tests/day07/timed-qa-browser.mjs /tmp/day07-browser-fixture [--serve]
 * Optional VNE_QA_PORT sets the localhost port (default 4188).
 * Open index.html through HTTP, select a mock scenario, then use the actual QA controls.
 * Screenshots and layout observations from this fixture do not prove live backend acceptance.
 */
import { build } from "esbuild";
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const out = resolve(process.argv[2] || "/tmp/day07-browser-fixture");
await mkdir(out, { recursive: true });
const mocks = {
  "@tanstack/react-start": "export const useServerFn = fn => fn;",
  "@/lib/admission/admission.functions":
    "export const qrAdmissionCommand = ({data}) => window.__qaTransport.command(data);",
  "@/lib/auth/scanner-mfa.functions":
    "export const getScannerMfaState = () => window.__qaTransport.mfa();",
};
await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
    import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client';
    import {TimedQaScanner} from './src/components/admission/TimedQaScanner';
    import {QA_ACTORS,QA_EVENT} from './src/lib/admission/timed-qa-core';
    const scenario=new URLSearchParams(location.search).get('scenario')||'success';
    const counters=document.querySelector('#counters'); let commands=0,mfas=0;
    const update=()=>{counters.textContent='Mock MFA: '+mfas+' · Mock QR requests: '+commands+' · Scenario: '+scenario;};update();
    let resolveMfa,resolveCommand;
    document.querySelector('#resolve-mfa').onclick=()=>resolveMfa?.({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});
    document.querySelector('#resolve-command').onclick=()=>resolveCommand?.();
    document.querySelector('#hide').onclick=()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));};
    document.querySelector('#show').onclick=()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));};
    document.querySelector('#next-time').onclick=()=>{document.querySelector('#clock').textContent=new Date(Date.now()+100000).toISOString();};
    window.__qaTransport={
      mfa:async()=>{mfas++;update();if(scenario==='mfa-wait')return new Promise(r=>resolveMfa=r);return scenario==='mfa-fail'?{ok:false,reason:'forbidden'}:{ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true};},
      command:async c=>{commands++;update();if(scenario==='closed')return {ok:false,reason:'unavailable'};
        const response={ok:true,qrText:null,events:[],secretUnavailable:true,replayed:false,receipt:{operationId:null,correlationId:crypto.randomUUID(),action:c.action,outcome:'invalid_token',eventId:QA_EVENT,participationId:null,passId:null,generation:null,version:null,actorId:QA_ACTORS[0],at:new Date().toISOString(),simulated:true,reentryAllowed:false}};
        if(scenario==='in-flight'&&c.token==='DAY07_REHEARSAL_PROBE')return new Promise(r=>resolveCommand=()=>r(response));return response;
      }
    };
    document.querySelector('#window').textContent=new Date(Date.now()-60000).toISOString();
    createRoot(document.querySelector('#root')).render(<StrictMode><TimedQaScanner/></StrictMode>);
  `,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: join(out, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "only-mocked-transport",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(@tanstack\/react-start|@\/lib\/(admission\/admission.functions|auth\/scanner-mfa.functions))$/,
          },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({ contents: mocks[a.path] }));
      },
    },
  ],
});
await copyFile("node_modules/tailwindcss/preflight.css", join(out, "preflight.css"));
await copyFile("public/fonts/Onest-Variable.woff2", join(out, "Onest.woff2"));
await copyFile("public/fonts/Unbounded-Variable.woff2", join(out, "Unbounded.woff2"));
await writeFile(
  join(out, "index.html"),
  `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:"><title>Day07 isolated UI fixture</title><link rel="stylesheet" href="/preflight.css"><link rel="stylesheet" href="/fixture.css"><style>@font-face{font-family:Onest;src:url('/Onest.woff2')}@font-face{font-family:Unbounded;src:url('/Unbounded.woff2')}body{margin:0;background:#090e0b;color:#edf2ee;font-family:Onest,Arial,sans-serif}.fixture{padding:16px;background:#26372c;font-size:13px}.fixture button,.fixture a{display:inline-block;border:1px solid #b5c0b9;padding:8px;margin:4px;background:#18231d;color:#edf2ee}.fixture p{margin:8px 0}.fixture code{user-select:all;overflow-wrap:anywhere}</style></head><body><aside class="fixture"><strong>ISOLATED MOCK FIXTURE · No live Auth/API/DB</strong><p id="counters"></p><nav><a href="/?scenario=success">Normal probes</a><a href="/?scenario=mfa-wait">Pending MFA</a><a href="/?scenario=mfa-fail">MFA refused</a><a href="/?scenario=closed">Closed backend</a><a href="/?scenario=in-flight">Pending rehearsal</a></nav><p>Run UUID: <code>10000000-0000-4000-8000-000000000001</code><br>Window UTC: <code id="window"></code></p><button id="resolve-mfa">Resolve mock MFA</button><button id="resolve-command">Resolve mock QR</button><button id="hide">Simulate hidden</button><button id="show">Simulate visible</button><button id="next-time">Make UTC +100 seconds</button><code id="clock"></code></aside><main id="root"></main><script src="/fixture.js"></script></body></html>`,
);
const sources = [
  "src/components/admission/TimedQaScanner.tsx",
  "src/components/admission/TimedQaScanner.css",
  "src/lib/admission/timed-qa-core.ts",
];
const manifest = {
  createdAt: new Date().toISOString(),
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  mode: "isolated-mocked-react-fixture",
  browserAcceptance: "NOT_RUN",
  sources: {},
};
for (const file of sources)
  manifest.sources[file] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Fixture built:", out);
if (process.argv.includes("--serve")) {
  const allowed = new Set([
    "index.html",
    "preflight.css",
    "fixture.css",
    "fixture.js",
    "Onest.woff2",
    "Unbounded.woff2",
    "manifest.json",
  ]);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "text/javascript",
    ".woff2": "font/woff2",
    ".json": "application/json",
  };
  const server = createServer(async (req, res) => {
    const name = new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
    if (req.method !== "GET" || !allowed.has(name)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(join(out, name));
      res.setHeader("Content-Type", types[name.slice(name.lastIndexOf("."))]);
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(Number(process.env.VNE_QA_PORT || 4188), "127.0.0.1", () =>
    console.log("Local fixture URL:", `http://127.0.0.1:${server.address().port}/`),
  );
}
