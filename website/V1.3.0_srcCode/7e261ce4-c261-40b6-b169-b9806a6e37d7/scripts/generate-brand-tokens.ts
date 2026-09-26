import { writeFileSync } from "node:fs";
import { BRAND_TOKENS_PATH, renderBrandTokensCss } from "./brand-tokens";

writeFileSync(BRAND_TOKENS_PATH, renderBrandTokensCss());
