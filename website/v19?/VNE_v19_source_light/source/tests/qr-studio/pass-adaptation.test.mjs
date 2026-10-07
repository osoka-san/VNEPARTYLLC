// Isolated synthetic payloads. Sharp comes from the managed primary runtime.
// --write-assets creates the 64 static, lazy-loaded catalogue previews after decoding them.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { createRequire } from "node:module";
import jsQR from "jsqr";
const sharp = createRequire(import.meta.url)("sharp");
process.on("uncaughtException", (error) => {
  console.error(error.message);
  process.exit(1);
});

const result = await build({
  stdin: {
    contents: `export { createArtwork } from './src/lib/qr-studio/core'; export { QR_TEMPLATES } from './src/lib/qr-studio/catalog'; export { PASS_QR_PALETTES } from './src/lib/qr-studio/pass-palette';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const { createArtwork, QR_TEMPLATES, PASS_QR_PALETTES } = await import(
  "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
);
const payloads = ["на удачу", "VNE1:KnvEZAm6BpON9wkD_GR7lXAkrPpTfP8--3AF0RxY05Y"];
const sizes = [420, 280, 204, 160];
const output = "docs/sites-import/event-backgrounds/evidence";
await mkdir(output, { recursive: true });
const colors = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) =>
  colors(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const checks = [],
  assets = [],
  paletteChecks = {};
for (const [access, palette] of Object.entries(PASS_QR_PALETTES)) {
  paletteChecks[access] = {
    ink: contrast(palette.fg, palette.bg),
    accent: contrast(palette.accent, palette.bg),
  };
  assert.ok(paletteChecks[access].ink >= 7, access + " ink contrast");
  assert.ok(paletteChecks[access].accent >= 4.5, access + " accent contrast");
}
for (const template of QR_TEMPLATES) {
  const original = createArtwork(payloads[0], template.pattern);
  assert.ok(
    original.svg ===
      (await readFile(`public/assets/qr-studio/catalog/${template.id}-working.svg`, "utf8")),
    "standalone SVG stays byte-identical: " + template.id,
  );
  for (const access of Object.keys(PASS_QR_PALETTES)) {
    for (const [index, text] of payloads.entries()) {
      const art = createArtwork(text, template.pattern, access);
      assert.ok(
        art.svg === createArtwork(text, template.pattern, access).svg,
        "deterministic pass artwork",
      );
      if (!index)
        assert.deepEqual(art.matrix, original.matrix, "palette cannot change encoded modules");
      const buffer = Buffer.from(art.svg);
      for (const size of sizes) {
        const { data, info } = await sharp(buffer, { density: 72 })
          .resize(size, size)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
          inversionAttempts: "attemptBoth",
        });
        checks.push({
          template: template.id,
          access,
          payload: index,
          size,
          ok:
            !!code && code.data === text && Buffer.from(code.binaryData).equals(Buffer.from(text)),
        });
      }
      // Four completely untouched modules on every edge, sampled at an integer module scale.
      const side = (art.size + 8) * 4,
        edge = 16;
      const pixels = await sharp(buffer).resize(side, side).removeAlpha().raw().toBuffer();
      const bg = colors(PASS_QR_PALETTES[access].bg);
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++) {
          if (x >= edge && y >= edge && x < side - edge && y < side - edge) continue;
          for (let c = 0; c < 3; c++)
            assert.equal(
              pixels[(y * side + x) * 3 + c],
              bg[c],
              `${template.id}/${access}: quiet zone`,
            );
        }
      if (!index)
        assets.push({
          path: `public/assets/qr-studio/passes/${template.id}-${access.toLowerCase()}.webp`,
          buffer,
        });
    }
  }
  console.log(template.id + " checked in all four pass palettes");
}
const failures = checks.filter((c) => !c.ok);
await writeFile(
  output + "/pass-qr-validation.json",
  JSON.stringify(
    {
      checks: checks.length,
      failures,
      palettes: paletteChecks,
      matrixAndQuietZones: "PASS",
      originalSvgRegression: "16 byte-identical",
      sizes,
      payloads: "synthetic",
      browser: "NOT VERIFIED",
    },
    null,
    2,
  ),
);
assert.equal(failures.length, 0, JSON.stringify(failures));
if (process.argv.includes("--write-assets")) {
  await mkdir("public/assets/qr-studio/passes", { recursive: true });
  for (const asset of assets)
    await sharp(asset.buffer).resize(360, 360).webp({ lossless: true }).toFile(asset.path);
}
console.log(
  JSON.stringify({
    status: "PASS",
    templates: 16,
    palettes: 4,
    payloads: 2,
    decodeChecks: checks.length,
    previewAssets: assets.length,
  }),
);
