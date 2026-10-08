import type { QrMatrix } from "./macro-glyphs";
type Point = { x: number; y: number; id: number };
const f = (v: number) => Number(v.toFixed(3));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function glyphLayout(qr: QrMatrix, flow: boolean) {
  const n = qr.modules.size;
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && !!qr.modules.get(y, x);
  const nodes = new Map<number, Point>();
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (dark(x, y) && !qr.modules.isReserved(y, x))
        nodes.set(y * n + x, { x: x + 0.5, y: y + 0.5, id: y * n + x });
  const adjacent = new Map<number, number[]>();
  for (const p of nodes.values()) {
    const list: number[] = [];
    const x = p.x - 0.5,
      y = p.y - 0.5;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const id = (y + dy) * n + x + dx;
        if (!nodes.has(id) || x + dx < 0 || x + dx >= n || y + dy < 0 || y + dy >= n) continue;
        // Diagonal bridges cross a pair of light corners, never a functional module or a black branch.
        if (
          dx &&
          dy &&
          (dark(x + dx, y) ||
            dark(x, y + dy) ||
            qr.modules.isReserved(y, x + dx) ||
            qr.modules.isReserved(y + dy, x))
        )
          continue;
        list.push(id);
      }
    adjacent.set(p.id, list);
  }
  const free = new Set(nodes.keys()),
    paths: Point[][] = [];
  // A glyph cannot fold back against itself: these hairpins close the interior
  // counter and look like tangled pipes instead of the reference's open letters.
  const openPath = (ids: number[]) =>
    ids.every((id, i) =>
      ids
        .slice(0, Math.max(0, i - 2))
        .every((other) => dist(nodes.get(id)!, nodes.get(other)!) > 1.01),
    );
  function grade(ids: number[]) {
    let score = ids.length * 4;
    let bends = 0;
    let previousTurn = 0;
    for (let i = 1; i < ids.length; i++) {
      const a = nodes.get(ids[i - 1]!)!,
        b = nodes.get(ids[i]!)!;
      if (a.x !== b.x && a.y !== b.y) score += flow ? 1.2 : -0.7;
    }
    for (let i = 2; i < ids.length; i++) {
      const a = nodes.get(ids[i - 2]!)!,
        b = nodes.get(ids[i - 1]!)!,
        c = nodes.get(ids[i]!)!;
      const dot =
        ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (dist(a, b) * dist(b, c));
      if (dot < 0.95) bends++;
      score += dot < -0.1 ? -3 : dot < 0.9 ? 1.2 : 0.3;
      const turn = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
      if (turn && previousTurn) score += turn !== previousTurn ? 1.4 : -0.8;
      if (turn) previousTurn = turn;
    }
    return score - Math.max(0, bends - 3) * 1.1;
  }
  while (free.size) {
    const starts = [...free].sort(
      (a, b) =>
        adjacent.get(a)!.filter((x) => free.has(x)).length -
          adjacent.get(b)!.filter((x) => free.has(x)).length || a - b,
    );
    const start = starts[0]!;
    let beam = [[start]],
      best = [start],
      bestScore = grade(best);
    for (let depth = 0; depth < 10; depth++) {
      const next: number[][] = [];
      for (const path of beam)
        for (const id of adjacent.get(path[path.length - 1]!)!) {
          if (!free.has(id) || path.includes(id)) continue;
          const p = [...path, id];
          if (!openPath(p)) continue;
          next.push(p);
          const score = grade(p);
          if (score > bestScore) {
            best = p;
            bestScore = score;
          }
        }
      if (!next.length) break;
      beam = next
        .sort((a, b) => grade(b) - grade(a) || a[a.length - 1]! - b[b.length - 1]!)
        .slice(0, 8);
    }
    paths.push(best.map((id) => nodes.get(id)!));
    for (const id of best) free.delete(id);
  }
  // Join compatible loose ends, reducing small fragments without introducing branches.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < paths.length; i++) {
      if (paths[i]!.length > 8) continue;
      let merged = false;
      for (let j = i + 1; j < paths.length && !merged; j++) {
        if (paths[i]!.length + paths[j]!.length > 12) continue;
        for (const reverseA of [false, true])
          for (const reverseB of [false, true]) {
            if (merged) continue;
            const a = reverseA ? [...paths[i]!].reverse() : paths[i]!,
              b = reverseB ? [...paths[j]!].reverse() : paths[j]!;
            if (
              adjacent.get(a[a.length - 1]!.id)!.includes(b[0]!.id) &&
              openPath([...a, ...b].map((p) => p.id))
            ) {
              paths[i] = [...a, ...b];
              paths.splice(j, 1);
              merged = true;
            }
          }
      }
    }
  let score = 0;
  for (const path of paths)
    score +=
      path.length === 1 ? -8 : path.length === 2 ? -2 : path.length >= 4 ? path.length * 1.5 : 1;
  // Flow favours longer sweeping diagonals, while Syncopa favours paired bends.
  if (flow)
    for (const path of paths)
      for (let i = 1; i < path.length; i++)
        if (path[i]!.x !== path[i - 1]!.x && path[i]!.y !== path[i - 1]!.y) score += 0.5;
  return { paths, score };
}
export function glyphPath(points: Point[], softness: number, flow: boolean) {
  if (points.length === 1) {
    const p = points[0]!;
    return { d: `M${f(p.x - 0.43)} ${f(p.y - 0.43)}h.86v.86h-.86Z`, fill: true };
  }
  const first = points[0]!,
    second = points[1]!,
    last = points[points.length - 1]!,
    previous = points[points.length - 2]!;
  const extend = (p: Point, other: Point, amount: number) => ({
    x: p.x + ((p.x - other.x) / dist(p, other)) * amount,
    y: p.y + ((p.y - other.y) / dist(p, other)) * amount,
  });
  const start = extend(first, second, 0.4),
    end = extend(last, previous, 0.4);
  let d = `M${f(start.x)} ${f(start.y)}L${f(first.x)} ${f(first.y)}`;
  // Quadratic fillets of the skeleton. Every protected module centre remains within its stroke.
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      c = points[i + 1]!;
    const r1 = Math.min(dist(a, b) / 2, 0.72) * (0.35 + (softness / 0.46) * 0.65);
    const r2 = Math.min(dist(b, c) / 2, 0.72) * (0.35 + (softness / 0.46) * 0.65);
    const before = extend(b, a, -r1),
      after = extend(b, c, -r2);
    d += `L${f(before.x)} ${f(before.y)}Q${f(b.x)} ${f(b.y)} ${f(after.x)} ${f(after.y)}`;
  }
  d += `L${f(last.x)} ${f(last.y)}L${f(end.x)} ${f(end.y)}`;
  // Flow has explicit 45° cuts on flat terminal corners; cuts stay inside
  // their owned endpoint module and away from its protected centre.
  let cuts = "";
  if (flow)
    for (const [p, other] of [
      [first, second],
      [last, previous],
    ]) {
      const length = dist(p!, other!),
        ux = (p!.x - other!.x) / length,
        uy = (p!.y - other!.y) / length;
      const px = -uy,
        py = ux;
      const point = (u: number, v: number) =>
        `${f(p!.x + ux * u + px * v)} ${f(p!.y + uy * u + py * v)}`;
      cuts += `M${point(0.56, 0.62)}L${point(0.055, 0.62)}L${point(0.56, 0.125)}Z`;
    }
  return { d, fill: false, cuts };
}
