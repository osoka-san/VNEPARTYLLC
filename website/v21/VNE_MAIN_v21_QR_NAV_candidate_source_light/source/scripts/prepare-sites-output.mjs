// Adapt the existing Nitro Cloudflare build to Sites' archive layout.
// Application sources, dependencies, and the original build command stay unchanged.
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".output");
const dist = path.join(root, "dist");
const entry = path.join(output, "server/index.mjs");
if (!(await stat(entry)).isFile()) throw new Error("Run the original build first.");
const worker = await readFile(entry, "utf8");
if (!worker.includes("as default")) throw new Error("Expected an ESM Worker default export.");

await rm(path.join(dist, "server"), { recursive: true, force: true });
await rm(path.join(dist, "client"), { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(output, "server"), path.join(dist, "server"), { recursive: true });
await cp(path.join(output, "public"), path.join(dist, "client"), { recursive: true });
await cp(path.join(root, "scripts/auth/admin-gate.mjs"), path.join(dist, "server/admin-gate.mjs"));
await cp(
  path.join(root, "scripts/auth/site-access.mjs"),
  path.join(dist, "server/site-access.mjs"),
);
await build({
  entryPoints: [path.join(root, "scripts/qr-studio/library-api.ts")],
  outfile: path.join(dist, "server/qr-library.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2022",
});
await build({
  entryPoints: [path.join(root, "scripts/auth/public-pass.ts")],
  outfile: path.join(dist, "server/public-pass.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  alias: { "@": path.join(root, "src") },
});
await build({
  entryPoints: [path.join(root, "scripts/auth/settings-api.ts")],
  outfile: path.join(dist, "server/preview-defaults.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});
await build({
  entryPoints: [path.join(root, "scripts/auth/loading-presentation.ts")],
  outfile: path.join(dist, "server/loading-presentation.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});
await build({
  entryPoints: [path.join(root, "scripts/auth/requests-api.ts")],
  outfile: path.join(dist, "server/requests-api.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});
await mkdir(path.join(dist, ".openai"), { recursive: true });
await build({
  entryPoints: [path.join(root, "scripts/auth/member-api.ts")],
  outfile: path.join(dist, "server/member-api.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});
await cp(path.join(root, ".openai/hosting.json"), path.join(dist, ".openai/hosting.json"));
await cp(path.join(root, "drizzle"), path.join(dist, ".openai/drizzle"), { recursive: true });
await writeFile(
  path.join(dist, "server/index.js"),
  'import worker from "./index.mjs";\nimport gate from "./admin-gate.mjs";\nimport withLibrary from "./qr-library.mjs";\nimport withPublicPass from "./public-pass.mjs";\nimport withDefaults from "./preview-defaults.mjs";\nimport withLoadingPresentation from "./loading-presentation.mjs";\nimport withRequests from "./requests-api.mjs";\nimport withMember from "./member-api.mjs";\nexport default withLoadingPresentation(withPublicPass(withMember(withRequests(withDefaults(withLibrary(gate(worker))))),worker));\n',
);
console.log(
  JSON.stringify({ status: "ready", worker: "dist/server/index.js", assets: "dist/client" }),
);
