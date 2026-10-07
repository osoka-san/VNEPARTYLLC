// Synthetic, filesystem-only raster gate. No database, account or ticket issuance.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import jsQR from "jsqr";
const sharp = createRequire(import.meta.url)("sharp");
const root = process.argv[2];
if (!root) throw new Error("Fixture directory required");
const fixtures = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const palettes = {
  mint: { bg: "#30e5ad", fg: "#070a09" },
  night: { bg: "#070a09", fg: "#30e5ad" },
  paper: { bg: "#edf2ee", fg: "#070a09" },
};
const materials = new Set([
  "ribs",
  "folds",
  "enamel",
  "relief",
  "basalt",
  "portals",
  "weave",
  "origami",
  "constellation",
  "marble",
]);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (color) => color.reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
const results = [];
await mkdir(join(root, "rasters"), { recursive: true });
for (const fixture of fixtures) {
  const svg = await readFile(join(root, fixture.name + ".svg"));
  const n = fixture.size,
    scale = 20,
    size = (n + 8) * scale;
  const { bg, fg } = fixture.renderPalette ?? palettes[fixture.pattern.palette];
  const background = rgb(bg),
    foreground = rgb(fg),
    accent = rgb("#e55330");
  const pixels = await sharp(svg).resize(size, size).removeAlpha().raw().toBuffer();
  const pixel = (x, y) => [...pixels.subarray((y * size + x) * 3, (y * size + x) * 3 + 3)];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const cell = y * n + x,
        dark = Boolean(fixture.matrix[cell]);
      for (const [dx, dy] of [
        [0.5, 0.5],
        [0.38, 0.38],
        [0.62, 0.38],
        [0.62, 0.62],
        [0.38, 0.62],
      ]) {
        const actual = pixel(Math.floor((x + 4 + dx) * scale), Math.floor((y + 4 + dy) * scale));
        if (materials.has(fixture.pattern.template) && dark) {
          const signed =
            (luminance(actual) - luminance(background)) /
            (luminance(foreground) - luminance(background));
          assert.ok(signed > 0.25, `${fixture.name}: protected core contrast ${x},${y}`);
        } else {
          const allowed = dark ? [foreground] : [background];
          if (dark && !fixture.reserved[cell] && fixture.pattern.accents) allowed.push(accent);
          assert.ok(
            allowed.some((color) => actual.every((v, i) => Math.abs(v - color[i]) < 5)),
            `${fixture.name}: protected cell ${x},${y} at ${dx},${dy}`,
          );
        }
      }
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (x >= 4 * scale && y >= 4 * scale && x < size - 4 * scale && y < size - 4 * scale)
        continue;
      assert.deepEqual(pixel(x, y), background, `${fixture.name}: four-module quiet zone`);
    }
  const checks = [];
  const variants = [900, 420, 280];
  // Small-card coverage is defined by matrix size, not a fixture name or payload language.
  // Dense matrices larger than41modules retain900/420/280 coverage; tiny printing is not claimed.
  if (n <= 41) variants.push(160, 144);
  for (const width of variants) {
    const png = await sharp(svg).resize(width, width).png().toBuffer();
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: "attemptBoth",
    });
    const ok =
      Boolean(code) &&
      code.data === fixture.text &&
      Buffer.from(code.binaryData).equals(Buffer.from(fixture.text));
    checks.push({ variant: String(width), exactUtf8: ok });
    await writeFile(join(root, "rasters", `${fixture.name}-${width}.png`), png);
  }
  for (const [variant, image] of [
    ["jpeg75", await sharp(svg).resize(420, 420).jpeg({ quality: 75 }).toBuffer()],
    ["blur", await sharp(svg).resize(420, 420).blur(0.45).png().toBuffer()],
  ]) {
    const { data, info } = await sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: "attemptBoth",
    });
    checks.push({
      variant,
      exactUtf8:
        Boolean(code) &&
        code.data === fixture.text &&
        Buffer.from(code.binaryData).equals(Buffer.from(fixture.text)),
    });
  }
  results.push({ name: fixture.name, samplingCore: "PASS", quietZone: "PASS", checks });
  console.log(fixture.name + " checked");
}
const failures = results.flatMap((r) =>
  r.checks.filter((c) => !c.exactUtf8).map((c) => ({ name: r.name, ...c })),
);
await writeFile(
  join(root, "validation-jsqr.json"),
  JSON.stringify(
    {
      fixtures: results.length,
      checks: results.reduce((n, r) => n + r.checks.length, 0),
      failures,
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    fixtures: results.length,
    checks: results.reduce((n, r) => n + r.checks.length, 0),
    failures,
  }),
);
assert.equal(failures.length, 0, "Decoder failures must not be relabelled as a pass.");
