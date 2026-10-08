// The native packager always includes root drizzle/. Package this TEST-only
// build through the same native helper in a clean output-only staging directory.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const [helper, archive] = process.argv.slice(2);
if (!helper || !path.isAbsolute(helper) || !archive || !path.isAbsolute(archive))
  throw Error("Absolute native helper and archive required");
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (
  manifest.project_id !== "appgprj_6ac605807bf88191b7f2d0b5a717505d" ||
  manifest.d1 ||
  manifest.r2
)
  throw Error("Unexpected TEST binding");
const stage = path.resolve(".sites-runtime/test-package");
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, ".openai"), { recursive: true });
await cp(".openai/hosting.json", path.join(stage, ".openai/hosting.json"));
await cp("dist", path.join(stage, "dist"), { recursive: true });
const r = spawnSync("node", [helper, stage, archive], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
