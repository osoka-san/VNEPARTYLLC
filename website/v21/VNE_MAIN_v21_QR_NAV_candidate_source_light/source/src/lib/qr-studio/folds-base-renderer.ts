import {
  foldsLayout,
  polygonsPath,
  type FoldsLayout,
  type QrMatrix,
  type Vec,
} from "./folds-base-layout";
export type FoldsOptions = {
  foreground: string;
  background: string;
  accent: string;
  accents: boolean;
  layout?: FoldsLayout;
};
const f = (v: number) => Number(v.toFixed(4));
const lum = (hex: string) =>
  [1, 3, 5].reduce(
    (s, i, j) => s + parseInt(hex.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][j]!,
    0,
  );
const mix = (a: string, b: string, t: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const rect = (x: number, y: number, w: number, h: number, c: string, r = 0) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${c}"/>`;
function offsets(line: Vec[], amount: number): Vec[] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!,
      b = line[Math.min(line.length - 1, i + 1)]!,
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    return [p[0] - (dy / len) * amount, p[1] + (dx / len) * amount];
  });
}
function band(line: Vec[], a: number, b: number) {
  const ring = [...offsets(line, a), ...offsets(line, b).reverse()];
  return polygonsPath([[ring]]);
}
/** A standalone renderer: approved Origami/Weave code is neither imported nor changed. */
export function renderFoldsQr(qr: QrMatrix, o: FoldsOptions, dataOnly = false) {
  const n = qr.modules.size,
    { foreground: fg, background: bg, accent, accents } = o;
  for (const colour of [fg, bg, accent])
    if (!/^#[0-9a-f]{6}$/i.test(colour)) throw Error("Expected six-digit material colour");
  const layout = o.layout ?? foldsLayout(qr),
    light = lum(fg) > lum(bg),
    soft = n === 21;
  const paper = light && fg.toLowerCase() === "#30e5ad" ? mix(fg, "#8db39a", 0.58) : fg;
  const cap = light
    ? 1
    : Math.min(
        1,
        (Math.abs(lum(bg) - lum(fg)) * 0.18) / Math.max(1, Math.abs(lum(accent) - lum(fg))),
      );
  const warm = mix(fg, accent, cap),
    high = (c: string) => mix(c, "#fff0d8", soft ? 0.025 : 0.095),
    low = (c: string) => mix(c, light ? bg : "#000000", soft ? 0.03 : 0.17);
  let seed = 2166136261;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) seed = Math.imul(seed ^ Number(qr.modules.get(y, x)), 16777619);
  const id = `vne-folds6-${(seed >>> 0).toString(36)}-${fg.slice(1)}-${bg.slice(1)}-${Number(accents)}`;
  let defs = "<defs>",
    body = "";
  for (const [name, c] of [
    ["paper", paper],
    ["warm", warm],
  ] as const)
    defs += `<linearGradient id="${id}-${name}" x1="0" y1="0" x2=".28" y2="1"><stop stop-color="${high(c)}"/><stop offset=".24" stop-color="${c}"/><stop offset=".73" stop-color="${c}"/><stop offset="1" stop-color="${low(c)}"/></linearGradient>`;
  defs += "</defs>";
  for (const [index, ribbon] of layout.ribbons.entries()) {
    const useWarm = accents && ribbon.owned.length >= 3,
      c = useWarm ? warm : paper,
      name = useWarm ? "warm" : "paper",
      d = polygonsPath(ribbon.polygons),
      clip = `${id}-r${index}`;
    body += `<defs><clipPath id="${clip}"><path d="${d}"/></clipPath></defs><path d="${d}" fill="${c}"/>`;
    if (ribbon.owned.length === 1) {
      const p = ribbon.points[0]!;
      body += `<g clip-path="url(#${clip})">${rect(p[0] - 0.5, p[1] - 0.5, 1, 1, `url(#${id}-${name})`, 0.15)}</g>`;
      continue;
    }
    body += `<g clip-path="url(#${clip})">`;
    // Cross-strip material bands follow one continuous ribbon, including every
    // curved turn. Broad middle stays planar; edges carry the rolled paper light.
    const stops = [
      [-0.52, low(c)],
      [-0.38, mix(c, low(c), 0.48)],
      [-0.29, c],
      [0.25, c],
      [0.38, mix(c, high(c), 0.45)],
      [0.52, high(c)],
    ] as const;
    for (let j = 1; j < stops.length; j++) {
      const a = stops[j - 1]!,
        b = stops[j]!;
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / steps,
          y = a[0] + ((b[0] - a[0]) * (k + 1)) / steps;
        body += `<path d="${band(ribbon.centreline, x - 0.004, y + 0.004)}" fill="${mix(a[1], b[1], (k + 0.5) / steps)}"/>`;
      }
    }
    body += "</g>";
  }
  if (dataOnly) return defs + body;
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let service = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.isReserved(y, x) && qr.modules.get(y, x) && !finder(x, y))
        service += `M${x} ${y}h1v1h-1Z`;
  body += `<path d="${service}" fill="${paper}"/>`;
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as [number, number][]) {
    const frame = light && accents ? warm : paper,
      name = light && accents ? "warm" : "paper";
    body +=
      rect(x, y, 7, 7, `url(#${id}-${name})`, 1.02) +
      rect(x + 1, y + 1, 5, 5, bg, 0.62) +
      rect(x + 2, y + 2, 3, 3, `url(#${id}-paper)`, 0.4);
    body += `<path d="M${x + 0.14} ${y + 2.0}V${y + 1.13}Q${x + 0.14} ${y + 0.14} ${x + 1.13} ${y + 0.14}H${x + 5.86}" fill="none" stroke="${high(frame)}" stroke-width=".12"/><path d="M${x + 6.84} ${y + 4.95}V${y + 5.88}Q${x + 6.84} ${y + 6.84} ${x + 5.88} ${y + 6.84}H${x + 1.15}" fill="none" stroke="${low(frame)}" stroke-width=".13"/>`;
  }
  return defs + body;
}
