import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createArtwork } from "../../src/lib/qr-studio/core";
import { getQrTemplate } from "../../src/lib/qr-studio/catalog";
import { PALETTES } from "../../src/lib/qr-studio/pattern";
import { PASS_QR_PALETTES } from "../../src/lib/qr-studio/pass-palette";
import type { PassAccess } from "../../src/components/tickets/types";
const output = process.argv[2];
if (!output) throw new Error("Synthetic fixture output directory required");
mkdirSync(output, { recursive: true });
const original = getQrTemplate("origami")!.pattern;
const payloads = [
  "на удачу",
  "VNE1:KnvEZAm6BpON9wkD_GR7lXAkrPpTfP8--3AF0RxY05Y",
  "я".repeat(110),
  "VNE 🌲 2026",
  "https://example.org/invitation?event=forest-night&sample=19",
  "VNE",
];
const fixtures = [];
for (const [index, text] of payloads.entries()) {
  const control = createArtwork(text, original);
  for (const palette of ["mint", "night", "paper"] as const) {
    const pattern = { ...original, palette };
    const art = createArtwork(text, pattern);
    assert.deepEqual(art.matrix, control.matrix, "Colour must not change the encoded matrix");
    assert.equal(art.svg, createArtwork(text, pattern).svg, "Deterministic recipe");
    const name = `origami-${palette}-${index}`;
    writeFileSync(`${output}/${name}.svg`, art.svg);
    fixtures.push({
      name,
      text,
      pattern,
      renderPalette: PALETTES[palette],
      ...art,
      svg: undefined,
    });
  }
  for (const access of Object.keys(PASS_QR_PALETTES) as PassAccess[]) {
    const art = createArtwork(text, original, access);
    assert.deepEqual(
      art.matrix,
      control.matrix,
      "Pass type changes colour only, never data or access",
    );
    assert.equal(art.svg, createArtwork(text, original, access).svg, "Deterministic pass recipe");
    const name = `origami-${access.toLowerCase()}-${index}`;
    writeFileSync(`${output}/${name}.svg`, art.svg);
    fixtures.push({
      name,
      text,
      pattern: original,
      renderPalette: PASS_QR_PALETTES[access],
      ...art,
      svg: undefined,
    });
  }
  console.log(`Payload ${index} rendered in 7 palettes`);
}
for (const palette of ["mint", "night", "paper"] as const) {
  const pattern = { ...original, palette, accents: false };
  const text = payloads[0]!;
  const art = createArtwork(text, pattern);
  const name = `origami-${palette}-no-accents-0`;
  writeFileSync(`${output}/${name}.svg`, art.svg);
  fixtures.push({ name, text, pattern, renderPalette: PALETTES[palette], ...art, svg: undefined });
}
writeFileSync(`${output}/manifest.json`, JSON.stringify(fixtures, null, 2));
console.log(
  JSON.stringify({
    fixtures: fixtures.length,
    payloads: payloads.length,
    paletteCount: 7,
    exactMatrixAndDeterminism: "PASS",
    externalState: "untouched",
  }),
);
