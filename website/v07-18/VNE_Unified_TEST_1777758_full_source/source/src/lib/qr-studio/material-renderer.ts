/**
 * Procedural material QR renderer for VNE.
 *
 * All shapes are derived from a real QR matrix. Materials never paint outside
 * the data mask; reserved cells are drawn separately without material noise.
 * The caller supplies the surrounding background and the four-module quiet zone.
 * No requests, random state, fonts, images or runtime dependencies are used.
 */
export const MATERIAL_SURFACES = [
  "ribs",
  "folds",
  "enamel",
  "relief",
  "basalt",
  "portals",
  "weave",
  "origami",
  "constellation",
  "marble",
] as const;
export type MaterialSurface = (typeof MATERIAL_SURFACES)[number];
export type MaterialMatrix = {
  modules: {
    size: number;
    get(row: number, column: number): number | boolean;
    isReserved(row: number, column: number): number | boolean;
  };
};
export type MaterialOptions = {
  surface: MaterialSurface;
  foreground: string;
  background: string;
  accent: string;
  accents: boolean;
};
type Point = [number, number];
type Edge = { a: Point; b: Point; direction: number; used: boolean };
const fmt = (v: number) => Number(v.toFixed(3));
const point = (p: Point) => `${fmt(p[0])} ${fmt(p[1])}`;
const key = (p: Point) => `${p[0]},${p[1]}`;
const mix = (a: string, b: string, amount: number) => {
  const av = a.replace("#", ""),
    bv = b.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(av) || !/^[\da-f]{6}$/i.test(bv))
    throw new Error("Material QR colours must use six-digit hex values.");
  return (
    "#" +
    [0, 2, 4]
      .map((i) =>
        Math.round(
          parseInt(av.slice(i, i + 2), 16) * (1 - amount) +
            parseInt(bv.slice(i, i + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
const luminance = (hex: string) => {
  const v = hex.slice(1);
  return (
    0.2126 * parseInt(v.slice(0, 2), 16) +
    0.7152 * parseInt(v.slice(2, 4), 16) +
    0.0722 * parseInt(v.slice(4, 6), 16)
  );
};
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  radius = 0,
  extra = "",
) =>
  `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" rx="${fmt(radius)}" fill="${fill}"${extra}/>`;
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;

/** Trace a square-cell union, then round only its boundary vertices. */
function contour(n: number, dark: (x: number, y: number) => boolean, radius: number): string {
  const edges: Edge[] = [];
  const starts = new Map<string, number[]>();
  function add(a: Point, b: Point, direction: number) {
    const index = edges.length;
    edges.push({ a, b, direction, used: false });
    const k = key(a);
    const entries = starts.get(k) ?? [];
    entries.push(index);
    starts.set(k, entries);
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (dark(x, y)) {
        if (!dark(x, y - 1)) add([x, y], [x + 1, y], 0);
        if (!dark(x + 1, y)) add([x + 1, y], [x + 1, y + 1], 1);
        if (!dark(x, y + 1)) add([x + 1, y + 1], [x, y + 1], 2);
        if (!dark(x - 1, y)) add([x, y + 1], [x, y], 3);
      }
  let d = "";
  for (const first of edges) {
    if (first.used) continue;
    const vertices: Point[] = [];
    let edge = first;
    for (let guard = 0; guard <= edges.length; guard++) {
      edge.used = true;
      vertices.push(edge.a);
      if (key(edge.b) === key(first.a)) break;
      // At diagonal contacts, turn right into the same component.
      const next = (starts.get(key(edge.b)) ?? [])
        .map((i) => edges[i]!)
        .filter((e) => !e.used)
        .sort(
          (a, b) =>
            [1, 0, 3, 2].indexOf((a.direction - edge.direction + 4) % 4) -
            [1, 0, 3, 2].indexOf((b.direction - edge.direction + 4) % 4),
        )[0];
      if (!next) throw new Error("Material QR contour is not closed.");
      edge = next;
    }
    const corners = vertices.filter((v, i) => {
      const p = vertices[(i + vertices.length - 1) % vertices.length]!,
        q = vertices[(i + 1) % vertices.length]!;
      return (v[0] - p[0]) * (q[1] - v[1]) !== (v[1] - p[1]) * (q[0] - v[0]);
    });
    const pairs = corners.map((v, i) => {
      const p = corners[(i + corners.length - 1) % corners.length]!,
        q = corners[(i + 1) % corners.length]!;
      const lp = Math.hypot(v[0] - p[0], v[1] - p[1]),
        lq = Math.hypot(q[0] - v[0], q[1] - v[1]);
      const r = Math.min(radius, lp / 2, lq / 2);
      return {
        v,
        enter: [v[0] + ((p[0] - v[0]) * r) / lp, v[1] + ((p[1] - v[1]) * r) / lp] as Point,
        leave: [v[0] + ((q[0] - v[0]) * r) / lq, v[1] + ((q[1] - v[1]) * r) / lq] as Point,
      };
    });
    if (!pairs.length) continue;
    d += `M${point(pairs[0]!.enter)}`;
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]!;
      if (i) d += `L${point(p.enter)}`;
      d += `Q${point(p.v)} ${point(p.leave)}`;
    }
    d += "Z";
  }
  return d;
}

export function renderMaterialQr(qr: MaterialMatrix, options: MaterialOptions): string {
  const { surface, foreground: fg, background: bg, accent, accents } = options;
  if (!MATERIAL_SURFACES.includes(surface)) throw new Error("Unknown material QR surface.");
  // Validate before interpolating colours in SVG attributes.
  mix(fg, bg, 0);
  mix(accent, bg, 0);
  const n = qr.modules.size;
  if (!Number.isInteger(n) || n < 21 || n > 177) throw new Error("Invalid QR matrix size.");
  const light = luminance(fg) > luminance(bg);
  // A narrow lightness band keeps 8-pixel local threshold windows from
  // interpreting the material texture as new QR cells at large export sizes.
  const highlight = light ? mix(fg, "#ffffff", 0.1) : mix(fg, "#ffffff", 0.085);
  const shade = mix(fg, bg, light ? 0.06 : 0.08);
  const mildShade = mix(fg, bg, 0.035);
  // Mandarine is a material colour on a dark ground. On light grounds it is
  // confined to a narrow inset edge, keeping cell centres dark and high contrast.
  const warm = light ? accent : mix(fg, accent, 0.28);
  const warmHighlight = light ? mix(accent, "#ffffff", 0.055) : mix(warm, "#ffffff", 0.055);
  const warmShade = mix(warm, bg, 0.055);
  const isDark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && Boolean(qr.modules.get(y, x));
  const isData = (x: number, y: number) => isDark(x, y) && !qr.modules.isReserved(y, x);
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let seed = 2166136261;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) seed = Math.imul(seed ^ Number(isDark(x, y)), 16777619);
  const id = `vne-mat-${surface}-${(seed >>> 0).toString(36)}-${fg.slice(1)}-${bg.slice(1)}-${accent.slice(1)}-${Number(accents)}`;
  const url = (name: string) => `url(#${id}-${name})`;
  const radius = {
    ribs: 0.44,
    folds: 0.13,
    enamel: 0.44,
    relief: 0.42,
    basalt: 0.025,
    portals: 0.04,
    weave: 0.13,
    origami: 0.055,
    constellation: 0.44,
    marble: 0.42,
  }[surface];
  const silhouette = contour(n, isData, radius);
  const textureInk = light ? mix(fg, bg, 0.05) : mix(fg, "#ffffff", 0.07);
  const marbleInk = accents ? (light ? mix(accent, fg, 0.32) : mix(fg, accent, 0.32)) : highlight;
  let defs = `<defs><clipPath id="${id}-mask">${path(silhouette, "#fff", ' fill-rule="evenodd"')}</clipPath>`;
  defs += `<linearGradient id="${id}-mint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${highlight}"/><stop offset=".32" stop-color="${fg}"/><stop offset=".77" stop-color="${mildShade}"/><stop offset="1" stop-color="${shade}"/></linearGradient>`;
  defs += `<linearGradient id="${id}-warm" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="${warmHighlight}"/><stop offset=".38" stop-color="${warm}"/><stop offset="1" stop-color="${warmShade}"/></linearGradient>`;
  defs += `<radialGradient id="${id}-bead" cx=".30" cy=".24" r=".85"><stop stop-color="${mix(fg, light ? "#ffffff" : fg, 0.16)}"/><stop offset=".34" stop-color="${fg}"/><stop offset=".8" stop-color="${mix(fg, bg, 0.04)}"/><stop offset="1" stop-color="${mix(fg, bg, 0.075)}"/></radialGradient>`;
  defs += `<radialGradient id="${id}-warm-bead" cx=".30" cy=".24" r=".85"><stop stop-color="${warmHighlight}"/><stop offset=".4" stop-color="${warm}"/><stop offset="1" stop-color="${warmShade}"/></radialGradient>`;
  defs += `<pattern id="${id}-weave" patternUnits="userSpaceOnUse" width=".44" height=".44"><path d="M-.11 0L.11 .22L-.11 .44M.11 0L.33 .22L.11 .44M.33 0L.55 .22L.33 .44" fill="none" stroke="${highlight}" stroke-width=".045"/><path d="M0 0L.22 .22L0 .44M.22 0L.44 .22L.22 .44M.44 0L.66 .22L.44 .44" fill="none" stroke="${textureInk}" stroke-width=".033"/></pattern>`;
  defs += `<pattern id="${id}-warm-weave" patternUnits="userSpaceOnUse" width=".44" height=".44"><path d="M-.11 0L.11 .22L-.11 .44M.11 0L.33 .22L.11 .44M.33 0L.55 .22L.33 .44" fill="none" stroke="${warmHighlight}" stroke-width=".045"/><path d="M0 0L.22 .22L0 .44M.22 0L.44 .22L.22 .44M.44 0L.66 .22L.44 .44" fill="none" stroke="${warmShade}" stroke-width=".033"/></pattern>`;
  defs += `<pattern id="${id}-stone" patternUnits="userSpaceOnUse" width="3" height="3"><path d="M0 .3L.6 .12L1.1 .44L1.8 .05L2.4 .34L3 .18M.1 2.8L.35 2.1L.18 1.4L.44 .7M1.6 3L1.25 2.4L1.68 1.9L1.45 1.3L1.75 .7M3 1.4L2.4 1.75L2.05 1.44" fill="none" stroke="${highlight}" stroke-width=".027" opacity=".7"/></pattern>`;
  defs += `<pattern id="${id}-marble" patternUnits="userSpaceOnUse" width="5" height="5"><path d="M-.5 2.8C.8 3.1 .6 1.7 1.55 1.85S2.2 .3 3.4 .4S4.6 1.5 5.4 .8M1.1 5.3C.7 4.3 2 4.3 2.15 3.1S3 2.8 3.4 2.25S4.9 2.2 5.3 1.6M.1-.2L.5 .5L.38 1.25L1.1 1.55L1.55 1.85M3.4 2.25L3.2 3.15L3.7 3.55L3.5 4.2L4.3 5.1" fill="none" stroke="${marbleInk}" stroke-width=".045"/><path d="M0 3.7C1.8 4.3 2.1 1.9 5 3.4M-.3 3.4C1 3.7 1.9 1.5 5.2 3.1M.6 0C.8 .6 2.4 .65 3.8 1.4S4.6 4.2 5.3 4.7" fill="none" stroke="${highlight}" stroke-width=".075" opacity=".38"/></pattern>`;
  defs += "</defs>";
  let drawn = path(silhouette, url("mint"), ' fill-rule="evenodd"');
  let details = "";
  // Material details are clipped to an already valid foreground silhouette.
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!isData(x, y)) continue;
      const h = ((x * 73856093) ^ (y * 19349663) ^ seed) >>> 0;
      // Sparse whole warm cells keep mixed-colour woven areas decodable.
      const useWarm =
        accents &&
        light &&
        (surface === "folds" || surface === "origami" ? h % 5 !== 0 : h % 13 === 0);
      const fill = useWarm ? url("warm") : url("mint");
      switch (surface) {
        case "ribs": {
          const vertical =
            Number(isData(x, y - 1)) + Number(isData(x, y + 1)) >
            Number(isData(x - 1, y)) + Number(isData(x + 1, y));
          details += rect(x, y, 1, 1, fill);
          for (let i = 0; i < 5; i++) {
            const p = i * 0.2 + 0.055;
            details += vertical
              ? rect(x, y + p, 1, 0.048, highlight) + rect(x, y + p + 0.06, 1, 0.048, shade)
              : rect(x + p, y, 0.048, 1, highlight) + rect(x + p + 0.06, y, 0.048, 1, shade);
          }
          if (accents && h % 13 === 0) details += rect(x + 0.1, y + 0.12, 0.8, 0.1, warm);
          break;
        }
        case "folds":
        case "origami": {
          details += rect(x, y, 1, 1, fill);
          const triangle = h % 2 === 0 ? `M${x} ${y}l1 0l-1 1Z` : `M${x + 1} ${y}v1h-1Z`;
          details += path(
            triangle,
            useWarm ? warmHighlight : highlight,
            ` opacity="${surface === "origami" ? 0.78 : 0.48}"`,
          );
          if (surface === "origami")
            details += path(
              `M${x} ${y}L${x + 1} ${y + 1}`,
              "none",
              ` stroke="${useWarm ? warmShade : shade}" stroke-width=".04"`,
            );
          else details += rect(x, y + 0.87, 1, 0.13, useWarm ? warmShade : shade);
          break;
        }
        case "enamel":
          if (useWarm) details += rect(x, y, 1, 1, url("warm"));
          if (!isData(x, y - 1))
            details += path(
              `M${x + 0.19} ${y + 0.24}Q${x + 0.45} ${y + 0.08} ${x + 0.74} ${y + 0.19}`,
              "none",
              ` stroke="${highlight}" stroke-width=".1" stroke-linecap="round"`,
            );
          if (!isData(x, y + 1)) details += rect(x, y + 0.84, 1, 0.16, shade);
          break;
        case "relief":
          // Nested contour is a surface treatment. Its underlying QR is filled.
          break;
        case "basalt":
          details += rect(x + 0.045, y + 0.045, 0.91, 0.91, h % 3 === 0 ? shade : fg, 0.012);
          details += path(
            `M${x + 0.06} ${y + 0.91}V${y + 0.06}H${x + 0.91}L${x + 0.8} ${y + 0.18}H${x + 0.18}V${y + 0.8}Z`,
            highlight,
          );
          if (accents && h % 4 === 0) details += rect(x + 0.08, y + 0.89, 0.83, 0.065, warm);
          break;
        case "portals":
          details += rect(x, y, 1, 1, fill);
          if (!isData(x, y - 1)) details += path(`M${x} ${y}h1l-.13 .16h-.74Z`, highlight);
          if (!isData(x - 1, y)) details += path(`M${x} ${y}l.16 .13v.74l-.16 .13Z`, highlight);
          if (!isData(x, y + 1))
            details += rect(x, y + 0.85, 1, 0.15, accents && h % 3 === 0 ? warm : shade);
          break;
        case "weave":
          details += rect(x, y, 1, 1, fill);
          details += rect(x, y, 1, 1, url(useWarm ? "warm-weave" : "weave"));
          if ((x + y) % 2 === 0) details += rect(x, y + 0.9, 1, 0.075, useWarm ? warmShade : shade);
          else details += rect(x + 0.9, y, 0.075, 1, useWarm ? warmShade : shade);
          break;
        case "constellation":
          details += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".49" fill="${url("bead")}"/>`;
          if (useWarm)
            details += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".45" fill="none" stroke="${warm}" stroke-width=".08"/>`;
          break;
        case "marble":
          // The vein network is continuous across neighbouring occupied modules.
          break;
      }
    }
  if (surface === "relief") {
    details += path(
      silhouette,
      "none",
      ` fill-rule="evenodd" stroke="${shade}" stroke-width=".62"`,
    );
    details += path(
      silhouette,
      "none",
      ` fill-rule="evenodd" stroke="${highlight}" stroke-width=".43"`,
    );
    details += path(
      silhouette,
      "none",
      ` fill-rule="evenodd" stroke="${mildShade}" stroke-width=".31"`,
    );
    details += path(
      silhouette,
      "none",
      ` fill-rule="evenodd" stroke="${accents ? warm : highlight}" stroke-width=".14"`,
    );
    details += path(
      silhouette,
      "none",
      ` fill-rule="evenodd" stroke="${highlight}" stroke-width=".045"`,
    );
  }
  if (surface === "basalt") details += rect(0, 0, n, n, url("stone"));
  if (surface === "marble") {
    details += rect(0, 0, n, n, url("marble"));
    details += path(
      silhouette,
      "none",
      ` fill-rule="evenodd" stroke="${highlight}" stroke-width=".09"`,
    );
  }
  drawn += `<g clip-path="${url("mask")}">${details}</g>`;
  // Exact service patterns; styling cannot change timing, version or alignment bits.
  let service = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (isDark(x, y) && qr.modules.isReserved(y, x) && !finder(x, y))
        service += `M${x} ${y}h1v1h-1Z`;
  drawn += path(service, fg);
  // Finder cells preserve their three nested 7/5/3 ratios. Their material is
  // only a narrow inset highlight, or exact-module beads for Constellation.
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]) {
    const eyeFill =
      accents &&
      light &&
      (surface === "folds" || surface === "origami" || surface === "constellation")
        ? url("warm")
        : url("mint");
    if (surface === "constellation") {
      // The three locator rings stay continuous and flat for scan reliability.
      // Beads decorate the data field; the locator geometry remains conventional.
      drawn += rect(x!, y!, 7, 7, fg, 0.28);
      drawn += rect(x! + 1, y! + 1, 5, 5, bg, 0.08);
      drawn += rect(x! + 2, y! + 2, 3, 3, fg, 0.14);
      for (let ey = 0; ey < 3; ey++)
        for (let ex = 0; ex < 3; ex++)
          drawn += `<circle cx="${x! + ex + 2.5}" cy="${y! + ey + 2.5}" r=".46" fill="${url("bead")}"/>`;
    } else {
      drawn += rect(x!, y!, 7, 7, eyeFill, Math.min(radius * 1.5, 0.65));
      const eyeTexture =
        surface === "weave"
          ? "weave"
          : surface === "marble"
            ? "marble"
            : surface === "basalt"
              ? "stone"
              : null;
      if (eyeTexture) drawn += rect(x! + 0.06, y! + 0.06, 6.88, 6.88, url(eyeTexture), radius);
      drawn += rect(x! + 1, y! + 1, 5, 5, bg, 0.1);
      drawn += rect(x! + 2, y! + 2, 3, 3, url("mint"), radius * 0.6);
      if (eyeTexture)
        drawn += rect(x! + 2.04, y! + 2.04, 2.92, 2.92, url(eyeTexture), radius * 0.5);
      if (surface === "ribs") {
        for (let i = 1; i < 34; i++) {
          const p = i * 0.2;
          drawn +=
            rect(x! + p, y! + 0.05, 0.045, 0.9, highlight) +
            rect(x! + p, y! + 6.05, 0.045, 0.9, highlight);
          drawn +=
            rect(x! + 0.05, y! + p, 0.9, 0.045, highlight) +
            rect(x! + 6.05, y! + p, 0.9, 0.045, highlight);
        }
      }
      if (surface === "relief") {
        for (const inset of [0.16, 0.37, 0.6])
          drawn += `<rect x="${x! + inset}" y="${y! + inset}" width="${7 - inset * 2}" height="${7 - inset * 2}" rx=".38" fill="none" stroke="${inset === 0.37 && accents ? warm : highlight}" stroke-width=".035"/>`;
      }
      if (["portals", "basalt", "origami", "folds"].includes(surface)) {
        drawn += path(`M${x! + 0.08} ${y! + 0.08}h6.84l-.2 .18h-6.46v6.46l-.18 .2Z`, highlight);
        if (accents) drawn += rect(x! + 0.1, y! + 6.83, 6.8, 0.08, warm);
      }
      if (surface === "enamel" || surface === "marble")
        drawn += path(
          `M${x! + 0.25} ${y! + 0.78}Q${x! + 0.3} ${y! + 0.22} ${x! + 0.82} ${y! + 0.2}H${x! + 4.65}`,
          "none",
          ` stroke="${highlight}" stroke-width=".14" stroke-linecap="round"`,
        );
    }
  }
  return defs + drawn;
}
