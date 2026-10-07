import { polygonsPath, type MacroLayout, type QrMatrix } from "./macro-glyphs";
import { softFoldedLayout } from "./soft-folds";
export type RibbonOptions = {
  surface: "folds" | "weave";
  foreground: string;
  background: string;
  accent: string;
  accents: boolean;
  layout?: MacroLayout;
  cardPalette?: boolean;
};
const num = (v: number) => Number(v.toFixed(4));
const mix = (a: string, b: string, t: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b))
    throw Error("Invalid material colour");
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
const lum = (hex: string) =>
  [1, 3, 5].reduce(
    (s, i, j) => s + parseInt(hex.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][j]!,
    0,
  );
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) =>
  `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${rx}" fill="${fill}"/>`;
type Run = {
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
  length: number;
};
/** Both complete warp and weft runs are retained. Crossings are real shared dark
 * cells, never bridges over light or function modules. */
function wovenRuns(qr: QrMatrix) {
  const n = qr.modules.size;
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && !!qr.modules.get(y, x) && !qr.modules.isReserved(y, x);
  const runs: Run[] = [],
    horizontal = new Map<number, Run>(),
    vertical = new Map<number, Run>();
  for (const isVertical of [false, true])
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (!dark(x, y) || dark(x - Number(!isVertical), y - Number(isVertical))) continue;
        let length = 1;
        while (dark(x + Number(!isVertical) * length, y + Number(isVertical) * length)) length++;
        if (length < 2) continue;
        const run = {
          x,
          y,
          w: isVertical ? 1 : length,
          h: isVertical ? length : 1,
          vertical: isVertical,
          length,
        };
        runs.push(run);
        for (let i = 0; i < length; i++)
          (isVertical ? vertical : horizontal).set(
            (y + Number(isVertical) * i) * n + x + Number(!isVertical) * i,
            run,
          );
      }
  return { runs, horizontal, vertical };
}
export function renderRibbonQr(qr: QrMatrix, o: RibbonOptions) {
  const { surface, foreground: fg, background: bg, accent, accents } = o,
    n = qr.modules.size;
  if (!Number.isInteger(n) || n < 21 || n > 177) throw Error("Invalid QR matrix");
  const light = lum(fg) > lum(bg),
    soft = o.cardPalette || n === 21;
  let paper = light && fg.toLowerCase() === "#30e5ad" ? mix(fg, "#809a86", 0.5) : fg;
  const cap = light
    ? 1
    : Math.min(
        1,
        (Math.abs(lum(bg) - lum(fg)) * 0.25) / Math.max(1, Math.abs(lum(accent) - lum(fg))),
      );
  let warm = mix(fg, accent, cap);
  if (surface === "weave") {
    // Equal luminance is essential: adaptive thresholding must not split the
    // orange and green strands into different bit values at 900/420/JPEG.
    const target = (lum(paper) + lum(warm)) / 2;
    const balance = (colour: string) =>
      lum(colour) < target
        ? mix(colour, "#ffffff", (target - lum(colour)) / (255 - lum(colour)))
        : mix(colour, "#000000", (lum(colour) - target) / Math.max(1, lum(colour)));
    paper = balance(paper);
    warm = balance(warm);
  }
  const thread = (colour: string, direction: number) => {
    const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
    const vector = [1, -0.067, -2.277];
    let amount = 12;
    vector.forEach((v, i) => {
      const step = v * direction;
      amount = Math.min(amount, step > 0 ? (255 - rgb[i]!) / step : rgb[i]! / -step);
    });
    return (
      "#" +
      rgb
        .map((v, i) =>
          Math.round(v + vector[i]! * direction * amount)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  };
  const hi = (c: string) =>
    surface === "weave" ? thread(c, 1) : mix(c, "#fff4de", soft ? 0.025 : 0.1);
  const lo = (c: string) =>
    surface === "weave" ? thread(c, -1) : mix(c, light ? bg : "#000000", soft ? 0.035 : 0.14);
  let seed = 2166136261;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) seed = Math.imul(seed ^ Number(qr.modules.get(y, x)), 16777619);
  const id = `vne-ribbon-${surface}-${(seed >>> 0).toString(36)}-${fg.slice(1)}-${bg.slice(1)}-${accent.slice(1)}-${Number(accents)}-${Number(!!soft)}`;
  const url = (name: string) => `url(#${id}-${name})`;
  let defs = "<defs>";
  for (const [name, c] of [
    ["paper", paper],
    ["warm", warm],
  ] as const) {
    defs += `<linearGradient id="${id}-${name}-silk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${hi(c)}"/><stop offset=".18" stop-color="${c}"/><stop offset=".70" stop-color="${c}"/><stop offset="1" stop-color="${lo(c)}"/></linearGradient>`;
    for (const vertical of [false, true]) {
      defs += `<pattern id="${id}-${name}-weave-${vertical ? "v" : "h"}" patternUnits="userSpaceOnUse" width=".27" height="1"${vertical ? ' patternTransform="rotate(90)"' : ""}><rect width=".27" height="1" fill="${c}"/><path d="M-.135 0L.10 .5L-.135 1M.135 0L.37 .5L.135 1" fill="none" stroke="${hi(c)}" stroke-width=".036"/><path d="M-.09 0L.145 .5L-.09 1M.18 0L.415 .5L.18 1" fill="none" stroke="${lo(c)}" stroke-width=".025"/></pattern>`;
    }
  }
  defs += "</defs>";
  let body = "";
  if (surface === "folds") {
    const layout = o.layout ?? softFoldedLayout(qr);
    for (const [index, g] of layout.glyphs.entries()) {
      const d = polygonsPath(g.polygons),
        warmPiece = accents && g.owned.length >= 2;
      const c = warmPiece ? warm : paper,
        colour = warmPiece ? "warm" : "paper",
        clip = `${id}-fold-${index}`;
      body += `<defs><clipPath id="${clip}">${path(d, "#fff")}</clipPath></defs>${path(d, url(colour + "-silk"))}`;
      if (g.owned.length < 2) continue;
      const points = g.owned.map(
        (cell) => [(cell % n) + 0.5, Math.floor(cell / n) + 0.5] as [number, number],
      );
      // Group collinear modules into broad paper faces; shading follows each
      // complete run, not a decorative wave across the glyph bounding box.
      const turns = [0];
      for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1]!,
          b = points[i]!,
          c = points[i + 1]!;
        if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) turns.push(i);
      }
      turns.push(points.length - 1);
      body += `<g clip-path="url(#${clip})">`;
      for (let j = 1; j < turns.length; j++) {
        const a = points[turns[j - 1]!]!,
          b = points[turns[j]!]!,
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy),
          ux = dx / length,
          uy = dy / length;
        const x = (a[0] + b[0]) / 2,
          y = (a[1] + b[1]) / 2,
          grad = `${id}-face-${index}-${j}`;
        body += `<defs><linearGradient id="${grad}" gradientUnits="userSpaceOnUse" x1="${num(x + uy * 0.6)}" y1="${num(y - ux * 0.6)}" x2="${num(x - uy * 0.6)}" y2="${num(y + ux * 0.6)}"><stop stop-color="${hi(c)}"/><stop offset=".2" stop-color="${c}"/><stop offset=".66" stop-color="${c}"/><stop offset="1" stop-color="${lo(c)}"/></linearGradient></defs>`;
        body += path(
          `M${num(a[0] - ux * 0.65)} ${num(a[1] - uy * 0.65)}L${num(b[0] + ux * 0.65)} ${num(b[1] + uy * 0.65)}`,
          "none",
          ` stroke="url(#${grad})" stroke-width="1.5" stroke-linecap="butt"`,
        );
      }
      // A single broad curl at meaningful changes of direction. The band is
      // clipped to the proven paper silhouette, and cannot erase a QR core.
      const bends = turns
        .slice(1, -1)
        .map((turn, index) => ({
          turn,
          j: index + 1,
          span:
            Math.hypot(
              points[turn]![0] - points[turns[index]!]![0],
              points[turn]![1] - points[turns[index]!]![1],
            ) +
            Math.hypot(
              points[turn]![0] - points[turns[index + 2]!]![0],
              points[turn]![1] - points[turns[index + 2]!]![1],
            ),
        }))
        .sort((a, b) => b.span - a.span);
      for (const { j } of bends.slice(0, g.owned.length >= 4 ? 1 : 0)) {
        const b = points[turns[j]!]!,
          next = points[turns[j + 1]!]!;
        const angle = (Math.atan2(next[1] - b[1], next[0] - b[0]) * 180) / Math.PI,
          curl = `${id}-curl-${index}-${j}`;
        body += `<defs><linearGradient id="${curl}"><stop stop-color="${lo(c)}"/><stop offset=".24" stop-color="${lo(c)}"/><stop offset=".55" stop-color="${hi(c)}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`;
        body += `<g transform="translate(${num(b[0])} ${num(b[1])}) rotate(${num(angle)})">${path("M-.65-.85Q-.42-.30 .03.07T.74.8L1.05.8Q.69.13 .43-.10T-.2-.85Z", `url(#${curl})`)}</g>`;
      }
      body += "</g>";
    }
  } else {
    const { runs, horizontal, vertical } = wovenRuns(qr);
    const stripe = (run: Run, x = run.x, y = run.y, w = run.w, h = run.h) => {
      const useWarm = accents && run.vertical,
        c = useWarm ? warm : paper,
        name = useWarm ? "warm" : "paper";
      let out =
        rect(x, y, w, h, c) + rect(x, y, w, h, url(`${name}-weave-${run.vertical ? "v" : "h"}`));
      // Long selvages carry hue, not alternating high/low luminance ridges.
      out += run.vertical
        ? rect(x + 0.045, y, 0.055, h, hi(c)) + rect(x + 0.9, y, 0.06, h, lo(c))
        : rect(x, y + 0.045, w, 0.055, hi(c)) + rect(x, y + 0.9, w, 0.06, lo(c));
      return out;
    };
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (qr.modules.get(y, x) && !qr.modules.isReserved(y, x))
          body += rect(x, y, 1, 1, paper) + rect(x, y, 1, 1, url("paper-weave-h"));
    for (const run of runs) body += stripe(run);
    const overByCell = new Map<number, Run>();
    for (const [cell, h] of horizontal) {
      const v = vertical.get(cell);
      if (!v) continue;
      const x = cell % n,
        y = Math.floor(cell / n);
      const through = x > h.x && x < h.x + h.w - 1 && y > v.y && y < v.y + v.h - 1;
      // Alternate at full crossings. At a T-junction, retaining the longer
      // strand avoids reducing every woven ribbon to a checkerboard of cells.
      const over = through ? ((x + y) % 2 === 0 ? h : v) : h.length >= v.length ? h : v;
      overByCell.set(cell, over);
      body += stripe(over, x, y, 1, 1);
    }
    // Draw shadows after all upper strips. A shadow is permitted only on an
    // exposed portion of its own lower strand, never across an adjacent top.
    for (const [cell, over] of overByCell) {
      const x = cell % n,
        y = Math.floor(cell / n),
        h = horizontal.get(cell)!,
        v = vertical.get(cell)!;
      const under = over.vertical ? h : v;
      const exposed = (x: number, y: number) => {
        const top = overByCell.get(y * n + x);
        return !top || top.vertical === under.vertical;
      };
      const c = accents && under.vertical ? warm : paper,
        shade = mix(c, bg, 0.025);
      if (over.vertical) {
        if (x > h.x && exposed(x - 1, y)) body += rect(x - 0.13, y, 0.13, 1, shade);
        if (x < h.x + h.w - 1 && exposed(x + 1, y)) body += rect(x + 1, y, 0.13, 1, shade);
      } else {
        if (y > v.y && exposed(x, y - 1)) body += rect(x, y - 0.13, 1, 0.13, shade);
        if (y < v.y + v.h - 1 && exposed(x, y + 1)) body += rect(x, y + 1, 1, 0.13, shade);
      }
    }
  }
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let service = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.isReserved(y, x) && qr.modules.get(y, x) && !finder(x, y))
        service += `M${x} ${y}h1v1h-1Z`;
  body += path(service, paper);
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as [number, number][]) {
    if (surface === "folds") {
      const name = light && accents ? "warm" : "paper",
        frame = name === "warm" ? warm : paper,
        clip = `${id}-eye-${x}-${y}`;
      const high = mix(frame, "#fff1d3", soft ? 0.025 : 0.13),
        low = mix(frame, light ? bg : "#000000", soft ? 0.035 : 0.17);
      body += `<defs><clipPath id="${clip}">${rect(x, y, 7, 7, "#fff", 0.95)}</clipPath></defs>${rect(x, y, 7, 7, url(name + "-silk"), 0.95)}<g clip-path="url(#${clip})">`;
      body +=
        path(`M${x} ${y}h7l-1 1h-5Z`, high) +
        path(`M${x} ${y}l1 1v5l-1 1Z`, frame) +
        path(`M${x + 7} ${y}v7l-1-1v-5Z`, lo(frame)) +
        path(`M${x} ${y + 7}l1-1h5l1 1Z`, low);
      body += `</g>${rect(x + 1, y + 1, 5, 5, bg, 0.58)}${rect(x + 2, y + 2, 3, 3, url("paper-silk"), 0.42)}`;
      body += path(
        `M${x + 2.25} ${y + 2.7}Q${x + 2.25} ${y + 2.25} ${x + 2.7} ${y + 2.25}h1.5`,
        "none",
        ` stroke="${hi(paper)}" stroke-width=".12" stroke-linecap="round"`,
      );
    } else {
      // Four mitred straps turn the fibre direction with the finder frame.
      const clip = `${id}-eye-${x}-${y}`,
        d = `M${x} ${y}h7v7h-7ZM${x + 1} ${y + 1}v5h5v-5Z`;
      body += `<defs><clipPath id="${clip}">${path(d, "#fff", ' fill-rule="evenodd"')}</clipPath></defs>${path(d, paper, ' fill-rule="evenodd"')}<g clip-path="url(#${clip})">`;
      body +=
        path(`M${x} ${y}h7l-1 1h-5Z`, url("paper-weave-h")) +
        path(`M${x} ${y}l1 1v5l-1 1Z`, url("paper-weave-v")) +
        path(`M${x + 7} ${y}v7l-1-1v-5Z`, url("paper-weave-v")) +
        path(`M${x} ${y + 7}l1-1h5l1 1Z`, url("paper-weave-h"));
      body +=
        "</g>" +
        rect(x + 2, y + 2, 3, 3, accents ? warm : paper) +
        rect(x + 2, y + 2, 3, 3, url(accents ? "warm-weave-v" : "paper-weave-v"));
    }
  }
  return defs + body;
}
