import type QRCode from "qrcode";
import { createQrMatrixCandidates } from "./matrix-candidates";
import { foldedLayout } from "./folded-layout";
import { renderOrigamiQr } from "./origami-renderer";
import { ORIGAMI_ENGINE_VERSION, PALETTES, type Pattern } from "./pattern";
import { referencePassQrPalette } from "./reference-pass-palette";
import type { PassAccess } from "@/components/tickets/types";
function scoreFoldedMatrix(qr: QRCode.QRCode) {
  const n = qr.modules.size,
    dark = qr.modules.data,
    reserved = qr.modules.reservedBit;
  let score = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const id = y * n + x;
      if (!dark[id] || reserved[id]) continue;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= n || y + dy >= n) continue;
          const other = (y + dy) * n + x + dx;
          if (!dark[other] || reserved[other]) continue;
          if (
            dx &&
            dy &&
            (dark[y * n + x + dx] ||
              dark[(y + dy) * n + x] ||
              reserved[y * n + x + dx] ||
              reserved[(y + dy) * n + x])
          )
            continue;
          neighbours++;
        }
      score += neighbours === 0 ? -16 : neighbours === 1 ? 1 : neighbours === 2 ? 5 : 0;
    }
  return score;
}
function chooseLayout(text: string) {
  const search = createQrMatrixCandidates(text, { keep: 8, score: scoreFoldedMatrix });
  return search.candidates
    .map((candidate) => {
      const layout = foldedLayout(candidate.qr);
      return { ...candidate, layout, searched: search.searchedMatrices };
    })
    .sort((a, b) => b.layout.score - a.layout.score || a.mask - b.mask)[0]!;
}
const cache = new Map<string, ReturnType<typeof chooseLayout>>();
function hash(text: string) {
  let h = 2166136261;
  for (const c of new TextEncoder().encode(text)) {
    h ^= c;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function createOrigamiArtwork(text: string, pattern: Pattern, passAccess?: PassAccess) {
  let chosen = cache.get(text);
  if (!chosen) {
    chosen = chooseLayout(text);
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(text, chosen);
  }
  const { qr, layout } = chosen;
  const n = qr.modules.size,
    side = n + 8;
  const palette = passAccess ? referencePassQrPalette(passAccess) : PALETTES[pattern.palette];
  const drawn = renderOrigamiQr(qr, {
    foreground: palette.fg,
    background: palette.bg,
    accent: palette.accent,
    accents: pattern.accents,
    cardPalette: passAccess !== undefined,
    layout,
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 ${side} ${side}" role="img" aria-label="QR-код"><rect width="${side}" height="${side}" fill="${palette.bg}"/><svg x="4" y="4" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" overflow="hidden">${drawn}</svg></svg>`;
  return {
    svg,
    fingerprint: hash(
      JSON.stringify({
        text,
        pattern,
        engine: ORIGAMI_ENGINE_VERSION,
        maskPattern: chosen.mask,
        cuts: chosen.cuts,
        ...(passAccess ? { passAccess } : {}),
      }),
    ),
    version: qr.version,
    mask: chosen.mask,
    searchedMatrices: chosen.searched,
    macroGlyphs: layout.macroCount,
    macroCoverage: layout.macroCells / layout.dataCells,
    size: n,
    inverted: passAccess ? ["VIP", "SECURITY"].includes(passAccess) : pattern.palette === "night",
    matrix: Array.from(qr.modules.data),
    reserved: Array.from(qr.modules.reservedBit),
  };
}

export { chooseLayout as choosePaperComposition };
