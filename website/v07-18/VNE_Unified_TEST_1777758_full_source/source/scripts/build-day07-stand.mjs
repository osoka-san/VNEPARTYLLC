// Local, opt-in Day07 build. Uses the current reviewed TEST login implementation.
// No deployment, DB migration, account creation, or environment activation occurs here.
import { cp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PRESENTATION_ROUTES } from "../unified-stand/config.mjs";
const unified = process.argv.includes("--unified");
const root = process.cwd();
const stage = path.join(root, ".sites-runtime/day07-source");
const manifest = JSON.parse(await readFile(path.join(root, ".openai/hosting.json"), "utf8"));
if (manifest.project_id !== "appgprj_6ac605807bf88191b7f2d0b5a717505d")
  throw Error("Wrong TEST Site");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
for (const name of [
  "src",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "vite.config.ts",
])
  await cp(path.join(root, name), path.join(stage, name), { recursive: true });
await mkdir(path.join(stage, ".openai"), { recursive: true });
await writeFile(
  path.join(stage, ".openai/hosting.json"),
  JSON.stringify({ project_id: manifest.project_id }),
);
await mkdir(path.join(stage, "public"), { recursive: true });
await cp(
  path.join(root, unified ? "public" : "public/fonts"),
  path.join(stage, unified ? "public" : "public/fonts"),
  { recursive: true },
);
await symlink(path.join(root, "node_modules"), path.join(stage, "node_modules"), "dir");
await mkdir(path.join(stage, "test-stand"), { recursive: true });
await cp(path.join(root, "test-stand/routes"), path.join(stage, "test-stand/routes"), {
  recursive: true,
});
await cp(path.join(root, "day07-stand/routes"), path.join(stage, "test-stand/routes"), {
  recursive: true,
});
if (unified) {
  for (const file of PRESENTATION_ROUTES)
    await cp(path.join(root, "src/routes", file), path.join(stage, "test-stand/routes", file));
  await cp(path.join(root, "unified-stand/routes"), path.join(stage, "test-stand/routes"), {
    recursive: true,
  });
  await mkdir(path.join(stage, "src/unified"), { recursive: true });
  await cp(path.join(root, "unified-stand/config.mjs"), path.join(stage, "src/unified/config.mjs"));
  await cp(
    path.join(root, "unified-stand/config.d.mts"),
    path.join(stage, "src/unified/config.d.mts"),
  );
  await cp(
    path.join(root, "unified-stand/session-gate.ts"),
    path.join(stage, "src/unified/session-gate.ts"),
  );
  // Presentation uses the approved embedded copy only; no new public server functions.
  for (const file of ["about.tsx", "events.index.tsx"]) {
    const target = path.join(stage, "test-stand/routes", file);
    const text = await readFile(target, "utf8");
    await writeFile(
      target,
      text.replace(
        'import { getPublishedSections } from "@/lib/sections.functions";',
        "const getPublishedSections = async (_input: unknown): Promise<Record<string, {title: string; body: string}>> => ({});",
      ),
    );
  }
  const admin = path.join(stage, "test-stand/routes/admin.tsx");
  await writeFile(
    admin,
    (await readFile(admin, "utf8")).replace(
      '<ul className="space-y-3">',
      '<ul className="space-y-3"><li><a className="underline" href="/admin/diagnostics">Диагностика интерфейса</a></li>',
    ),
  );
  const login = path.join(stage, "test-stand/routes/login.tsx");
  await writeFile(
    login,
    (await readFile(login, "utf8"))
      .replaceAll(
        'search["next"] === "/admin/intakes"',
        'search["next"] === "/admin/intakes" || search["next"] === "/admin/diagnostics"',
      )
      .replaceAll(
        'next === "/admin/intakes"',
        'next === "/admin/intakes" || next === "/admin/diagnostics"',
      ),
  );
}
// The reviewed MFA repair is inherited above. Extend its variant gate only in this build copy.
const scannerFile = path.join(stage, "src/lib/auth/scanner-mfa.functions.ts");
let scanner = await readFile(scannerFile, "utf8");
const boundary = 'process.env["VNE_TEST_VARIANT"] !== "questionnaire-only"';
if (scanner.split(boundary).length !== 2)
  throw Error("Scanner variant boundary changed; review required");
scanner = scanner.replace(
  boundary,
  '(process.env["VNE_TEST_VARIANT"] !== "questionnaire-only" && !(process.env["VNE_TEST_VARIANT"] === "qr-admission-only" && process.env["VNE_QR_ADMISSION"] === "test-explicit-v2"))',
);
await writeFile(scannerFile, scanner);
const result = spawnSync(
  process.execPath,
  [path.join(root, "scripts/build-test-stand.mjs"), ...(unified ? ["--unified"] : [])],
  {
    cwd: stage,
    stdio: "inherit",
    env: { ...process.env },
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
await rm(path.join(root, ".output"), { recursive: true, force: true });
await cp(path.join(stage, ".output"), path.join(root, ".output"), { recursive: true });
await mkdir(path.join(root, ".output/public/brand/wordmark"), { recursive: true });
await cp(
  path.join(root, "public/brand/wordmark/wordmark-flow-light.svg"),
  path.join(root, ".output/public/brand/wordmark/wordmark-flow-light.svg"),
);
console.log("Local Day07 candidate build ready; remote activation remains separate");
