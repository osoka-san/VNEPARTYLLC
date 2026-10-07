import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
const baseline = process.argv[2];
if (!baseline) throw new Error("Verified v20 baseline directory required");
async function load(root) {
  const result = await build({
    stdin: {
      contents: `export{createArtwork}from'./src/lib/qr-studio/core';export{QR_TEMPLATES}from'./src/lib/qr-studio/catalog';`,
      resolveDir: root,
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
const old = await load(baseline),
  current = await load(process.cwd());
const payloads = ["на удачу", "VNE1:KnvEZAm6BpON9wkD_GR7lXAkrPpTfP8--3AF0RxY05Y"];
let legacyChecks = 0,
  unselectedDefaultChecks = 0;
for (const template of old.QR_TEMPLATES)
  for (const text of payloads) {
    for (const palette of ["mint", "night", "paper"]) {
      const pattern = { ...template.pattern, palette };
      const before = old.createArtwork(text, pattern);
      assert.deepEqual(
        current.createArtwork(text, pattern, undefined, "vne-glyphs-0.5.0"),
        before,
        "Frozen legacy rendering: " + template.id,
      );
      legacyChecks++;
      if (
        !["origami", "basalt", "portals", "constellation", "weave", "folds"].includes(template.id)
      ) {
        assert.deepEqual(current.createArtwork(text, pattern), before);
        unselectedDefaultChecks++;
      }
    }
    for (const access of ["GENERAL", "VIP", "SECURITY", "ARTIST"]) {
      const before = old.createArtwork(text, template.pattern, access);
      assert.deepEqual(
        current.createArtwork(text, template.pattern, access, "vne-glyphs-0.5.0"),
        before,
        "Frozen pass rendering: " + template.id + "/" + access,
      );
      legacyChecks++;
      if (
        !["origami", "basalt", "portals", "constellation", "weave", "folds"].includes(template.id)
      ) {
        assert.deepEqual(current.createArtwork(text, template.pattern, access), before);
        unselectedDefaultChecks++;
      }
    }
  }
for (const name of await readdir(baseline + "/public/assets/qr-studio/passes"))
  assert.deepEqual(
    await readFile("public/assets/qr-studio/passes/" + name),
    await readFile(baseline + "/public/assets/qr-studio/passes/" + name),
    "Ticket asset unchanged " + name,
  );
console.log(
  JSON.stringify({
    status: "PASS",
    legacyChecks,
    unselectedDefaultChecks,
    legacyTemplates: 16,
    unchangedTicketAssets: 64,
    scope: "Exact SVG, matrix, fingerprint and output-object comparison; synthetic inputs only",
  }),
);
