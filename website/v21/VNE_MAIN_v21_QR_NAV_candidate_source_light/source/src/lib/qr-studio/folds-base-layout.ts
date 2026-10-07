import polygonClipping from "polygon-clipping";
export type Vec = [number, number];
export type QrMatrix = {
  modules: {
    size: number;
    get(y: number, x: number): number | boolean;
    isReserved(y: number, x: number): number | boolean;
  };
};
export type FoldRibbon = {
  owned: number[];
  points: Vec[];
  centreline: Vec[];
  polygons: Vec[][][];
  bounds: [number, number, number, number];
  turns: number;
  width: number;
};
export type FoldsLayout = {
  size: number;
  ribbons: FoldRibbon[];
  score: number;
  matrix: boolean[];
  reserved: boolean[];
};
const area = (m: Vec[][][]) =>
  m.reduce(
    (s, p) =>
      s +
      p.reduce((s, r, h) => {
        let a = 0;
        for (let i = 1; i < r.length; i++) a += r[i - 1]![0] * r[i]![1] - r[i]![0] * r[i - 1]![1];
        return s + ((h ? -1 : 1) * Math.abs(a)) / 2;
      }, 0),
    0,
  );
const box = (x: number, y: number, a = 0, b = 1): Vec[][] => [
  [
    [x + a, y + a],
    [x + b, y + a],
    [x + b, y + b],
    [x + a, y + b],
    [x + a, y + a],
  ],
];
const distance = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function direction(a: Vec, b: Vec): Vec {
  const length = distance(a, b);
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
}
function smooth(points: Vec[], radius: number): Vec[] {
  if (points.length < 2) return points;
  const result: Vec[] = [],
    first = points[0]!,
    last = points.at(-1)!,
    u = direction(first, points[1]!),
    v = direction(points.at(-2)!, last);
  result.push([first[0] - u[0] * 0.43, first[1] - u[1] * 0.43], first);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      c = points[i + 1]!,
      incoming = direction(a, b),
      outgoing = direction(b, c);
    if (incoming[0] === outgoing[0] && incoming[1] === outgoing[1]) {
      result.push(b);
      continue;
    }
    const r = Math.min(radius, distance(a, b) * 0.48, distance(b, c) * 0.48),
      start: Vec = [b[0] - incoming[0] * r, b[1] - incoming[1] * r],
      end: Vec = [b[0] + outgoing[0] * r, b[1] + outgoing[1] * r];
    result.push(start);
    for (let j = 1; j <= 16; j++) {
      const t = j / 16;
      result.push([
        (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * b[0] + t * t * end[0],
        (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * b[1] + t * t * end[1],
      ]);
    }
  }
  result.push(last, [last[0] + v[0] * 0.43, last[1] + v[1] * 0.43]);
  return result.filter((p, i) => i === 0 || distance(p, result[i - 1]!) > 1e-7);
}
function outline(line: Vec[], width: number): Vec[][][] {
  const half = width / 2,
    left: Vec[] = [],
    right: Vec[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!,
      before = direction(line[Math.max(0, i - 1)]!, line[i === 0 ? 1 : i]!),
      after = direction(
        line[i === line.length - 1 ? i - 1 : i]!,
        line[Math.min(line.length - 1, i + 1)]!,
      );
    let nx = -(before[1] + after[1]),
      ny = before[0] + after[0];
    const length = Math.hypot(nx, ny);
    nx /= length;
    ny /= length;
    const lengthScale = half / Math.max(0.5, nx * -after[1] + ny * after[0]);
    left.push([p[0] + nx * lengthScale, p[1] + ny * lengthScale]);
    right.push([p[0] - nx * lengthScale, p[1] - ny * lengthScale]);
  }
  const ring = [...left, ...right.reverse(), left[0]!];
  return [[ring]];
}
/** Folds-specific orthogonal path planner. No Origami layout, diagonal bridges,
 * cut terminal triangles, shared matrix scorer, or glyphLayout dependency. */
export function foldsLayout(qr: QrMatrix): FoldsLayout {
  const n = qr.modules.size;
  if (!Number.isInteger(n) || n < 21 || n > 177 || (n - 17) % 4 !== 0)
    throw Error("Invalid QR matrix size");
  const matrix = Array.from(
      { length: n * n },
      (_, id) => !!qr.modules.get(Math.floor(id / n), id % n),
    ),
    reserved = Array.from(
      { length: n * n },
      (_, id) => !!qr.modules.isReserved(Math.floor(id / n), id % n),
    );
  const free = new Set(matrix.flatMap((v, id) => (v && !reserved[id] ? [id] : [])));
  const adjacent = (id: number) => {
    const x = id % n,
      y = Math.floor(id / n);
    return [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
      .filter(([x, y]) => x! >= 0 && y! >= 0 && x! < n && y! < n)
      .map(([x, y]) => y! * n + x!)
      .filter((id) => free.has(id));
  };
  const point = (id: number): Vec => [(id % n) + 0.5, Math.floor(id / n) + 0.5];
  const turnCount = (ids: number[]) =>
    ids.slice(2).reduce((t, id, k) => t + Number(id - ids[k + 1]! !== ids[k + 1]! - ids[k]!), 0);
  const quality = (ids: number[]) => {
    let score = ids.length * 5,
      run = 1,
      turns = 0;
    for (let i = 2; i < ids.length; i++) {
      if (ids[i]! - ids[i - 1]! === ids[i - 1]! - ids[i - 2]!) run++;
      else {
        score += run * run * 0.9;
        run = 1;
        turns++;
      }
    }
    return score + run * run * 0.9 + (turns > 0 && turns <= 2 ? 4 : 0) - Math.max(0, turns - 2) * 9;
  };
  const chains: number[][] = [];
  while (free.size) {
    const starts = [...free].sort((a, b) => adjacent(a).length - adjacent(b).length || a - b),
      start = starts[0]!;
    let beam = [[start]],
      best = [start],
      bestScore = quality(best);
    for (let depth = 0; depth < 19; depth++) {
      const next: number[][] = [];
      for (const path of beam)
        for (const candidate of adjacent(path.at(-1)!)) {
          if (path.includes(candidate)) continue;
          // Separated open ribbons: no coils, self-touching maze or square loops.
          if (path.slice(0, -2).some((id) => distance(point(id), point(candidate)) < 1.1)) continue;
          const p = [...path, candidate];
          if (turnCount(p) > 3) continue;
          next.push(p);
          const score = quality(p);
          if (score > bestScore) {
            best = p;
            bestScore = score;
          }
        }
      if (!next.length) break;
      beam = next.sort((a, b) => quality(b) - quality(a) || a.at(-1)! - b.at(-1)!).slice(0, 12);
    }
    chains.push(best);
    for (const id of best) free.delete(id);
  }
  const ribbons: FoldRibbon[] = chains.map((owned) => {
    const points = owned.map(point),
      turns = turnCount(owned);
    if (owned.length === 1) {
      const p = points[0]!,
        polygons = [box(p[0] - 0.5, p[1] - 0.5, 0.055, 0.945)];
      return {
        owned,
        points,
        centreline: points,
        polygons,
        bounds: [p[0] - 0.445, p[1] - 0.445, p[0] + 0.445, p[1] + 0.445],
        turns: 0,
        width: 0.89,
      };
    }
    // Removing collinear waypoints lets a broad turn extend beyond one cell.
    const anchors = points.filter(
      (p, i) =>
        i === 0 ||
        i === points.length - 1 ||
        (p[0] - points[i - 1]![0]) * (points[i + 1]![1] - p[1]) !==
          (p[1] - points[i - 1]![1]) * (points[i + 1]![0] - p[0]),
    );
    for (const radius of [0.64, 0.55, 0.45, 0.3, 0]) {
      const centreline = smooth(anchors, radius),
        width = 0.96;
      let polygons = outline(centreline, width);
      const vertices = polygons.flat(2),
        bounds: [number, number, number, number] = [
          Math.min(...vertices.map((p) => p[0])),
          Math.min(...vertices.map((p) => p[1])),
          Math.max(...vertices.map((p) => p[0])),
          Math.max(...vertices.map((p) => p[1])),
        ];
      const blockers: Vec[][][] = [];
      for (let y = Math.max(0, Math.floor(bounds[1])); y < Math.min(n, Math.ceil(bounds[3])); y++)
        for (
          let x = Math.max(0, Math.floor(bounds[0]));
          x < Math.min(n, Math.ceil(bounds[2]));
          x++
        ) {
          const id = y * n + x;
          if (reserved[id]) blockers.push(box(x, y));
          else if (!matrix[id]) blockers.push(box(x, y, 0.33, 0.67));
        }
      if (blockers.length) polygons = polygonClipping.difference(polygons, ...blockers);
      polygons = polygonClipping.intersection(polygons, box(0, 0, 0, n));
      if (
        owned.every(
          (id) =>
            area(
              polygonClipping.difference(box(id % n, Math.floor(id / n), 0.34, 0.66), polygons),
            ) < 1e-8,
        )
      )
        return { owned, points, centreline, polygons, bounds, turns, width };
    }
    throw Error("Unable to preserve complete Folds core");
  });
  const score = ribbons.reduce(
    (s, r) =>
      s +
      (r.owned.length >= 4 ? r.owned.length * 5 : 0) -
      Number(r.owned.length === 1) * 8 -
      r.turns * 1.5,
    0,
  );
  return { size: n, ribbons, score, matrix, reserved };
}
export function scoreFoldsMatrix(qr: QrMatrix) {
  const n = qr.modules.size,
    dark = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < n && y < n && qr.modules.get(y, x) && !qr.modules.isReserved(y, x);
  let score = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!dark(x, y)) continue;
      const degree =
        Number(dark(x - 1, y)) +
        Number(dark(x + 1, y)) +
        Number(dark(x, y - 1)) +
        Number(dark(x, y + 1));
      score += degree === 0 ? -12 : degree === 2 ? 3 : 0;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        if (dark(x - dx!, y - dy!)) continue;
        let len = 1;
        while (dark(x + dx! * len, y + dy! * len)) len++;
        if (len >= 3) score += len * len;
      }
    }
  return score;
}
export function polygonsPath(polygons: Vec[][][]) {
  return polygons
    .map((p) =>
      p
        .map(
          (r) =>
            r
              .map(
                (v, i) => `${i ? "L" : "M"}${Number(v[0].toFixed(4))} ${Number(v[1].toFixed(4))}`,
              )
              .join("") + "Z",
        )
        .join(""),
    )
    .join("");
}
