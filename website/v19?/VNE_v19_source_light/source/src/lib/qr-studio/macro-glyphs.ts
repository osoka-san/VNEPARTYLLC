import type { TemplateId } from "./pattern";
import { glyphLayout } from "./glyphs";
import { packCleanFallback } from "./clean-fallback";
import polygonClipping from "polygon-clipping";
import templateData from "./strict-templates.json";

export type Vec = [number, number];
type Polygon = Vec[][];
type Multi = Polygon[];
export type QrMatrix = {
  modules: {
    size: number;
    get(y: number, x: number): number | boolean;
    isReserved(y: number, x: number): number | boolean;
  };
};
type Template = {
  rings: Polygon;
  expanded: Polygon;
  required: Vec[];
  owned: Vec[];
  touched: Vec[];
  blocked?: Vec[];
  bounds: number[];
  type: string;
  width: number;
};
export type MacroGlyph = {
  polygons: Multi;
  expanded: Multi;
  bounds: number[];
  owned: number[];
  type: string;
  score: number;
  x: number;
  y: number;
};
export type MacroLayout = {
  glyphs: MacroGlyph[];
  size: number;
  macroCount: number;
  macroCells: number;
  dataCells: number;
  score: number;
  matrix: boolean[];
  reserved: boolean[];
  restoredCenterGuards: number;
};
const templates = templateData as Template[];
const num = (v: number) => Number(v.toFixed(4));
const translate = (poly: Polygon, x: number, y: number): Polygon =>
  poly.map((r) => r.map((p) => [num(p[0] + x), num(p[1] + y)] as Vec));
const translatedBounds = (b: number[], x: number, y: number) => [
  b[0]! + x,
  b[1]! + y,
  b[2]! + x,
  b[3]! + y,
];
const nearby = (a: number[], b: number[], gap = 0.14) =>
  a[0]! < b[2]! + gap && a[2]! > b[0]! - gap && a[1]! < b[3]! + gap && a[3]! > b[1]! - gap;
const cross = (a: Vec, b: Vec, c: Vec) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function pointInRing(p: Vec, ring: Vec[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function pointInMulti(p: Vec, multi: Multi) {
  return multi.some(
    (poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((r) => pointInRing(p, r)),
  );
}
function pointSegmentSquared(p: Vec, a: Vec, b: Vec) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) : 0;
  return (p[0] - a[0] - dx * t) ** 2 + (p[1] - a[1] - dy * t) ** 2;
}
function closePolygons(a: Polygon, b: Polygon, gap = 0.12) {
  const ra = a[0]!,
    rb = b[0]!;
  if (pointInRing(ra[0]!, rb) || pointInRing(rb[0]!, ra)) return true;
  const sq = gap * gap;
  for (let i = 1; i < ra.length; i++)
    for (let j = 1; j < rb.length; j++) {
      const p = ra[i - 1]!,
        q = ra[i]!,
        r = rb[j - 1]!,
        s = rb[j]!;
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
      if (
        pointSegmentSquared(p, r, s) < sq ||
        pointSegmentSquared(q, r, s) < sq ||
        pointSegmentSquared(r, p, q) < sq ||
        pointSegmentSquared(s, p, q) < sq
      )
        return true;
    }
  return false;
}
function rectangle(x: number, y: number, w: number, h: number): Polygon {
  return [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  ];
}
/** Pack whole S/C/J symbols onto genuine QR module centres. Nothing in the
 * reserved function area can be covered. Unclaimed data is filled afterward. */
export function macroLayout(
  qr: QrMatrix,
  softness = 0.46,
  flow = false,
  variant?: TemplateId,
): MacroLayout {
  const n = qr.modules.size,
    matrix = Array.from({ length: n * n }, (_, i) => !!qr.modules.get(Math.floor(i / n), i % n)),
    reserved = Array.from(
      { length: n * n },
      (_, i) => !!qr.modules.isReserved(Math.floor(i / n), i % n),
    );
  const cells = new Set(matrix.flatMap((v, i) => (v && !reserved[i] ? [i] : [])));
  type Candidate = {
    template: Template;
    x: number;
    y: number;
    owned: number[];
    bounds: number[];
    score: number;
    rank: number;
  };
  const candidates: Candidate[] = [];
  for (const t of templates)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (t.owned.length < 3) continue;
        if (
          !t.required.every(
            ([dx, dy]) =>
              x + dx >= 0 &&
              x + dx < n &&
              y + dy >= 0 &&
              y + dy < n &&
              cells.has((y + dy) * n + x + dx),
          )
        )
          continue;
        const bounds = translatedBounds(t.bounds, x, y);
        if (bounds[0]! < 0 || bounds[1]! < 0 || bounds[2]! > n || bounds[3]! > n) continue;
        if (t.touched.some(([dx, dy]) => reserved[(y + dy) * n + x + dx])) continue;
        if (t.blocked?.some(([dx, dy]) => cells.has((y + dy) * n + x + dx))) continue;
        const owned = t.owned.map(([dx, dy]) => (y + dy) * n + x + dx),
          score =
            owned.length * 1.8 +
            (t.type === "S" ? 3 : t.type === "C" ? 2 : 0) +
            t.width * 1.2 +
            (variant === "circle" && t.type === "C"
              ? 8
              : variant === "dialogue" && t.type === "J"
                ? 5
                : variant === "coupling" && t.type === "J"
                  ? 2
                  : variant === "syncopa" && t.type === "S"
                    ? 2
                    : variant === "flow" && t.type === "J"
                      ? 1
                      : variant === "shift" &&
                          t.bounds[2]! - t.bounds[0]! > t.bounds[3]! - t.bounds[1]!
                        ? 6
                        : 0);
        candidates.push({
          template: t,
          x,
          y,
          owned,
          bounds,
          score,
          rank: score / owned.length ** 0.2,
        });
      }
  candidates.sort((a, b) => b.rank - a.rank);
  const free = new Set(cells),
    glyphs: MacroGlyph[] = [];
  for (const c of candidates) {
    if (!c.owned.every((id) => free.has(id))) continue;
    const poly = translate(c.template.rings, c.x, c.y);
    if (
      glyphs.some(
        (g) => nearby(g.bounds, c.bounds, 0.12) && closePolygons(g.polygons[0]!, poly, 0.12),
      )
    )
      continue;
    glyphs.push({
      polygons: [poly],
      expanded: [translate(c.template.expanded, c.x, c.y)],
      bounds: c.bounds,
      owned: c.owned,
      type: c.template.type,
      score: c.score,
      x: c.x,
      y: c.y,
    });
    for (const id of c.owned) free.delete(id);
  }
  const macroCount = glyphs.length,
    macroCells = cells.size - free.size;
  const ownedAlready = new Set(glyphs.flatMap((g) => g.owned));
  const remainingQr = {
    modules: {
      size: n,
      get: (y: number, x: number) => qr.modules.get(y, x),
      isReserved: (y: number, x: number) =>
        qr.modules.isReserved(y, x) || ownedAlready.has(y * n + x),
    },
  };
  const remainingPaths = glyphLayout(remainingQr, flow).paths;
  const cleanFill = packCleanFallback(n, matrix, reserved, remainingPaths, glyphs, softness);
  if (cleanFill.unfilled.length)
    throw new Error("clean-layout-incomplete:" + cleanFill.unfilled.join(","));
  glyphs.push(...cleanFill.fills);
  const restoredCenterGuards = 0;
  return {
    glyphs,
    size: n,
    macroCount,
    macroCells,
    dataCells: cells.size,
    score:
      macroCells * 2 +
      macroCount * 3 -
      glyphs.filter((g) => g.type === "fill" && g.owned.length === 1).length * 2,
    matrix,
    reserved,
    restoredCenterGuards,
  };
}
export function polygonsPath(multi: Multi) {
  return multi
    .map((poly) =>
      poly.map((r) => "M" + r.map((p) => `${num(p[0])} ${num(p[1])}`).join("L") + "Z").join(""),
    )
    .join("");
}
export function renderMacroGlyphs(
  layout: MacroLayout,
  options: { foreground: string; accent: string; accents: boolean },
) {
  const picked = new Set<MacroGlyph>(),
    n = layout.size;
  if (options.accents)
    for (const [x, y] of [
      [n * 0.4, n * 0.43],
      [n * 0.75, n * 0.75],
      [n * 0.59, n * 0.18],
    ]) {
      const candidate = layout.glyphs
        .filter((g) => g.type !== "fill" && !picked.has(g))
        .sort(
          (a, b) =>
            ((a.bounds[0]! + a.bounds[2]!) / 2 - x!) ** 2 +
            ((a.bounds[1]! + a.bounds[3]!) / 2 - y!) ** 2 -
            (((b.bounds[0]! + b.bounds[2]!) / 2 - x!) ** 2 +
              ((b.bounds[1]! + b.bounds[3]!) / 2 - y!) ** 2),
        )[0];
      if (candidate) picked.add(candidate);
    }
  return layout.glyphs
    .map(
      (g) =>
        `<path d="${polygonsPath(g.polygons)}" fill="${picked.has(g) ? options.accent : options.foreground}" fill-rule="evenodd"/>`,
    )
    .join("");
}
export function macroCenterFailures(layout: MacroLayout) {
  const bad: number[] = [];
  for (let i = 0; i < layout.size ** 2; i++)
    if (
      !layout.reserved[i] &&
      pointInMulti(
        [(i % layout.size) + 0.5, Math.floor(i / layout.size) + 0.5],
        layout.glyphs.flatMap((g) => g.polygons),
      ) !== layout.matrix[i]
    )
      bad.push(i);
  return bad;
}

export function macroReservedOverlaps(layout: MacroLayout) {
  const bad: number[] = [];
  for (let id = 0; id < layout.size ** 2; id++)
    if (layout.reserved[id]) {
      const x = id % layout.size,
        y = Math.floor(id / layout.size),
        cell = rectangle(x, y, 1, 1);
      for (const g of layout.glyphs)
        if (nearby(g.bounds, [x, y, x + 1, y + 1], 0)) {
          const overlap = polygonClipping.intersection(g.polygons, cell) as Multi;
          const area = overlap.reduce(
            (total, poly) =>
              total +
              poly.reduce((sum, ring, index) => {
                let twice = 0;
                for (let i = 1; i < ring.length; i++)
                  twice += ring[i - 1]![0] * ring[i]![1] - ring[i]![0] * ring[i - 1]![1];
                return sum + ((index ? -1 : 1) * Math.abs(twice)) / 2;
              }, 0),
            0,
          );
          if (area > 1e-8) {
            bad.push(id);
            break;
          }
        }
    }
  return bad;
}

export function macroSamplingCoreFailures(layout: MacroLayout) {
  const bad: number[] = [];
  const painted = layout.glyphs.flatMap((g) => g.polygons);
  for (let id = 0; id < layout.size ** 2; id++)
    if (!layout.reserved[id]) {
      const core = rectangle(
        (id % layout.size) + 0.34,
        Math.floor(id / layout.size) + 0.34,
        0.32,
        0.32,
      );
      const delta = layout.matrix[id]
        ? polygonClipping.difference(core, painted)
        : polygonClipping.intersection(core, painted);
      if (delta.length) bad.push(id);
    }
  return bad;
}
