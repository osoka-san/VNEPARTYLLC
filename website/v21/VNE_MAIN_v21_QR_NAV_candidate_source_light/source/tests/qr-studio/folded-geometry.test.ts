import assert from "node:assert/strict";
import QRCode from "qrcode";
import { foldedLayout } from "../../src/lib/qr-studio/folded-layout";
import { macroReservedOverlaps } from "../../src/lib/qr-studio/macro-glyphs";
import polygonClipping from "polygon-clipping";
const payloads = [
  "VNE",
  "на удачу",
  "VNE1:KnvEZAm6BpON9wkD_GR7lXAkrPpTfP8--3AF0RxY05Y",
  "я".repeat(110),
];
let layouts = 0;
for (const text of payloads)
  for (const maskPattern of [0, 3, 7] as const) {
    const qr = QRCode.create(text, { errorCorrectionLevel: "Q", maskPattern });
    const layout = foldedLayout(qr);
    const area = (polygons: polygonClipping.MultiPolygon) =>
      polygons.reduce(
        (sum, polygon) =>
          sum +
          polygon.reduce((sum, ring, index) => {
            let twice = 0;
            for (let i = 1; i < ring.length; i++)
              twice += ring[i - 1]![0] * ring[i]![1] - ring[i]![0] * ring[i - 1]![1];
            return sum + ((index ? -1 : 1) * Math.abs(twice)) / 2;
          }, 0),
        0,
      );
    for (let y = 0; y < layout.size; y++)
      for (let x = 0; x < layout.size; x++) {
        const id = y * layout.size + x;
        if (layout.reserved[id]) continue;
        const core: polygonClipping.Polygon = [
          [
            [x + 0.34, y + 0.34],
            [x + 0.66, y + 0.34],
            [x + 0.66, y + 0.66],
            [x + 0.34, y + 0.66],
            [x + 0.34, y + 0.34],
          ],
        ];
        const nearby = layout.glyphs.filter(
          (glyph) =>
            glyph.bounds[0]! < x + 0.66 &&
            glyph.bounds[1]! < y + 0.66 &&
            glyph.bounds[2]! > x + 0.34 &&
            glyph.bounds[3]! > y + 0.34,
        );
        if (layout.matrix[id]) {
          const owner = nearby.find((glyph) => glyph.owned.includes(id));
          assert.ok(owner);
          assert.ok(
            area(polygonClipping.difference(core, owner.polygons)) < 1e-8,
            `dark core ${x},${y}`,
          );
        } else {
          for (const glyph of nearby)
            assert.ok(
              area(polygonClipping.intersection(core, glyph.polygons)) < 1e-8,
              `light core ${x},${y}`,
            );
        }
      }
    assert.deepEqual(
      macroReservedOverlaps(layout),
      [],
      "No data material overlaps any functional cell",
    );
    const owners = layout.glyphs.flatMap((glyph) => glyph.owned);
    assert.equal(new Set(owners).size, owners.length, "Each dark cell has exactly one owner");
    assert.equal(owners.length, layout.dataCells);
    for (const glyph of layout.glyphs) {
      assert.ok(
        glyph.bounds[0]! >= 0 &&
          glyph.bounds[1]! >= 0 &&
          glyph.bounds[2]! <= qr.modules.size &&
          glyph.bounds[3]! <= qr.modules.size,
      );
      assert.ok(glyph.polygons.length > 0, "No empty paper fragments");
    }
    layouts++;
  }
console.log(
  JSON.stringify({
    status: "PASS",
    layouts,
    payloads: payloads.length,
    matrixSizes: "21 through69",
    samplingCore: 0.32,
    reservedOverlap: 0,
    network: "unused",
  }),
);
