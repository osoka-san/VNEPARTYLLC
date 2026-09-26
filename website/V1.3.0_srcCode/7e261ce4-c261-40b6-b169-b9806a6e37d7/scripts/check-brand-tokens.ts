import { readFileSync } from "node:fs";
import { BRAND_TOKENS_PATH, renderBrandTokensCss } from "./brand-tokens";

// Read-only check: the file on disk is never rewritten here, writing stays in
// `tokens:generate`, so a failing check cannot hide the drift it reports.
const current = readFileSync(BRAND_TOKENS_PATH, "utf8");
const expected = renderBrandTokensCss();

if (current !== expected) {
  console.error(`${BRAND_TOKENS_PATH} is stale. Run \`bun run tokens:generate\`.`);
  process.exit(1);
}

console.log("Brand tokens match designConfig.");
