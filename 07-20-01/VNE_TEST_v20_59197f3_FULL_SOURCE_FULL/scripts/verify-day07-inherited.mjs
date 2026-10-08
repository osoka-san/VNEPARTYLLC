// Run the existing reviewed TEST regressions against the locally built Day07 variant.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { QR_TEST_ACCOUNT_IDS } from "../src/lib/admission/test-accounts.ts";
await mkdir(".sites-runtime", { recursive: true });
for (const name of [
  "verify-test-stand",
  "verify-admin-mfa-transport",
  "verify-scanner-mfa-transport",
  "verify-test-session-lifecycle",
  "verify-admin-login-return",
]) {
  let source = await readFile(`scripts/${name}.mjs`, "utf8");
  if (!source.includes('VNE_TEST_VARIANT: "questionnaire-only"'))
    throw Error("Inherited test variant boundary changed: " + name);
  source = source
    .replace(
      'VNE_TEST_VARIANT: "questionnaire-only"',
      `VNE_TEST_VARIANT: "qr-admission-only", VNE_QR_ADMISSION: "test-explicit-v2", VNE_QR_TEST_ACCOUNT_IDS: ${JSON.stringify(QR_TEST_ACCOUNT_IDS.join(","))}`,
    )
    .replaceAll(".sites-runtime/test-allowlist.json", ".sites-runtime/day07-allowlist.json")
    .replaceAll("../test-stand/guard.mjs", "../day07-stand/guard.mjs");
  const file = `.sites-runtime/day07-${name}.mjs`;
  await writeFile(file, source);
  const result = spawnSync(process.execPath, [file], { stdio: "inherit", env: { ...process.env } });
  await rm(file);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "PASS inherited TEST SSR, admin/scanner MFA, exact login IDs and session lifecycle on Day07 artifact",
);
