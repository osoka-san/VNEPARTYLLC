import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createArtwork } from "../../src/lib/qr-studio/core";
import { QR_TEMPLATES } from "../../src/lib/qr-studio/catalog";
const dir = process.argv[2];
if (!dir) throw new Error("Output directory required");
mkdirSync(dir, { recursive: true });
const assets = resolve(import.meta.dirname, "../../public/assets/qr-studio/catalog");
const manifest = [];
for (const t of QR_TEMPLATES) {
  const cases = [
    { text: "на удачу", pattern: t.pattern },
    { text: "VNE1:KnvEZAm6BpON9wkD_GR7lXAkrPpTfP8--3AF0RxY05Y", pattern: t.pattern },
    { text: "я".repeat(110), pattern: t.pattern },
    ...(["mint", "night", "paper"] as const)
      .filter((p) => p !== t.pattern.palette)
      .map((palette) => ({ text: "на удачу", pattern: { ...t.pattern, palette } })),
  ];
  for (const [c, candidate] of cases.entries()) {
    const a = createArtwork(candidate.text, candidate.pattern);
    const name = t.id + "-" + c;
    if (!c) {
      writeFileSync(`${assets}/${t.id}-working.svg`, a.svg);
      assert.equal(a.svg, createArtwork(candidate.text, candidate.pattern).svg);
    }
    writeFileSync(`${dir}/${name}.svg`, a.svg);
    manifest.push({ name, text: candidate.text, pattern: candidate.pattern, ...a, svg: undefined });
  }
  console.log(t.id + " ready");
}
writeFileSync(dir + "/manifest.json", JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify({
    templates: QR_TEMPLATES.length,
    fixtures: manifest.length,
    determinism: "PASS",
  }),
);
