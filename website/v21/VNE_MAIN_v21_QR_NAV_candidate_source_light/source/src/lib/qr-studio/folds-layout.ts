import polygonClipping from "polygon-clipping";
import {
  foldsLayout as baseFoldsLayout,
  scoreFoldsMatrix,
  polygonsPath,
  type QrMatrix,
  type Vec,
  type FoldRibbon as BaseRibbon,
  type FoldsLayout as BaseLayout,
} from "./folds-base-layout";
export { scoreFoldsMatrix, polygonsPath };
export const RESERVED_PIXEL_HALO = 0.25;
export function reservedHalo(qr: QrMatrix): Vec[][][] {
  const n = qr.modules.size,
    parts: Vec[][][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.isReserved(y, x))
        parts.push(
          box(x - RESERVED_PIXEL_HALO, y - RESERVED_PIXEL_HALO, 0, 1 + RESERVED_PIXEL_HALO * 2),
        );
  return polygonClipping.intersection(
    polygonClipping.union(parts[0]!, ...parts.slice(1)),
    box(0, 0, 0, n),
  );
}
export type { QrMatrix, Vec };
export type FoldRibbon = BaseRibbon & {
  baseWidth: number;
  requestedWidth: number;
  thicknessTarget: 1.2 | 1.4;
  clippedArea: number;
  fullRequestedWidth: boolean;
};
export type FoldsLayout = Omit<BaseLayout, "ribbons"> & {
  ribbons: FoldRibbon[];
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
const direction = (a: Vec, b: Vec): Vec => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
function outline(line: Vec[], width: number): Vec[][][] {
  const left: Vec[] = [],
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
    const scale = width / 2 / Math.max(0.5, nx * -after[1] + ny * after[0]);
    left.push([p[0] + nx * scale, p[1] + ny * scale]);
    right.push([p[0] - nx * scale, p[1] - ny * scale]);
  }
  return polygonClipping.union([[[...left, ...right.reverse(), left[0]!]]]);
}
/** Thickness-only transformation of the frozen v1 centreline, ownership and
 * matrix score. No changes to encoding, mask ranking, routing or finder data. */
export function foldsLayout(qr: QrMatrix): FoldsLayout {
  const base = baseFoldsLayout(qr),
    n = base.size,
    halo = reservedHalo(qr);
  const ribbons = base.ribbons.map((original) => {
    const single = original.owned.length === 1,
      baseWidth = single ? 0.89 : 0.96;
    const proposal = (factor: number) => {
      const width = baseWidth * factor,
        p = original.points[0]!;
      return single
        ? [box(p[0] - width / 2, p[1] - width / 2, 0, width)]
        : outline(original.centreline, width);
    };
    const blockersFor = (polygons: Vec[][][]) => {
      const points = polygons.flat(2),
        bounds: [number, number, number, number] = [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
        blockers: Vec[][][] = [];
      for (let y = Math.max(0, Math.floor(bounds[1])); y < Math.min(n, Math.ceil(bounds[3])); y++)
        for (
          let x = Math.max(0, Math.floor(bounds[0]));
          x < Math.min(n, Math.ceil(bounds[2]));
          x++
        ) {
          const cell = y * n + x;
          if (base.reserved[cell]) blockers.push(box(x, y));
          else if (!base.matrix[cell]) blockers.push(box(x, y, 0.33, 0.67));
        }
      return { bounds, blockers };
    };
    const protectedShape = (polygons: Vec[][][]) => {
      const { blockers } = blockersFor(polygons);
      const safe = polygonClipping.intersection(
        blockers.length ? polygonClipping.difference(polygons, ...blockers) : polygons,
        box(0, 0, 0, n),
      );
      return polygonClipping.union(
        polygonClipping.difference(safe, halo),
        polygonClipping.intersection(original.polygons, halo),
      );
    };
    // +40% only for a long ribbon whose entire wide silhouette fits all protected
    // cells and QR bounds. Otherwise +20% is requested and safety-clipped locally.
    const wide = proposal(1.4),
      safeWide = protectedShape(wide),
      wideFits =
        original.owned.length >= 4 && area(polygonClipping.difference(wide, safeWide)) < 1e-8;
    const thicknessTarget = wideFits ? 1.4 : 1.2,
      requestedWidth = baseWidth * thicknessTarget,
      raw = wideFits ? wide : proposal(1.2),
      polygons = wideFits ? safeWide : protectedShape(raw),
      clippedArea = area(polygonClipping.difference(raw, polygons));
    if (
      !original.owned.every(
        (cell) =>
          area(
            polygonClipping.difference(box(cell % n, Math.floor(cell / n), 0.34, 0.66), polygons),
          ) < 1e-8,
      )
    )
      throw Error("Thickness lost a protected data core");
    const { bounds } = blockersFor(polygons);
    return {
      ...original,
      polygons,
      bounds,
      width: requestedWidth,
      baseWidth,
      requestedWidth,
      thicknessTarget,
      clippedArea,
      fullRequestedWidth: clippedArea < 1e-8,
    } as FoldRibbon;
  });
  return { ...base, ribbons };
}
