/**
 * VNE canonical block materials. Pure, deterministic, dependency-free SVG.
 * This renderer only consumes an existing Q-level QR matrix; it never encodes,
 * rewrites payloads, issues a pass, or calls an external service.
 * Coordinates remain inside 0..size. Caller owns background and quiet zone.
 */
export type BlockQrMatrix = {
  modules: {
    size: number;
    get(row: number, column: number): number | boolean;
    isReserved(row: number, column: number): number | boolean;
  };
};
export type BlockQrOptions = {
  surface: "basalt" | "portals";
  foreground: string;
  background: string;
  accent: string;
  accents: boolean;
  cardPalette?: boolean;
};
type Point = [number, number];
const f = (n: number) => Number(n.toFixed(4));
const mix = (a: string, b: string, t: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const lum = (c: string) =>
  [1, 3, 5].reduce(
    (s, i, j) => s + parseInt(c.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][j]!,
    0,
  );
// Use chromatic light, with a tightly bounded luminance range. This keeps
// large mint planes from becoming false binary edges in adaptive decoders.
const atLum = (color: string, target: number) => {
  let rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let k = 0; k < 5; k++) {
    const delta = target - rgb.reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    rgb = rgb.map((v) => Math.min(255, Math.max(0, v + delta)));
  }
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
};
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const poly = (p: Point[], fill: string) =>
  path(p.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + "Z", fill);
const hash = (x: number, y: number, seed: number) => {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
};

export function renderBlockQr(qr: BlockQrMatrix, options: BlockQrOptions): string {
  const { surface, foreground: fg, background: bg, accent, accents, cardPalette = false } = options;
  if (surface !== "basalt" && surface !== "portals") throw new Error("Unknown block QR surface.");
  for (const color of [fg, bg, accent])
    if (!/^#[\da-f]{6}$/i.test(color))
      throw new Error("Block QR colours must use six-digit hex values.");
  const n = qr.modules.size;
  if (!Number.isInteger(n) || n < 21 || n > 177) throw new Error("Invalid QR matrix size.");
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && Boolean(qr.modules.get(y, x));
  const data = (x: number, y: number) => dark(x, y) && !qr.modules.isReserved(y, x);
  const eye = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const light = lum(fg) > lum(bg);
  let seed = 2166136261;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) seed = Math.imul(seed ^ Number(dark(x, y)), 16777619);
  // Keep continuous stone/beam faces below the local-threshold texture range.
  // End-wall mandarin stays on edges outside the protected .34..66 core.
  const stone =
    cardPalette && light
      ? mix(fg, accent, 0.22)
      : light
        ? mix(fg, "#849f91", 0.54)
        : mix(fg, "#555a58", 0.38);
  const beam =
    cardPalette && light
      ? mix(fg, accent, 0.1)
      : light
        ? mix(fg, "#70ad91", 0.55)
        : mix(fg, "#36433f", 0.16);
  const base = surface === "basalt" ? stone : beam;
  const soft = n === 21 ? 0.52 : 1;
  const hi =
    surface === "portals" && light
      ? atLum(mix(base, cardPalette ? fg : "#edf6c8", 0.3), lum(base) + 7 * soft)
      : mix(base, "#ffffff", (light ? 0.055 : 0.045) * soft);
  const shade =
    surface === "portals" && light
      ? atLum(mix(base, cardPalette ? accent : "#145c70", 0.45), lum(base) - 7 * soft)
      : mix(base, "#000000", (light ? 0.075 : 0.19) * soft);
  const mid =
    surface === "portals" && light
      ? atLum(mix(base, cardPalette ? accent : "#145c70", 0.22), lum(base) - 3 * soft)
      : mix(base, "#000000", 0.045 * soft);
  const seam = mix(base, "#000000", 0.22 * soft);
  const warm = light
    ? surface === "portals"
      ? cardPalette
        ? atLum(accent, lum(base) - 4 * soft)
        : mix(accent, "#ffd39a", 0.45)
      : accent
    : atLum(mix(fg, accent, 0.55), lum(base) + 9 * soft);
  const edgeWarm =
    surface === "basalt"
      ? cardPalette
        ? mix(accent, fg, 0.1)
        : mix(accent, "#ff832d", 0.16)
      : light
        ? atLum(mix(base, accent, 0.7), lum(base) - 2 * soft)
        : warm;
  const finderWarm = light ? atLum(mix(base, accent, 0.7), lum(base) - 2 * soft) : warm;
  const lavaHot = cardPalette ? mix(accent, fg, 0.22) : mix(accent, "#ffa43d", 0.28);
  const lavaDark = cardPalette ? atLum(accent, lum(base) - 8 * soft) : mix(accent, "#441307", 0.4);
  const warmHi =
    surface === "portals" && light
      ? atLum(mix(warm, "#ffdb8c", 0.2), lum(warm) + 4 * soft)
      : mix(warm, "#fff3db", 0.04 * soft);
  const warmShade =
    surface === "portals" && light
      ? atLum(mix(warm, "#bd451e", 0.2), lum(warm) - 6 * soft)
      : mix(warm, "#000000", 0.11 * soft);
  let out = "";

  if (surface === "basalt") {
    // Thickness experiment: a 0.28125-module expansion on each exposed side
    // takes the nominal one-module stone stem from 1.00 to 1.5625 modules.
    // The clip excludes every reserved module and the external quiet zone.
    // White data cores (.34..66) retain at least .05875 modules of clear margin.
    // Dense matrices use 1.4375-module stems (+15% over the prior 1.25)
    // because 1.50 and 1.5625 failed 420px/blur with maximum-length text.
    const widthIncrease = n > 41 ? 0.4375 : 0.5625;
    let domain = "",
      silhouettes = "";
    for (let yy = 0; yy < n; yy++)
      for (let xx = 0; xx < n; xx++) {
        if (!qr.modules.isReserved(yy, xx)) domain += `M${xx} ${yy}h1v1h-1Z`;
        if (data(xx, yy)) silhouettes += `M${xx} ${yy}h1v1h-1Z`;
      }
    const expansionClip = `basalt-thickness-${(seed >>> 0).toString(36)}`;
    out += `<defs><clipPath id="${expansionClip}">${path(domain, "#fff")}</clipPath></defs>`;
    out += `<g clip-path="url(#${expansionClip})">${path(silhouettes, base, ` stroke="${base}" stroke-width="${widthIncrease}" stroke-linejoin="bevel"`)}</g>`;
    // Greedy rectangular masonry follows the actual bit mask. Adjacent cells
    // become one broad stone face instead of a decorative square per QR bit.
    const used = new Uint8Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (!data(x, y) || used[y * n + x]) continue;
        const h = hash(x, y, seed);
        let w = 1,
          height = 1,
          score = 0;
        for (let hh = 1; hh <= 3; hh++)
          for (let ww = 1; ww <= 3; ww++) {
            if (ww * hh > 6) continue;
            let good = true;
            for (let yy = y; yy < y + hh; yy++)
              for (let xx = x; xx < x + ww; xx++)
                if (!data(xx, yy) || used[yy * n + xx]) good = false;
            const s = ww * hh * 10 + (h & 1 ? ww : hh);
            if (good && s > score) {
              w = ww;
              height = hh;
              score = s;
            }
          }
        for (let yy = y; yy < y + height; yy++)
          for (let xx = x; xx < x + w; xx++) used[yy * n + xx] = 1;
        const r = x + w,
          b = y + height,
          cut = 0.05 + (h % 5) * 0.028,
          bevel = 0.18 + (h % 3) * 0.025;
        const face = h % 3 === 0 ? mid : base;
        // Only sparse asymmetric corner chips below .27 modules are cut; every protected core
        // remains filled, and all data-cell centres retain their original bit.
        out += poly(
          [
            [x, y],
            [r - cut, y],
            [r, y + cut],
            [r, b],
            [x + cut, b],
            [x, b - cut],
          ],
          face,
        );
        out += poly(
          [
            [x + cut, y],
            [r - cut * 0.65, y],
            [r - bevel, y + bevel],
            [x + bevel, y + bevel],
            [x + bevel, b - bevel],
            [x, b - cut],
            [x, y + cut * 0.7],
          ],
          hi,
        );
        out += poly(
          [
            [r, y + cut],
            [r, b - cut * 0.55],
            [r - cut, b],
            [x + cut * 0.7, b],
            [x + bevel, b - bevel],
            [r - bevel, b - bevel],
            [r - bevel, y + bevel],
          ],
          shade,
        );
        // A substantial chipped plane, cut by a coherent diagonal across a stone.
        out += poly(
          [
            [x + bevel, y + bevel],
            [x + w * 0.7, y + bevel],
            [x + w * 0.36, y + height * 0.55],
            [x + bevel, b - bevel],
          ],
          h % 2 ? mid : hi,
        );
        if (accents) {
          const melt = Math.min(0.29, bevel + 0.065);
          out += poly(
            [
              [x + cut * 0.7, b],
              [r - cut, b],
              [r, b - cut * 0.55],
              [r - melt, b - melt],
              [x + melt, b - melt],
            ],
            edgeWarm,
          );
          if (h % 2 === 0)
            out += poly(
              [
                [r, y + cut],
                [r, b - cut * 0.55],
                [r - melt, b - melt],
                [r - melt, y + melt],
              ],
              edgeWarm,
            );
          // Bright cores of the molten seams stay along module boundaries,
          // outside every .34–.66 sampling square and wholly inside the slab.
          const clip = `basalt-lava-${(seed >>> 0).toString(36)}-${x}-${y}`;
          const slab = `M${x} ${y}H${r - cut}L${r} ${y + cut}V${b}H${x + cut}L${x} ${b - cut}Z`;
          out += `<defs><clipPath id="${clip}">${path(slab, "#fff")}</clipPath></defs><g clip-path="url(#${clip})">`;
          let fissures = "";
          for (let column = 1; column < w; column++) {
            const fx = x + column;
            fissures += `M${fx} ${y}L${fx + 0.14} ${y + height * 0.25}L${fx - 0.16} ${y + height * 0.6}L${fx + 0.08} ${b}`;
          }
          for (let row = 1; row < height; row++) {
            const fy = y + row;
            fissures += `M${x} ${fy}L${x + w * 0.32} ${fy - 0.13}L${x + w * 0.7} ${fy + 0.14}L${r} ${fy}`;
          }
          if (fissures) {
            out += path(
              fissures,
              "none",
              ` stroke="${lavaDark}" stroke-width=".18" stroke-linejoin="bevel"`,
            );
            out += path(
              fissures,
              "none",
              ` stroke="${edgeWarm}" stroke-width=".10" stroke-linejoin="bevel"`,
            );
            out += path(
              fissures,
              "none",
              ` stroke="${lavaHot}" stroke-width=".035" stroke-linejoin="bevel"`,
            );
          }
          out += path(
            `M${x + 0.2} ${b - 0.075}H${r - 0.17}`,
            "none",
            ` stroke="${lavaHot}" stroke-width=".065"`,
          );
          out += "</g>";
        }
        // Sparse broken fissures, sized in module units rather than pixel noise.
        const sx = x + w * (0.35 + (h % 3) * 0.11),
          sy = y + height * 0.3;
        out += path(
          `M${f(sx)} ${f(y + 0.23)}L${f(sx - 0.12)} ${f(sy + 0.15)}L${f(sx + 0.16)} ${f(sy + 0.29)}L${f(sx - 0.04)} ${f(b - 0.22)}`,
          "none",
          ` stroke="${seam}" stroke-width=".042" stroke-linejoin="bevel"`,
        );
        out += path(
          `M${f(sx + 0.015)} ${f(y + 0.23)}L${f(sx - 0.1)} ${f(sy + 0.15)}L${f(sx + 0.18)} ${f(sy + 0.29)}`,
          "none",
          ` stroke="${hi}" stroke-width=".022"`,
        );
        if (w > 1)
          out += path(
            `M${f(x + 0.24)} ${f(b - 0.32)}L${f(x + w * 0.46)} ${f(b - 0.43)}L${f(r - 0.23)} ${f(b - 0.28)}`,
            "none",
            ` stroke="${hi}" stroke-width=".025"`,
          );
      }
  } else {
    // Continuous rectilinear architecture. Each step is bounded by real exposed
    // edges, so multiple adjacent bits read as long beams and nested openings.
    let silhouette = "",
      top = "",
      left = "",
      bottom = "",
      right = "",
      cap = "",
      lips = "";
    const d = 0.38;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (data(x, y)) silhouette += `M${x} ${y}h1v1h-1Z`;
    // Merge collinear boundaries before lighting: one face per architectural
    // span, never a row of tiny bevelled cells along one continuous beam.
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (data(x, y)) {
          if (!data(x, y - 1) && !(data(x - 1, y) && !data(x - 1, y - 1))) {
            let e = x + 1;
            while (data(e, y) && !data(e, y - 1)) e++;
            top += `M${x} ${y}H${e}l-${d} ${d}H${x + d}Z`;
            lips += rect(x + d, y + d - 0.028, e - x - 2 * d, 0.036, mid);
          }
          if (!data(x, y + 1) && !(data(x - 1, y) && !data(x - 1, y + 1))) {
            let e = x + 1;
            while (data(e, y) && !data(e, y + 1)) e++;
            bottom += `M${x} ${y + 1}H${e}l-${d}-${d}H${x + d}Z`;
            if (accents && hash(x, y, seed) % 3 === 0)
              cap += `M${x} ${y + 1}H${e}l-${d}-${d}H${x + d}Z`;
          }
          if (!data(x - 1, y) && !(data(x, y - 1) && !data(x - 1, y - 1))) {
            let e = y + 1;
            while (data(x, e) && !data(x - 1, e)) e++;
            left += `M${x} ${y}l${d} ${d}V${e - d}l-${d} ${d}Z`;
            lips += rect(x + d - 0.028, y + d, 0.036, e - y - 2 * d, hi);
          }
          if (!data(x + 1, y) && !(data(x, y - 1) && !data(x + 1, y - 1))) {
            let e = y + 1;
            while (data(x, e) && !data(x + 1, e)) e++;
            right += `M${x + 1} ${y}V${e}l-${d}-${d}V${y + d}Z`;
            if (accents && hash(x, y, seed) % 4 === 0)
              cap += `M${x + 1} ${y}V${e}l-${d}-${d}V${y + d}Z`;
          }
        }
    out +=
      path(silhouette, base) +
      path(top, hi) +
      path(left, mix(base, "#ffffff", 0.026 * soft)) +
      path(bottom, shade) +
      path(right, mid) +
      path(cap, edgeWarm) +
      lips;
  }

  // Timing/version/alignment patterns and separators are exact full modules.
  let service = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (dark(x, y) && qr.modules.isReserved(y, x) && !eye(x, y)) service += `M${x} ${y}h1v1h-1Z`;
  out += path(service, base);
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]) {
    // The entire 7/5/3 locator structure is retained. There is no decorative
    // U-shaped hole in a central locator, which would overwrite protected bits.
    const X = x!,
      Y = y!;
    const eyeClip = `vne-block-${surface}-${(seed >>> 0).toString(36)}-${fg.slice(1)}-${bg.slice(1)}-${accent.slice(1)}-${Number(accents)}-${X}-${Y}`;
    const eyeMask = `M${X} ${Y}h7v7h-7ZM${X + 1} ${Y + 1}v5h5v-5Z M${X + 2} ${Y + 2}h3v3h-3Z`;
    out += `<defs><clipPath id="${eyeClip}">${path(eyeMask, "#fff", ' fill-rule="evenodd"')}</clipPath></defs><g clip-path="url(#${eyeClip})">`;
    out += rect(X, Y, 7, 7, base) + rect(X + 1, Y + 1, 5, 5, bg) + rect(X + 2, Y + 2, 3, 3, base);
    if (surface === "portals") {
      out += poly(
        [
          [X, Y],
          [X + 7, Y],
          [X + 6.76, Y + 0.24],
          [X + 0.24, Y + 0.24],
        ],
        hi,
      );
      out += poly(
        [
          [X, Y],
          [X + 0.24, Y + 0.24],
          [X + 0.24, Y + 6.76],
          [X, Y + 7],
        ],
        hi,
      );
      out += poly(
        [
          [X + 7, Y],
          [X + 7, Y + 7],
          [X + 6.76, Y + 6.76],
          [X + 6.76, Y + 0.24],
        ],
        shade,
      );
      out += poly(
        [
          [X, Y + 7],
          [X + 7, Y + 7],
          [X + 6.76, Y + 6.76],
          [X + 0.24, Y + 6.76],
        ],
        shade,
      );
      // Four mitred inner return faces turn the standard ring into a portal.
      out += poly(
        [
          [X + 0.7, Y + 0.7],
          [X + 6.3, Y + 0.7],
          [X + 6, Y + 1],
          [X + 1, Y + 1],
        ],
        shade,
      );
      out += poly(
        [
          [X + 0.7, Y + 0.7],
          [X + 1, Y + 1],
          [X + 1, Y + 6],
          [X + 0.7, Y + 6.3],
        ],
        mid,
      );
      out += poly(
        [
          [X + 6.3, Y + 0.7],
          [X + 6.3, Y + 6.3],
          [X + 6, Y + 6],
          [X + 6, Y + 1],
        ],
        hi,
      );
      out += poly(
        [
          [X + 0.7, Y + 6.3],
          [X + 6.3, Y + 6.3],
          [X + 6, Y + 6],
          [X + 1, Y + 6],
        ],
        hi,
      );
      const c = accents && light ? warm : base,
        ch = accents && light ? warmHi : hi,
        cs = accents && light ? warmShade : shade;
      out += rect(X + 2, Y + 2, 3, 3, c);
      out += poly(
        [
          [X + 2, Y + 2],
          [X + 5, Y + 2],
          [X + 4.71, Y + 2.29],
          [X + 2.29, Y + 2.29],
          [X + 2.29, Y + 4.71],
          [X + 2, Y + 5],
        ],
        ch,
      );
      out += poly(
        [
          [X + 5, Y + 2],
          [X + 5, Y + 5],
          [X + 2, Y + 5],
          [X + 2.29, Y + 4.71],
          [X + 4.71, Y + 4.71],
          [X + 4.71, Y + 2.29],
        ],
        cs,
      );
      // Second recessed plane stays within the same valid dark/bright bit band.
      out += rect(X + 2.62, Y + 2.62, 1.76, 1.76, cs);
      out += rect(X + 2.67, Y + 2.67, 1.66, 0.055, ch);
      if (accents && !light) out += rect(X + 2.1, Y + 4.78, 2.8, 0.14, warm);
    } else {
      // Large frame slabs plus an intentionally chunky central monolith.
      out += poly(
        [
          [X, Y],
          [X + 7, Y],
          [X + 6.77, Y + 0.23],
          [X + 0.23, Y + 0.23],
          [X + 0.23, Y + 6.77],
          [X, Y + 7],
        ],
        hi,
      );
      out += poly(
        [
          [X + 7, Y],
          [X + 7, Y + 7],
          [X, Y + 7],
          [X + 0.23, Y + 6.77],
          [X + 6.77, Y + 6.77],
          [X + 6.77, Y + 0.23],
        ],
        shade,
      );
      out += poly(
        [
          [X + 0.76, Y + 0.76],
          [X + 6.24, Y + 0.76],
          [X + 6, Y + 1],
          [X + 1, Y + 1],
          [X + 1, Y + 6],
          [X + 0.76, Y + 6.24],
        ],
        shade,
      );
      if (accents)
        out += poly(
          [
            [X + 1, Y + 6],
            [X + 6, Y + 6],
            [X + 6.24, Y + 6.24],
            [X + 0.76, Y + 6.24],
          ],
          finderWarm,
        );
      if (accents) {
        out += path(
          `M${X + 0.84} ${Y + 1}V${Y + 6.14}H${X + 6.12}`,
          "none",
          ` stroke="${finderWarm}" stroke-width=".14"`,
        );
        out += path(
          `M${X + 0.91} ${Y + 1.08}V${Y + 6.08}H${X + 6.05}`,
          "none",
          ` stroke="${finderWarm}" stroke-width=".035"`,
        );
      }
      out += poly(
        [
          [X + 2, Y + 2],
          [X + 5, Y + 2],
          [X + 4.78, Y + 2.22],
          [X + 2.22, Y + 2.22],
          [X + 2.22, Y + 4.78],
          [X + 2, Y + 5],
        ],
        hi,
      );
      out += poly(
        [
          [X + 5, Y + 2],
          [X + 5, Y + 5],
          [X + 2, Y + 5],
          [X + 2.22, Y + 4.78],
          [X + 4.78, Y + 4.78],
          [X + 4.78, Y + 2.22],
        ],
        shade,
      );
      if (accents)
        out += poly(
          [
            [X + 2, Y + 5],
            [X + 5, Y + 5],
            [X + 4.78, Y + 4.78],
            [X + 2.22, Y + 4.78],
          ],
          finderWarm,
        );
      for (let k = 1; k < 7; k++) {
        const d = k % 2 ? -0.11 : 0.13;
        out += path(
          `M${X + k} ${Y}l${d} .46l${-d} .54M${X + k} ${Y + 6}l${-d} .54l${d} .46`,
          "none",
          ` stroke="${seam}" stroke-width=".045"`,
        );
        out += path(
          `M${X} ${Y + k}l.44 ${d}l.56 ${-d}M${X + 6} ${Y + k}l.55 ${-d}l.45 ${d}`,
          "none",
          ` stroke="${seam}" stroke-width=".045"`,
        );
      }
      out += path(
        `M${X + 2.35} ${Y + 2.12}l.43 .69l-.20 .37l.38 .36l-.15 .62l.29 .58M${X + 2.12} ${Y + 3.5}l.78-.17l.69 .25l.47-.22l.77 .43`,
        "none",
        ` stroke="${seam}" stroke-width=".035" stroke-linejoin="bevel"`,
      );
    }
    out += "</g>";
  }
  return out;
}

/** Rank already-encoded matrices by actual masonry/architectural opportunities.
 * Does not encode, mutate, choose error correction, or change payload bytes.
 * The integrator may score the eight standard masks at the same Q level.
 */
export function scoreBlockMatrix(
  qr: BlockQrMatrix,
  surface: "basalt" | "portals" = "basalt",
): number {
  const n = qr.modules.size;
  const data = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < n &&
    y < n &&
    Boolean(qr.modules.get(y, x)) &&
    !qr.modules.isReserved(y, x);
  let squares = 0,
    slabs = 0,
    singletons = 0,
    stems = 0,
    longSpans = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (data(x, y)) {
        const left = data(x - 1, y),
          right = data(x + 1, y),
          top = data(x, y - 1),
          bottom = data(x, y + 1);
        if (!left && !right && !top && !bottom) singletons++;
        if (((left || right) && !top && !bottom) || ((top || bottom) && !left && !right)) stems++;
        if (data(x + 1, y) && data(x, y + 1) && data(x + 1, y + 1)) {
          squares++;
          if (data(x + 2, y) && data(x + 2, y + 1)) slabs++;
          if (data(x, y + 2) && data(x + 1, y + 2)) slabs++;
        }
        if (!left) {
          let end = x + 1;
          while (data(end, y)) end++;
          if (end - x >= 3) longSpans += (end - x - 2) ** 1.35;
        }
        if (!top) {
          let end = y + 1;
          while (data(x, end)) end++;
          if (end - y >= 3) longSpans += (end - y - 2) ** 1.35;
        }
      }
  return surface === "basalt"
    ? squares * 18 + slabs * 28 + longSpans * 0.8 - singletons * 5 - stems * 0.35
    : squares * 9 + slabs * 9 + longSpans * 7 - singletons * 6;
}
