/**
 * VNE Constellation: deterministic, matrix-derived bead material.
 * No payloads, network, fonts, raster sources or external dependencies.
 * Returns only inner markup. The caller supplies background and quiet zone 4.
 */
export type BeadQrMatrix = {
  modules: {
    size: number;
    get(row: number, column: number): number | boolean;
    isReserved(row: number, column: number): number | boolean;
  };
};
export type BeadQrOptions = {
  foreground: string;
  background: string;
  accent: string;
  accents: boolean;
};
const f = (v: number) => Number(v.toFixed(4));
function rgb(value: string): number[] {
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error("QR colours must be six-digit hex.");
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
}
function mix(a: string, b: string, amount: number): string {
  const av = rgb(a),
    bv = rgb(b);
  return (
    "#" +
    av
      .map((v, i) =>
        Math.round(v * (1 - amount) + bv[i]! * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
const lum = (c: string) => rgb(c).reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i]!, 0);
const circle = (x: number, y: number, r: number, colour: string) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${colour}"/>`;

export function renderBeadQr(qr: BeadQrMatrix, options: BeadQrOptions): string {
  const { foreground: fg, background: bg, accent, accents } = options;
  rgb(fg);
  rgb(bg);
  rgb(accent);
  const n = qr.modules.size;
  if (!Number.isInteger(n) || n < 21 || n > 177) throw new Error("Invalid QR size.");
  const light = lum(fg) > lum(bg);
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && Boolean(qr.modules.get(y, x));
  const data = (x: number, y: number) => dark(x, y) && !qr.modules.isReserved(y, x);
  let seed = 2166136261;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) seed = Math.imul(seed ^ Number(dark(x, y)), 16777619);
  const id = `vne-bead-${(seed >>> 0).toString(36)}-${fg.slice(1)}-${bg.slice(1)}-${accent.slice(1)}-${Number(accents)}`;
  const paint = (s: string) => `url(#${id}-${s})`;
  // On light surfaces a warm tint stays dark; true mandarine is for dark ground.
  const warm = light ? accent : mix(fg, accent, 0.16);
  const tone = (colour: string) => ({
    high: mix(colour, light ? "#ffffff" : fg, light ? 0.22 : 0.12),
    mid: colour,
    low: mix(colour, bg, light ? 0.26 : 0.07),
    edge: mix(colour, bg, light ? 0.35 : 0.1),
  });
  const gradient = (name: string, colour: string) => {
    const t = tone(colour);
    return `<radialGradient id="${id}-${name}" cx=".30" cy=".23" r=".83"><stop stop-color="${t.high}"/><stop offset=".25" stop-color="${t.high}"/><stop offset=".56" stop-color="${t.mid}"/><stop offset=".84" stop-color="${t.low}"/><stop offset="1" stop-color="${t.edge}"/></radialGradient>`;
  };
  // The 21×21 symbol has a known JPEG/local-threshold corner case; soften
  // only locator lighting there, preserving the canonical 25×25 appearance.
  const serviceRelief = n === 21 ? 0.03 : 0.08;
  const locatorGradient = (name: string, colour: string) =>
    `<radialGradient id="${id}-${name}" cx=".28" cy=".23" r=".82"><stop stop-color="${mix(colour, "#ffffff", serviceRelief)}"/><stop offset=".5" stop-color="${colour}"/><stop offset="1" stop-color="${mix(colour, bg, serviceRelief)}"/></radialGradient>`;
  let out = `<defs>${gradient("mint", fg)}${gradient("warm", warm)}${locatorGradient("service-mint", fg)}${locatorGradient("service-warm", warm)}</defs>`;
  const occupied = new Uint8Array(n * n);
  const bead = (x: number, y: number, radius: number, useWarm: boolean) =>
    circle(x, y, radius, paint(useWarm ? "warm" : "mint"));
  // A 2×2 sphere is legal only when all four cells are real data-dark cells.
  // Radius .96 covers every point of every [.34,.66] core: sqrt(2)*.66 < .96.
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const cells = [y * n + x, y * n + x + 1, (y + 1) * n + x, (y + 1) * n + x + 1];
      if (
        cells.some((i) => occupied[i]) ||
        !data(x, y) ||
        !data(x + 1, y) ||
        !data(x, y + 1) ||
        !data(x + 1, y + 1)
      )
        continue;
      // Retain a readable scale hierarchy, not a random scatter of micro accents.
      cells.forEach((i) => (occupied[i] = 1));
      const useWarm = accents && light && (x + 2 * y) % 19 === 0;
      out += bead(x + 1, y + 1, 0.96, useWarm);
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!data(x, y) || occupied[y * n + x]) continue;
      const neighbours =
        Number(data(x - 1, y)) +
        Number(data(x + 1, y)) +
        Number(data(x, y - 1)) +
        Number(data(x, y + 1));
      const radius = neighbours === 0 ? 0.39 : neighbours === 1 ? 0.435 : 0.47;
      const useWarm = accents && (3 * x + 5 * y) % 23 === 0;
      out += bead(x + 0.5, y + 0.5, radius, useWarm);
    }
  const finderOrigin = (x: number, y: number): [number, number] | undefined => {
    if (x < 7 && y < 7) return [0, 0];
    if (x >= n - 7 && y < 7) return [n - 7, 0];
    if (x < 7 && y >= n - 7) return [0, n - 7];
    return undefined;
  };
  // A union path is deliberate: independent adjacent SVG rects can leave
  // antialiased hairline seams that confuse finder detection at fractional scales.
  let serviceMint = "",
    serviceWarm = "",
    serviceExact = "",
    serviceBeads = "";
  const cellPath = (x: number, y: number) => `M${x} ${y}h1v1h-1Z`;
  // Service modules retain full square coverage. A continuous foundation under
  // finder beads preserves exact 7/5/3 locator ratios and supports binarization.
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!dark(x, y) || !qr.modules.isReserved(y, x)) continue;
      const origin = finderOrigin(x, y);
      if (!origin) {
        serviceExact += cellPath(x, y);
        continue;
      }
      const ring = x === origin[0] || x === origin[0] + 6 || y === origin[1] || y === origin[1] + 6;
      const useWarm = Boolean(ring && accents);
      if (useWarm) serviceWarm += cellPath(x, y);
      else serviceMint += cellPath(x, y);
      serviceBeads += circle(
        x + 0.5,
        y + 0.5,
        0.48,
        paint(useWarm ? "service-warm" : "service-mint"),
      );
    }
  out +=
    `<path d="${serviceExact}" fill="${fg}"/><path d="${serviceMint}" fill="${mix(fg, bg, serviceRelief)}"/><path d="${serviceWarm}" fill="${mix(warm, bg, serviceRelief)}"/>` +
    serviceBeads;
  return out;
}
