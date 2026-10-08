import { cp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { buildPreviewPages } from "./test-preview-pages.mjs";
import { PRESENTATION_PATHS, DIAGNOSTICS_PATH } from "../unified-stand/config.mjs";
const unified = process.argv.includes("--unified");
const id = "appgprj_6ac605807bf88191b7f2d0b5a717505d";
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (manifest.project_id !== id) throw Error("Wrong TEST Site");
const expected = {
  incidentAction: "POST",
  getQrAdmissionAvailability: "GET",
  qrAdmissionRead: "GET",
  qrAdmissionCommand: "POST",
  getAuthAvailability: "GET",
  signIn: "POST",
  signOut: "POST",
  getQuestionnaireAvailability: "GET",
  submitOwnedMembershipQuestionnaire: "POST",
  getMyMembershipQuestionnaires: "GET",
  getMyQuestionnaireDraft: "GET",
  saveMyQuestionnaireDraft: "POST",
  getAdminMfaState: "GET",
  beginAdminMfaEnrollment: "POST",
  completeAdminMfaChallenge: "POST",
  getScannerMfaState: "GET",
  beginScannerMfaEnrollment: "POST",
  completeScannerMfaChallenge: "POST",
};
const server = ".output/server",
  files = await readdir(server),
  resolvers = files.filter(
    (n) => n.startsWith("__23tanstack-start-server-fn-resolver-") && n.endsWith(".mjs"),
  );
if (resolvers.length !== 1) throw Error("Resolver missing/ambiguous");
const text = await readFile(path.join(server, resolvers[0]), "utf8");
const functions = {},
  found = new Set();
for (const m of text.matchAll(
  /"([a-f0-9]+)":\s*\{\s*functionName: "(\w+)_createServerFn_handler"/g,
)) {
  const [, hash, name] = m;
  if (!expected[name] || found.has(name)) throw Error("Unexpected function: " + name);
  found.add(name);
  functions["/_serverFn/" + hash] = { name, method: expected[name] };
}
if ((text.match(/functionName: /g) ?? []).length !== found.size)
  throw Error("Unparsed resolver entry");
if (found.size !== Object.keys(expected).length)
  throw Error("Missing allowlisted functions: " + JSON.stringify([...found]));
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await cp(server, "dist/server", { recursive: true });
await cp(".output/public", "dist/client", { recursive: true });
await writeFile(
  "dist/client/_headers",
  "/*\n  Cache-Control: private, no-store\n  X-Robots-Tag: noindex, nofollow\n",
);
await build({
  entryPoints: ["day07-stand/guard.mjs"],
  outfile: "dist/server/day07-guard.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2022",
});
const assets = [];
async function walk(dir, prefix = "") {
  for (const x of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix + "/" + x.name;
    if (x.isDirectory()) await walk(path.join(dir, x.name), rel);
    else if (
      /^\/(assets|fonts|brand\/wordmark|media|loading)\/[A-Za-z0-9_./-]+\.(js|css|woff2?|ttf|otf|png|svg|webp|avif)$/.test(
        rel,
      )
    )
      assets.push(rel);
  }
}
await walk("dist/client");
await writeFile(
  "dist/server/day07-allowlist.json",
  JSON.stringify({ projectId: id, functions, assets, unified }, null, 2),
);
const { pages: previews, sources: previewSources } = await buildPreviewPages();
await writeFile("dist/server/test-previews.mjs", `export default ${JSON.stringify(previews)};\n`);
await writeFile(
  ".sites-runtime/test-preview-sources.json",
  JSON.stringify(previewSources, null, 2),
);
await writeFile(
  "dist/server/index.js",
  `import worker from './index.mjs';import guard from './day07-guard.mjs';import previews from './test-previews.mjs';export default guard(worker,{...${JSON.stringify({ projectId: id, functions, assets, unified })},previews});\n`,
);
await writeFile("dist/.openai/hosting.json", JSON.stringify({ project_id: id }, null, 2) + "\n");
await writeFile(
  ".sites-runtime/day07-allowlist.json",
  JSON.stringify({ projectId: id, functions, assets, unified }, null, 2),
);
// Deploy output contains runtime code/static assets only. No migration or D1 schema payload.
async function checkArtifact(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (/^(migrations?|schema|d1)$/i.test(entry.name)) throw Error("Database artifact forbidden");
      await checkArtifact(path.join(dir, entry.name));
    } else if (/\.sql$/i.test(entry.name)) throw Error("SQL artifact forbidden");
  }
}
await checkArtifact("dist");
console.log(
  JSON.stringify({
    functions,
    pages: [
      ...(unified ? [...PRESENTATION_PATHS, DIAGNOSTICS_PATH] : []),
      "/",
      "/login",
      "/apply",
      "/member",
      "/member/pass",
      "/member/qr",
      "/admin",
      "/admin/tickets",
      "/admin/violations",
      "/admin/intakes",
      "/scan",
      "/admin/mfa",
      "/scanner/mfa",
    ],
    staticAssetCount: assets.length,
    syntheticPreviewPaths: Object.keys(previews),
  }),
);
