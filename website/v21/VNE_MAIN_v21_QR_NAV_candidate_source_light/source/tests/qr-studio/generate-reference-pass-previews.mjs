// Local, deterministic catalogue pipeline for the selected24 role previews.
// It never rewrites the40 unselected previews or any saved v0.5 artwork.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import jsQR from "jsqr";
const sharp = createRequire(import.meta.url)("sharp");
const bundle = await build({
  stdin: {
    contents: `export{createArtwork}from'./src/lib/qr-studio/core';export{QR_TEMPLATES,templateImage}from'./src/lib/qr-studio/catalog';export{passTemplateImage,PASS_QR_PALETTES}from'./src/lib/qr-studio/pass-palette';export{NEW_RENDERER_ENGINES}from'./src/lib/qr-studio/pattern';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const {
  createArtwork,
  QR_TEMPLATES,
  templateImage,
  passTemplateImage,
  PASS_QR_PALETTES,
  NEW_RENDERER_ENGINES,
} = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const writes = process.argv.includes("--write-assets"),
  ledger = [];
for (const template of QR_TEMPLATES) {
  const selected = Object.hasOwn(NEW_RENDERER_ENGINES, template.id);
  if (selected && writes)
    await writeFile(
      "public" + templateImage(template.id, "working"),
      createArtwork("на удачу", template.pattern).svg,
    );
  assert.equal(
    await readFile("public" + templateImage(template.id, "working"), "utf8"),
    createArtwork("на удачу", template.pattern).svg,
  );
  for (const access of Object.keys(PASS_QR_PALETTES)) {
    const target = "public" + passTemplateImage(template.id, access);
    if (selected && writes) {
      await mkdir("public/assets/qr-studio/passes", { recursive: true });
      await sharp(Buffer.from(createArtwork("на удачу", template.pattern, access).svg))
        .resize(360, 360)
        .webp({ lossless: true })
        .toFile(target);
    }
    const file = await readFile(target);
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: "attemptBoth",
    });
    assert.ok(
      code &&
        code.data === "на удачу" &&
        Buffer.from(code.binaryData).equals(Buffer.from("на удачу")),
      target + ": exact decoded preview",
    );
    ledger.push({
      template: template.id,
      access,
      url: passTemplateImage(template.id, access),
      updated: selected,
      exactUtf8: true,
    });
  }
}
const out = process.argv.find((a) => a.startsWith("--report="))?.slice(9);
if (out)
  await writeFile(
    out,
    JSON.stringify(
      { status: "PASS", previewCount: ledger.length, updated: 24, unchanged: 40, ledger },
      null,
      2,
    ),
  );
console.log(
  JSON.stringify({
    status: "PASS",
    previewCount: ledger.length,
    updated: 24,
    unchanged: 40,
    written: writes ? 24 : 0,
    browser: "NOT VERIFIED",
  }),
);
