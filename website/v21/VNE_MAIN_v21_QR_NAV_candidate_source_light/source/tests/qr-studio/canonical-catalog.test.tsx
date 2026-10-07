import assert from "node:assert/strict";
import { accessSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateCatalog } from "../../src/components/qr-studio/TemplateCatalog";
import { ReferenceComparison } from "../../src/components/qr-studio/ReferenceComparison";
import { QR_TEMPLATES, QR_STUDIO_TEMPLATES, templateImage } from "../../src/lib/qr-studio/catalog";
import { passTemplateImage } from "../../src/lib/qr-studio/pass-palette";
import { createArtwork } from "../../src/lib/qr-studio/core";
import { NEW_RENDERER_ENGINES } from "../../src/lib/qr-studio/pattern";
const html = renderToStaticMarkup(
  <TemplateCatalog
    onSelect={() => {}}
    onPreview={() => {}}
    passAccess="GENERAL"
    onPassAccessChange={() => {}}
  />,
);
assert.equal(QR_STUDIO_TEMPLATES.length, 6);
assert.equal(QR_TEMPLATES.length, 16);
assert.equal(html.match(/data-template=/g)?.length, 6);
assert.ok(html.includes("На пропуске"));
assert.ok(html.includes("четыре палитры"));
assert.ok(!html.includes("Прежний стиль на карточке"));
assert.ok(!html.includes("/ 16"));
for (const t of QR_TEMPLATES) {
  const url = templateImage(t.id, "working");
  accessSync("public" + url);
  assert.equal(
    readFileSync("public" + url, "utf8"),
    createArtwork("на удачу", t.pattern).svg,
    t.id + ": actual asset URL matches renderer",
  );
  const visible = QR_STUDIO_TEMPLATES.some((x) => x.id === t.id);
  assert.equal(html.includes(`data-template="${t.id}"`), visible);
  if (visible) assert.ok(html.includes(passTemplateImage(t.id, "GENERAL")));
}
const comparison = renderToStaticMarkup(<ReferenceComparison />);
for (const t of QR_STUDIO_TEMPLATES)
  assert.ok(comparison.includes(templateImage(t.id, "reference")));
assert.ok(!comparison.includes("reference-syncopa.png"));
assert.ok(!comparison.includes("reference-flow.png"));
assert.equal(Object.keys(NEW_RENDERER_ENGINES).length, 6);
console.log(
  JSON.stringify({
    status: "PASS",
    visibleStyles: 6,
    legacyRegistry: 16,
    visibleRoleVariants: 24,
    initialMode: "working",
    currentAssetUrls: "exact",
    browser: "NOT VERIFIED",
  }),
);
