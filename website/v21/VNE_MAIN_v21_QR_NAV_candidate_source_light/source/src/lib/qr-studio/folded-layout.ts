import polygonClipping from "polygon-clipping";
import { glyphLayout } from "./glyphs";
import type { MacroLayout, QrMatrix, Vec } from "./macro-glyphs";

/** Whole folded-paper paths. Orthogonal joins remain full cells; a diagonal
 * bridge is admitted only where glyphLayout has excluded functional cells and
 * both neighbouring data cells are light. Its .86 width misses their .32 cores.
 */
export function foldedLayout(qr: QrMatrix): MacroLayout {
  const n = qr.modules.size;
  const matrix = Array.from({ length: n * n }, (_, id) =>
    Boolean(qr.modules.get(Math.floor(id / n), id % n)),
  );
  const reserved = Array.from({ length: n * n }, (_, id) =>
    Boolean(qr.modules.isReserved(Math.floor(id / n), id % n)),
  );
  const paths = glyphLayout(qr, true).paths;
  const glyphs = paths.map((points) => {
    const parts: polygonClipping.Polygon[] = points.map((p) => [
      [
        [p.x - 0.5, p.y - 0.5],
        [p.x + 0.5, p.y - 0.5],
        [p.x + 0.5, p.y + 0.5],
        [p.x - 0.5, p.y + 0.5],
        [p.x - 0.5, p.y - 0.5],
      ],
    ]);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      if (a.x === b.x || a.y === b.y) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      const ox = (-dy / length) * 0.43,
        oy = (dx / length) * 0.43;
      const corners: Vec[] = [
        [a.x + ox, a.y + oy],
        [a.x - ox, a.y - oy],
        [b.x - ox, b.y - oy],
        [b.x + ox, b.y + oy],
        [a.x + ox, a.y + oy],
      ];
      parts.push([corners]);
    }
    let polygons = polygonClipping.union(parts[0]!, ...parts.slice(1));
    if (points.length > 1) {
      // Two single clipped tips read as folded paper ends. The .45 cuts stay
      // outside the complete .32 sampling square; no middle cells are carved.
      for (const [tip, next] of [
        [points[0]!, points[1]!],
        [points[points.length - 1]!, points[points.length - 2]!],
      ] as const) {
        const dx = tip.x - next.x,
          dy = tip.y - next.y;
        const sx = Math.sign(dx || -dy),
          sy = Math.sign(dy || dx);
        const corner: Vec = [tip.x + sx * 0.5, tip.y + sy * 0.5];
        const cut: polygonClipping.Polygon = [
          [corner, [corner[0] - sx * 0.45, corner[1]], [corner[0], corner[1] - sy * 0.45], corner],
        ];
        polygons = polygonClipping.difference(polygons, cut);
      }
    }
    const vertices = polygons.flat(2);
    return {
      polygons,
      expanded: polygons,
      bounds: [
        Math.min(...vertices.map((p) => p[0])),
        Math.min(...vertices.map((p) => p[1])),
        Math.max(...vertices.map((p) => p[0])),
        Math.max(...vertices.map((p) => p[1])),
      ],
      owned: points.map((p) => p.id),
      type: "fold",
      score: points.length,
      x: points[0]!.x,
      y: points[0]!.y,
    };
  });
  const dataCells = glyphs.reduce((total, glyph) => total + glyph.owned.length, 0);
  const macroCells = glyphs
    .filter((glyph) => glyph.owned.length >= 3)
    .reduce((total, glyph) => total + glyph.owned.length, 0);
  return {
    glyphs,
    size: n,
    macroCount: glyphs.filter((glyph) => glyph.owned.length >= 3).length,
    macroCells,
    dataCells,
    matrix,
    reserved,
    restoredCenterGuards: 0,
    score:
      macroCells * 5 -
      glyphs.filter((glyph) => glyph.owned.length === 1).length * 12 -
      glyphs.length,
  };
}
