import { polygonsPath, type MacroLayout, type MacroGlyph, type QrMatrix } from "./macro-glyphs";
type OrigamiOptions = {
  foreground: string;
  background: string;
  accent: string;
  accents: boolean;
  cardPalette?: boolean;
  layout: MacroLayout;
};
const fmt = (v: number) => Number(v.toFixed(3));
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

function pickAccentGlyphs(layout: MacroLayout, accents: boolean) {
  const picked = new Set<MacroGlyph>(),
    n = layout.size;
  if (accents)
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
  return picked;
}

/** Opt-in folded-paper material. The existing v0.5 renderers stay untouched. */
export function renderOrigamiQr(qr: QrMatrix, options: OrigamiOptions): string {
  const { foreground: fg, background: bg, accent, accents } = options;
  const surface = "origami";
  // Validate before interpolating colours in SVG attributes.
  mix(fg, bg, 0);
  mix(accent, bg, 0);
  const n = qr.modules.size;
  if (!Number.isInteger(n) || n < 21 || n > 177) throw new Error("Invalid QR matrix size.");
  const light = luminance(fg) > luminance(bg);
  // A narrow lightness band keeps 8-pixel local threshold windows from
  // interpreting the material texture as new QR cells at large export sizes.
  const highlight = light ? mix(fg, "#ffffff", 0.22) : mix(fg, "#ffffff", 0.14);
  const shade = mix(fg, bg, light ? 0.13 : 0.15);
  const mildShade = mix(fg, bg, 0.035);
  // Mandarine is a material colour on a dark ground. On light grounds it is
  // confined to a narrow inset edge, keeping cell centres dark and high contrast.
  const warmMix = light
    ? 1
    : Math.min(
        1,
        (Math.abs(luminance(bg) - luminance(fg)) * 0.25) /
          Math.max(1, Math.abs(luminance(accent) - luminance(fg))),
      );
  const warm = mix(fg, accent, warmMix);
  const warmHighlight = light ? mix(accent, "#ffffff", 0.055) : mix(warm, "#ffffff", 0.055);
  const warmShade = mix(warm, bg, 0.13);
  const isDark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && Boolean(qr.modules.get(y, x));
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let seed = 2166136261;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) seed = Math.imul(seed ^ Number(isDark(x, y)), 16777619);
  const id = `vne-mat-${surface}-${(seed >>> 0).toString(36)}-${fg.slice(1)}-${bg.slice(1)}-${accent.slice(1)}-${Number(accents)}`;
  const url = (name: string) => `url(#${id}-${name})`;
  const { layout } = options;
  if (layout.size !== n) throw new Error("Origami layout does not match its QR matrix.");
  const glyphPaths = layout.glyphs.map((glyph) => polygonsPath(glyph.polygons));
  const silhouette = glyphPaths.join("");
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
  // Small locator grids and identity-card palettes favour compressed tonal
  // range. Geometry is identical; less paper contrast survives JPEG better.
  const softLighting = options.cardPalette || n === 21;
  const origamiPaper = mix(fg, "#809a86", light && fg.toLowerCase() === "#30e5ad" ? 0.64 : 0.34);
  let drawn = "";
  const warmGlyphs = pickAccentGlyphs(layout, accents);
  // Each surface is applied to a complete, validated multi-module silhouette.
  // Colour never changes halfway through a ribbon because of a cell hash.
  for (const [index, glyph] of layout.glyphs.entries()) {
    const d = glyphPaths[index]!;
    const [x, y, right, bottom] = glyph.bounds as [number, number, number, number];
    const w = right - x,
      h = bottom - y;
    const isWarm = warmGlyphs.has(glyph) || (accents && glyph.owned.length >= 2);
    const fill = isWarm ? url("warm") : url("mint");
    const clip = `${id}-glyph-${index}`,
      clipUrl = `url(#${clip})`;
    drawn += `<defs><clipPath id="${clip}">${path(d, "#fff")}</clipPath></defs>`;
    drawn += path(d, fill);
    let finish = "";
    const paper = isWarm ? warm : origamiPaper;
    const paperLight = mix(
      paper,
      "#fff1d3",
      n === 21 ? 0.007 : softLighting ? 0.035 : light ? 0.08 : 0.06,
    );
    const paperShade = mix(
      paper,
      light ? bg : "#000000",
      n === 21 ? 0.008 : softLighting ? 0.04 : 0.09,
    );
    const paperDeep = mix(
      paper,
      light ? bg : "#000000",
      n === 21 ? 0.014 : softLighting ? 0.07 : 0.16,
    );
    // Large coherent folded planes, each belonging to one complete glyph.
    // Light always comes from the upper left; no cell-level colour noise.
    finish = rect(x, y, w, h, paper);
    finish += path(
      `M${x} ${y}L${right} ${y}L${x + w * 0.28} ${y + h * 0.58}L${x} ${bottom}Z`,
      paperLight,
    );
    finish += path(
      `M${right} ${y}L${right} ${bottom}L${x} ${bottom}L${x + w * 0.28} ${y + h * 0.58}Z`,
      paperShade,
    );
    finish += path(
      `M${x} ${bottom}L${x + w * 0.28} ${y + h * 0.58}L${right} ${bottom}Z`,
      paperDeep,
    );
    finish += path(
      `M${x} ${bottom}L${x + w * 0.28} ${y + h * 0.58}L${right} ${y}`,
      "none",
      ` stroke="${paperLight}" stroke-width=".04"`,
    );
    // Paper folds have broad faces, not a gemstone-like bevel around every piece.
    drawn += `<g clip-path="${clipUrl}">${finish}</g>`;
  }
  // Exact service patterns; styling cannot change timing, version or alignment bits.
  let service = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (isDark(x, y) && qr.modules.isReserved(y, x) && !finder(x, y))
        service += `M${x} ${y}h1v1h-1Z`;
  drawn += path(service, origamiPaper);
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]) {
    const frame = accents && light ? warm : fg;
    const top = mix(
      frame,
      "#fff1d3",
      n === 21 ? 0.007 : softLighting ? 0.035 : light ? 0.09 : 0.04,
    );
    const left = mix(
      frame,
      "#fff1d3",
      n === 21 ? 0.002 : softLighting ? 0.01 : light ? 0.025 : 0.01,
    );
    const right = mix(
      frame,
      light ? bg : "#000000",
      n === 21 ? 0.007 : softLighting ? 0.035 : 0.07,
    );
    const bottom = mix(
      frame,
      light ? bg : "#000000",
      n === 21 ? 0.012 : softLighting ? 0.06 : 0.13,
    );
    const innerShadow = mix(
      frame,
      light ? bg : "#000000",
      n === 21 ? 0.016 : softLighting ? 0.08 : 0.18,
    );
    // Four mitred facets remain inside the standard one-module locator ring.
    drawn += path(`M${x} ${y}h7l-1 1h-5Z`, top);
    drawn += path(`M${x} ${y}l1 1v5l-1 1Z`, left);
    drawn += path(`M${x! + 7} ${y}v7l-1-1v-5Z`, right);
    drawn += path(`M${x} ${y! + 7}l1-1h5l1 1Z`, bottom);
    drawn += path(`M${x! + 0.77} ${y! + 0.77}h5.46v5.46h-5.46Z`, innerShadow);
    drawn += rect(x! + 1, y! + 1, 5, 5, bg);
    // The central3×3 block is a folded paper face, never a fake empty hole.
    const paper = origamiPaper;
    const centreLight = mix(paper, "#fff1d3", n === 21 ? 0.007 : softLighting ? 0.035 : 0.08);
    const centreShade = mix(
      paper,
      light ? bg : "#000000",
      n === 21 ? 0.01 : softLighting ? 0.05 : 0.1,
    );
    drawn += rect(x! + 2, y! + 2, 3, 3, paper);
    drawn += path(`M${x! + 2} ${y! + 2}h3l-.32 .32h-2.36Z`, centreLight);
    drawn += path(
      `M${x! + 2} ${y! + 2}l.32 .32v2.36l-.32 .32Z`,
      mix(paper, "#fff1d3", n === 21 ? 0.007 : softLighting ? 0.035 : 0.08),
    );
    drawn += path(`M${x! + 5} ${y! + 2}v3l-.32-.32v-2.36Z`, centreShade);
    drawn += path(
      `M${x! + 2} ${y! + 5}l.32-.32h2.36l.32 .32Z`,
      mix(paper, light ? bg : "#000000", n === 21 ? 0.01 : softLighting ? 0.05 : 0.14),
    );
  }
  return defs + drawn;
}
