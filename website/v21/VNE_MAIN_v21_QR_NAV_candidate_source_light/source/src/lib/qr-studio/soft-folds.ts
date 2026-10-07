import polygonClipping from "polygon-clipping";
import { foldedLayout } from "./folded-layout";
import type { MacroLayout, QrMatrix, Vec } from "./macro-glyphs";
const area = (m: number[][][][]) =>
  m.reduce(
    (sum, p) =>
      sum +
      p.reduce((sum, r, hole) => {
        let a = 0;
        for (let i = 1; i < r.length; i++)
          a += r[i - 1]![0]! * r[i]![1]! - r[i]![0]! * r[i - 1]![1]!;
        return sum + ((hole ? -1 : 1) * Math.abs(a)) / 2;
      }, 0),
    0,
  );
function roundRing(input: Vec[], radius: number, protectedEnds: Vec[]) {
  const ring = input.slice(0, -1);
  let signed = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!,
      b = ring[(i + 1) % ring.length]!;
    signed += a[0] * b[1] - b[0] * a[1];
  }
  const out: Vec[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length]!,
      b = ring[i]!,
      c = ring[(i + 1) % ring.length]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (
      cross * Math.sign(signed) <= 1e-8 ||
      protectedEnds.some(
        ([x, y]) =>
          b[0] >= x - 1e-7 && b[0] <= x + 1 + 1e-7 && b[1] >= y - 1e-7 && b[1] <= y + 1 + 1e-7,
      )
    ) {
      out.push(b);
      continue;
    }
    const before = Math.hypot(b[0] - a[0], b[1] - a[1]),
      after = Math.hypot(c[0] - b[0], c[1] - b[1]),
      r = Math.min(radius, before * 0.49, after * 0.49);
    const enter: Vec = [b[0] + ((a[0] - b[0]) * r) / before, b[1] + ((a[1] - b[1]) * r) / before],
      leave: Vec = [b[0] + ((c[0] - b[0]) * r) / after, b[1] + ((c[1] - b[1]) * r) / after];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      out.push([
        (1 - t) ** 2 * enter[0] + 2 * (1 - t) * t * b[0] + t * t * leave[0],
        (1 - t) ** 2 * enter[1] + 2 * (1 - t) * t * b[1] + t * t * leave[1],
      ]);
    }
  }
  out.push(out[0]!);
  return out;
}
export function softFoldedLayout(qr: QrMatrix): MacroLayout {
  const layout = foldedLayout(qr),
    n = layout.size;
  return {
    ...layout,
    glyphs: layout.glyphs.map((g) => {
      for (const radius of [0.58, 0.42, 0.28, 0.14, 0]) {
        const ends = [g.owned[0]!, g.owned[g.owned.length - 1]!].map((id): Vec => [
          id % n,
          Math.floor(id / n),
        ]);
        const polygons = g.polygons.map((p) => [roundRing(p[0]!, radius, ends), ...p.slice(1)]);
        const safe = g.owned.every((id) => {
          const x = id % n,
            y = Math.floor(id / n),
            core: polygonClipping.Polygon = [
              [
                [x + 0.34, y + 0.34],
                [x + 0.66, y + 0.34],
                [x + 0.66, y + 0.66],
                [x + 0.34, y + 0.66],
                [x + 0.34, y + 0.34],
              ],
            ];
          return area(polygonClipping.difference(core, polygons)) < 1e-8;
        });
        if (safe) return { ...g, polygons, expanded: polygons };
      }
      throw Error("No protected ribbon shape");
    }),
  };
}
