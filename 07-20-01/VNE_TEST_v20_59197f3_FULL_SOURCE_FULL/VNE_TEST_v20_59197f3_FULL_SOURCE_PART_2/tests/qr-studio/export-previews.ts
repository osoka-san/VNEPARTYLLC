import { createArtwork, PATTERNS } from "../../src/lib/qr-studio/core";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const dir = process.argv[2];
if (!dir) throw new Error("Absolute fixture output directory required");
const root = resolve(import.meta.dirname, "../../public/assets/qr-studio");
for (const p of PATTERNS)
  for (const palette of ["mint", "night", "paper"] as const) {
    writeFileSync(
      `${root}/current-${p.geometry}-${palette}.svg`,
      createArtwork("на удачу", { ...p, palette }).svg,
    );
  }
mkdirSync(dir, { recursive: true });
const list = [];
for (const p of PATTERNS)
  for (const [i, text] of [
    "VNE1:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
    "VNE1:KnvEZAm6BpON9wkD_GR7lXAkrPpTfP8--3AF0RxY05Y",
    "я".repeat(110),
  ].entries()) {
    const a = createArtwork(text, p),
      name = `${p.geometry}-${i}`;
    writeFileSync(`${dir}/${name}.svg`, a.svg);
    list.push({ name, text, pattern: p, ...a, svg: undefined });
  }
writeFileSync(`${dir}/manifest.json`, JSON.stringify(list));
console.log("6 previews + 6 ticket/max-length fixtures");
