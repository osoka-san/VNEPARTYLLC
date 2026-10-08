import polygonClipping from "polygon-clipping";

export type Vec = [number, number];
export type Polygon = Vec[][];
export type Multi = Polygon[];
export type Point = { x: number; y: number; id?: number };
export type Shape = {
  polygons: Multi;
  expanded: Multi;
  bounds: number[];
  owned: number[];
  type: string;
  score: number;
  x: number;
  y: number;
};
const num = (v: number) => Number(v.toFixed(5));
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ],
];
const bounds = (poly: Polygon) => [
  Math.min(...poly[0]!.map((p) => p[0])),
  Math.min(...poly[0]!.map((p) => p[1])),
  Math.max(...poly[0]!.map((p) => p[0])),
  Math.max(...poly[0]!.map((p) => p[1])),
];
const nearby = (a: number[], b: number[], gap = 0.12) =>
  a[0]! < b[2]! + gap && a[2]! > b[0]! - gap && a[1]! < b[3]! + gap && a[3]! > b[1]! - gap;
const cross = (a: Vec, b: Vec, c: Vec) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function area(m: Multi): number {
  return m.reduce(
    (sum, p) =>
      sum +
      p.reduce((sum, r, index) => {
        let a = 0;
        for (let i = 1; i < r.length; i++) a += r[i - 1]![0] * r[i]![1] - r[i]![0] * r[i - 1]![1];
        return sum + ((index ? -1 : 1) * Math.abs(a)) / 2;
      }, 0),
    0,
  );
}

// Conservative radius keeps the entire 0.32 x 0.32 sampling square inside a
// 0.90-wide ribbon even at adjacent 90-degree turns. There is no core repair.
function skeleton(raw: Point[], radius = 0.49): Vec[] {
  const pts = raw
    .map((p) => [p.x, p.y] as Vec)
    .filter(
      (p, i, a) => !i || i === a.length - 1 || Math.abs(cross(a[i - 1]!, p, a[i + 1]!)) > 1e-8,
    );
  const extend = (a: Vec, b: Vec, d: number): Vec => {
    const l = Math.hypot(a[0] - b[0], a[1] - b[1]);
    return [a[0] + ((a[0] - b[0]) * d) / l, a[1] + ((a[1] - b[1]) * d) / l];
  };
  const out = [extend(pts[0]!, pts[1]!, 0.4), pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!,
      c = pts[i + 1]!;
    const r = Math.min(
      radius,
      Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.49,
      Math.hypot(c[0] - b[0], c[1] - b[1]) * 0.49,
    );
    const before = extend(b, a, -r),
      after = extend(b, c, -r);
    out.push(before);
    const al = Math.hypot(b[0] - a[0], b[1] - a[1]),
      cl = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ux = (b[0] - a[0]) / al,
      uy = (b[1] - a[1]) / al,
      vx = (c[0] - b[0]) / cl,
      vy = (c[1] - b[1]) / cl;
    const turn = Math.sign(ux * vy - uy * vx),
      angle = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (!turn || angle < 1e-6) {
      out.push(after);
      continue;
    }
    const arcRadius = r / Math.tan(angle / 2),
      cx = before[0] - uy * turn * arcRadius,
      cy = before[1] + ux * turn * arcRadius;
    const startAngle = Math.atan2(before[1] - cy, before[0] - cx);
    for (let k = 1; k <= 16; k++) {
      const angleAt = startAngle + (turn * angle * k) / 16;
      out.push([cx + arcRadius * Math.cos(angleAt), cy + arcRadius * Math.sin(angleAt)]);
    }
  }
  out.push(pts[pts.length - 1]!, extend(pts[pts.length - 1]!, pts[pts.length - 2]!, 0.4));
  return out.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > 1e-7);
}
function ribbon(samples: Vec[], width: number, extraEnd = 0): Polygon {
  const normals: Vec[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!,
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    normals.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]);
  }
  const left: Vec[] = [],
    right: Vec[] = [];
  for (let i = 0; i < samples.length; i++) {
    const n1 = normals[Math.max(0, i - 1)]!,
      n2 = normals[Math.min(i, normals.length - 1)]!;
    let nx = n1[0] + n2[0],
      ny = n1[1] + n2[1],
      l = Math.hypot(nx, ny);
    nx /= l;
    ny /= l;
    const mult = width / 2 / Math.max(0.35, nx * n2[0] + ny * n2[1]);
    let [x, y] = samples[i]!;
    if (i === 0) {
      x -= n2[1] * extraEnd;
      y += n2[0] * extraEnd;
    }
    if (i === samples.length - 1) {
      x += n2[1] * extraEnd;
      y -= n2[0] * extraEnd;
    }
    left.push([num(x + nx * mult), num(y + ny * mult)]);
    right.push([num(x - nx * mult), num(y - ny * mult)]);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]!);
  return [ring];
}

/** Clean fallback: accepted glyphs are immutable. Unsafe ribbons split into
 * shorter candidates; there are no boolean-difference cuts or square patches.
 * Existing macro placement must already reserve room for each unowned core. */
export function packCleanFallback(
  n: number,
  matrix: boolean[],
  reserved: boolean[],
  paths: Point[][],
  macros: Shape[],
  softness = 0.46,
) {
  const free = new Set(
    matrix.flatMap((dark, id) =>
      dark && !reserved[id] && !macros.some((g) => g.owned.includes(id)) ? [id] : [],
    ),
  );
  const fills: Shape[] = [];
  const idOf = (p: Point) => Math.round(p.y - 0.5) * n + Math.round(p.x - 0.5);
  const obstacles = () => [...macros, ...fills];
  function candidate(points: Point[], gap = 0.06, singletonWidth = 0.86): Shape | null {
    let poly: Polygon, expanded: Polygon;
    if (points.length === 1) {
      const h = singletonWidth / 2;
      poly = rect(points[0]!.x - h, points[0]!.y - h, singletonWidth, singletonWidth);
      expanded = rect(
        points[0]!.x - h - gap,
        points[0]!.y - h - gap,
        singletonWidth + gap * 2,
        singletonWidth + gap * 2,
      );
    } else {
      const sample = skeleton(points, 0.46 + 0.03 * Math.max(0, Math.min(1, softness / 0.46)));
      poly = ribbon(sample, 0.9);
      expanded = ribbon(sample, 0.9 + gap * 2, gap);
    }
    const b = bounds(poly),
      owned = points.map(idOf),
      ownedSet = new Set(owned);
    if (b[0]! < -1e-6 || b[1]! < -1e-6 || b[2]! > n + 1e-6 || b[3]! > n + 1e-6) return null;
    // Ensure one simple unperforated silhouette. Self-overlapping offset curves
    // never survive this check; they get split at the path level.
    const normalized = polygonClipping.union([poly]) as Multi;
    if (normalized.length !== 1 || normalized[0]!.length !== 1) return null;
    for (let y = Math.max(0, Math.floor(b[1]!)); y < Math.min(n, Math.ceil(b[3]!)); y++)
      for (let x = Math.max(0, Math.floor(b[0]!)); x < Math.min(n, Math.ceil(b[2]!)); x++) {
        const id = y * n + x;
        if (reserved[id]) {
          if (area(polygonClipping.intersection([poly], [rect(x, y, 1, 1)]) as Multi) > 1e-8)
            return null;
        } else if (ownedSet.has(id)) {
          if (
            area(
              polygonClipping.difference([rect(x + 0.34, y + 0.34, 0.32, 0.32)], [poly]) as Multi,
            ) > 1e-8
          )
            return null;
        } else {
          if (
            area(
              polygonClipping.intersection([poly], [rect(x + 0.34, y + 0.34, 0.32, 0.32)]) as Multi,
            ) > 1e-8
          )
            return null;
          if (
            matrix[id] &&
            area(
              polygonClipping.intersection(
                [expanded],
                [rect(x + 0.14, y + 0.14, 0.72, 0.72)],
              ) as Multi,
            ) > 1e-8
          )
            return null;
        }
      }
    for (const g of obstacles())
      if (
        nearby(b, g.bounds, gap) &&
        area(polygonClipping.intersection([expanded], g.polygons) as Multi) > 1e-8
      )
        return null;
    return {
      polygons: [poly],
      expanded: [expanded],
      bounds: b,
      owned,
      type: "fill",
      score: 0,
      x: points[0]!.x,
      y: points[0]!.y,
    };
  }
  function fill(points: Point[]) {
    if (!points.length) return;
    let c: Shape | null = null;
    if (points.length === 1) {
      for (const width of [0.86, 0.78, 0.72]) {
        c = candidate(points, 0.06, width);
        if (c) break;
      }
    } else c = candidate(points);
    if (c) {
      fills.push(c);
      for (const id of c.owned) free.delete(id);
      return;
    }
    if (points.length > 1) {
      const mid = Math.floor(points.length / 2);
      fill(points.slice(0, mid));
      fill(points.slice(mid));
    }
    // Singleton failure signals that macro/fallback placement allowed a conflict.
    // Do not silently patch it or drop data: the caller must reject this layout.
  }
  for (const old of paths) {
    let chunk: Point[] = [];
    for (const p of [...old, null])
      if (p && free.has(idOf(p))) chunk.push(p);
      else {
        fill(chunk);
        chunk = [];
      }
  }
  for (const id of [...free]) fill([{ x: (id % n) + 0.5, y: Math.floor(id / n) + 0.5, id }]);
  return { fills, unfilled: [...free] };
}
