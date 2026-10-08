import assert from "node:assert/strict";
import QRCode from "qrcode";
import polygonClipping from "polygon-clipping";
import templates from "../../src/lib/qr-studio/strict-templates.json";
import {
  macroLayout,
  macroSamplingCoreFailures,
  macroReservedOverlaps,
} from "../../src/lib/qr-studio/macro-glyphs";
import type { MultiPolygon, Polygon } from "polygon-clipping";

const rect = (x: number, y: number, w: number): Polygon => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + w],
    [x, y + w],
    [x, y],
  ],
];
const area = (multi: MultiPolygon) =>
  multi.reduce(
    (sum, p) =>
      sum +
      p.reduce((s, r, hole) => {
        let a = 0;
        for (let i = 1; i < r.length; i++) a += r[i - 1]![0] * r[i]![1] - r[i]![0] * r[i - 1]![1];
        return s + ((hole ? -1 : 1) * Math.abs(a)) / 2;
      }, 0),
    0,
  );
// Validate the generated library's contract independently of the packing code:
// every complete sampling square is either entirely painted or entirely clear.
for (const t of templates) {
  const shape = t.rings as Polygon;
  const normalized = polygonClipping.union(shape);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]!.length, 1);
  const owned = new Set(t.owned.map(([x, y]) => `${x},${y}`));
  for (let y = Math.floor(t.bounds[1]!); y < Math.ceil(t.bounds[3]!); y++) {
    for (let x = Math.floor(t.bounds[0]!); x < Math.ceil(t.bounds[2]!); x++) {
      const core = rect(x + 0.34, y + 0.34, 0.32);
      const error = owned.has(`${x},${y}`)
        ? polygonClipping.difference(core, shape)
        : polygonClipping.intersection(core, shape);
      assert.ok(area(error) < 1e-8, `${t.type} core ${x},${y}`);
      if (
        !owned.has(`${x},${y}`) &&
        area(polygonClipping.intersection(shape, rect(x + 0.08, y + 0.08, 0.84))) > 1e-8
      ) {
        assert.ok(
          t.blocked.some(([bx, by]) => bx === x && by === y),
          "missing clearance exclusion",
        );
      }
    }
  }
}
const qr = QRCode.create("на удачу", { errorCorrectionLevel: "Q", maskPattern: 6 });
for (const [softness, flow] of [
  [0, false],
  [0.46, false],
  [0, true],
  [0.46, true],
] as const) {
  const layout = macroLayout(qr, softness, flow);
  assert.deepEqual(macroSamplingCoreFailures(layout), []);
  assert.deepEqual(macroReservedOverlaps(layout), []);
  const owners = layout.glyphs.flatMap((g) => g.owned);
  assert.equal(owners.length, new Set(owners).size);
  assert.equal(owners.length, layout.dataCells);
  for (const g of layout.glyphs) {
    assert.equal(g.polygons.length, 1);
    assert.equal(g.polygons[0]!.length, 1);
    if (g.type === "fill" && g.owned.length === 1) {
      assert.ok(g.bounds[2]! - g.bounds[0]! >= 0.71999);
      assert.ok(g.bounds[3]! - g.bounds[1]! >= 0.71999);
    }
    if (g.type !== "fill") {
      // A placed macro must remain the complete source silhouette after translation.
      assert.ok(
        templates.some(
          (t) =>
            t.type === g.type &&
            JSON.stringify(
              t.rings.map((r) =>
                r.map(([x, y]) => [Number((x! + g.x).toFixed(4)), Number((y! + g.y).toFixed(4))]),
              ),
            ) === JSON.stringify(g.polygons[0]),
        ),
      );
    }
  }
}
console.log(
  JSON.stringify({
    status: "PASS",
    templates: templates.length,
    layouts: 4,
    wholeShapes: true,
    minSingleton: 0.72,
    samplingCore: 0.32,
  }),
);
