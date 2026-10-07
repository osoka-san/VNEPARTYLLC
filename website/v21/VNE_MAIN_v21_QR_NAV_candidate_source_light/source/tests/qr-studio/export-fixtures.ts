import { mkdirSync, writeFileSync } from "node:fs";
import { createArtwork, PATTERNS, TEST_PAYLOADS, parsePattern } from "../../src/lib/qr-studio/core";
import assert from "node:assert/strict";
import { patternFile, readPatternFile } from "../../src/lib/qr-studio/pattern";
const dir = process.argv[2];
if (!dir) throw new Error("Output directory required");
mkdirSync(dir, { recursive: true });
const manifest = [];
for (const pattern of PATTERNS)
  for (const [i, text] of TEST_PAYLOADS.entries()) {
    const a = createArtwork(text, pattern);
    assert.equal(a.svg, createArtwork(text, pattern).svg);
    const name = `${pattern.geometry}-${String(i + 1).padStart(2, "0")}`;
    writeFileSync(`${dir}/${name}.svg`, a.svg);
    manifest.push({ name, text, pattern, ...a, svg: undefined });
  }
for (const bad of [
  null,
  {},
  { ...PATTERNS[0], palette: ["night"] },
  { ...PATTERNS[0], geometry: ["flow"] },
  { ...PATTERNS[0], rounding: NaN },
  { ...PATTERNS[0], rounding: 2 },
  { ...PATTERNS[0], palette: "url(javascript:bad)" },
  { ...PATTERNS[0], name: "x".repeat(61) },
])
  assert.throws(() => parsePattern(bad));
assert.throws(() => createArtwork(" ", PATTERNS[0]));
assert.throws(() => createArtwork("я".repeat(111), PATTERNS[0]));
assert.deepEqual(readPatternFile(patternFile(PATTERNS[0])).pattern, PATTERNS[0]);
assert.equal(readPatternFile(PATTERNS[0]).legacy, true);
for (const engineVersion of ["vne-glyphs-0.2.0", "vne-glyphs-0.3.0"]) {
  const imported = readPatternFile({ ...patternFile(PATTERNS[0]), engineVersion });
  assert.equal(imported.legacy, true);
  assert.deepEqual(imported.pattern, PATTERNS[0]);
}
assert.throws(() => readPatternFile({ ...patternFile(PATTERNS[0]), engineVersion: "unknown" }));
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify({ fixtures: manifest.length, determinism: "PASS", inputValidation: "PASS" }),
);
