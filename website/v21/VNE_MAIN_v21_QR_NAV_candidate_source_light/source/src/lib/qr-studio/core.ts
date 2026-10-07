import QRCode from "qrcode";
import { createOrigamiArtwork } from "./origami-core";
import { createSelectedArtwork } from "./selected-core";
import { engineForPattern, supportsPatternEngine, ORIGAMI_ENGINE_VERSION } from "./pattern";
import { renderMaterialQr, MATERIAL_SURFACES, type MaterialSurface } from "./material-renderer";
import { createQrMatrixCandidates } from "./matrix-candidates";
import { macroLayout, renderMacroGlyphs } from "./macro-glyphs";

import { ENGINE_VERSION, PALETTES, parsePattern, type Pattern } from "./pattern";
import { isPassAccess, passQrPalette } from "./pass-palette";
import type { PassAccess } from "@/components/tickets/types";
export {
  ENGINE_VERSION,
  engineForPattern,
  PALETTES,
  PATTERNS,
  parsePattern,
  type Pattern,
} from "./pattern";
function hash(text: string) {
  let h = 2166136261;
  for (const c of new TextEncoder().encode(text)) {
    h ^= c;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function chooseLayout(
  text: string,
  geometry: Pattern["geometry"],
  rounding: number,
  template?: Pattern["template"],
) {
  const search = createQrMatrixCandidates(text, { keep: 8 });
  const candidates = search.candidates
    .map((candidate) => {
      const layout = macroLayout(candidate.qr, rounding, geometry === "flow", template);
      return {
        qr: candidate.qr,
        maskPattern: candidate.mask,
        cuts: candidate.cuts,
        layout,
        score: layout.score,
        searched: search.searchedMatrices,
      };
    })
    .sort((a, b) => b.score - a.score || a.maskPattern - b.maskPattern);
  return candidates[0]!;
}
// Bounded in-memory cache only. Changing a label or colour does not
// repeat the graph search. Payloads are never persisted or sent to a server.
const layouts = new Map<string, ReturnType<typeof chooseLayout>>();
export function createArtwork(
  text: string,
  input: Pattern,
  passAccess?: PassAccess,
  requestedEngine?: string,
) {
  const pattern = parsePattern(input);
  if (passAccess !== undefined && !isPassAccess(passAccess))
    throw new Error("Неизвестный тип пропуска.");
  const palette = passAccess ? passQrPalette(passAccess) : PALETTES[pattern.palette];
  const presentation = passAccess ? { passAccess } : {};
  if (!text.trim()) throw new Error("Введите текст или ссылку.");
  if (new TextEncoder().encode(text).length > 220)
    throw new Error(
      "Для этого стиля используйте до 220 байт: короткая ссылка оставляет больше места рисунку.",
    );
  const engine = requestedEngine ?? engineForPattern(pattern);
  if (!supportsPatternEngine(engine, pattern))
    throw new Error("Эта версия оформления не поддерживается.");
  if (engine === ORIGAMI_ENGINE_VERSION) return createOrigamiArtwork(text, pattern, passAccess);
  if (engine !== ENGINE_VERSION) return createSelectedArtwork(text, pattern, passAccess);
  if (pattern.template && MATERIAL_SURFACES.includes(pattern.template as MaterialSurface)) {
    const qr = QRCode.create(text, { errorCorrectionLevel: "Q" });
    const n = qr.modules.size,
      side = n + 8;
    const { bg, fg, accent } = palette;
    const drawn = renderMaterialQr(qr, {
      surface: pattern.template as MaterialSurface,
      foreground: fg,
      background: bg,
      accent,
      accents: pattern.accents,
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 ${side} ${side}" role="img" aria-label="QR-код"><rect width="${side}" height="${side}" fill="${bg}"/><svg x="4" y="4" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" overflow="hidden">${drawn}</svg></svg>`;
    return {
      svg,
      fingerprint: hash(JSON.stringify({ text, pattern, engine: ENGINE_VERSION, ...presentation })),
      version: qr.version,
      mask: qr.maskPattern ?? 0,
      searchedMatrices: 1,
      macroGlyphs: 0,
      macroCoverage: 0,
      size: n,
      inverted: passAccess ? ["VIP", "SECURITY"].includes(passAccess) : pattern.palette === "night",
      matrix: Array.from(qr.modules.data),
      reserved: Array.from(qr.modules.reservedBit),
    };
  }
  const key = JSON.stringify([text, pattern.geometry, pattern.rounding, pattern.template]);
  let chosen = layouts.get(key);
  if (!chosen) {
    chosen = chooseLayout(text, pattern.geometry, pattern.rounding, pattern.template);
    if (layouts.size >= 8) layouts.delete(layouts.keys().next().value!);
    layouts.set(key, chosen);
  }
  const { qr, maskPattern, layout } = chosen;
  const n = qr.modules.size,
    side = n + 8;
  const { bg, fg, accent } = palette;
  let service = "",
    drawn = "";
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.isReserved(y, x) && qr.modules.get(y, x) && !finder(x, y))
        service += `M${x} ${y}h1v1h-1Z`;
  drawn = renderMacroGlyphs(layout, { foreground: fg, accent, accents: pattern.accents });
  let eyes = "";
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ])
    eyes += `<rect x="${x}" y="${y}" width="7" height="7" rx="${pattern.geometry === "syncopa" ? 0.6 : 0.3}" fill="${fg}"/><rect x="${x! + 1}" y="${y! + 1}" width="5" height="5" rx=".12" fill="${bg}"/><rect x="${x! + 2}" y="${y! + 2}" width="3" height="3" fill="${fg}"/>`;
  const fingerprint = hash(
    JSON.stringify({
      text,
      pattern,
      engine: ENGINE_VERSION,
      maskPattern,
      cuts: chosen.cuts,
      ...presentation,
    }),
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 ${side} ${side}" role="img" aria-label="QR-код"><rect width="${side}" height="${side}" fill="${bg}"/><svg x="4" y="4" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" overflow="hidden"><path fill="${fg}" d="${service}"/>${eyes}${drawn}</svg></svg>`;
  return {
    svg,
    fingerprint,
    version: qr.version,
    mask: maskPattern,
    searchedMatrices: chosen.searched,
    macroGlyphs: layout.macroCount,
    macroCoverage: layout.macroCells / layout.dataCells,
    size: n,
    inverted: passAccess ? ["VIP", "SECURITY"].includes(passAccess) : pattern.palette === "night",
    matrix: Array.from(qr.modules.data),
    reserved: Array.from(qr.modules.reservedBit),
  };
}
export const TEST_PAYLOADS = [
  "на удачу",
  "ВНЕ / для своих",
  "Лес · музыка · ночь",
  "VNE 🌲 2026",
  ...Array.from(
    { length: 12 },
    (_, i) => `https://example.org/vne/${String(i + 1).padStart(2, "0")}`,
  ),
  "https://example.org/a",
  "https://example.org/events/forest-night-preview",
  "https://example.org/invitation?event=forest-night&sample=19",
  "https://example.org/" + "a".repeat(100),
];
