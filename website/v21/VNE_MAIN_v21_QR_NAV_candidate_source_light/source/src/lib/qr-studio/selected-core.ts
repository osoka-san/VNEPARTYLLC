import QRCode from "qrcode";
import { renderBlockQr, scoreBlockMatrix } from "./block-renderer";
import { renderBeadQr } from "./bead-renderer";
import { renderRibbonQr } from "./ribbon-renderer";
import { chooseFoldsComposition } from "./folds-composition";
import { renderFoldsQr } from "./folds-renderer";
import { PALETTES, engineForPattern, type Pattern } from "./pattern";
import { type QrPalette } from "./pass-palette";
import { referencePassQrPalette } from "./reference-pass-palette";
import type { PassAccess } from "@/components/tickets/types";

export function selectedPalette(pattern: Pattern, passAccess?: PassAccess): QrPalette {
  if (passAccess) return referencePassQrPalette(passAccess);
  if (pattern.template === "basalt" && pattern.palette === "mint")
    return { bg: "#82bba5", fg: "#101613", accent: "#e55330" };
  return PALETTES[pattern.palette];
}
function chooseMatrix(text: string, template: Pattern["template"]) {
  if (template === "folds") {
    const chosen = chooseFoldsComposition(text);
    return { qr: chosen.qr, searched: chosen.searched, foldsLayout: chosen.layout };
  }
  if (template === "basalt" || template === "portals") {
    const qr = Array.from({ length: 8 }, (_, maskPattern) => {
      const qr = QRCode.create(text, {
        errorCorrectionLevel: "Q",
        maskPattern: maskPattern as QRCode.QRCodeMaskPattern,
      });
      return { qr, score: scoreBlockMatrix(qr, template) };
    }).sort((a, b) => b.score - a.score || (a.qr.maskPattern ?? 0) - (b.qr.maskPattern ?? 0))[0]!
      .qr;
    return { qr, searched: 8 };
  }
  return { qr: QRCode.create(text, { errorCorrectionLevel: "Q" }), searched: 1 };
}
const matrices = new Map<string, ReturnType<typeof chooseMatrix>>();
function hash(text: string) {
  let h = 2166136261;
  for (const c of new TextEncoder().encode(text)) {
    h ^= c;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function createSelectedArtwork(text: string, pattern: Pattern, passAccess?: PassAccess) {
  const key = JSON.stringify([text, pattern.template]);
  let chosen = matrices.get(key);
  if (!chosen) {
    chosen = chooseMatrix(text, pattern.template);
    if (matrices.size >= 8) matrices.delete(matrices.keys().next().value!);
    matrices.set(key, chosen);
  }
  const { qr, searched } = chosen;
  const palette = selectedPalette(pattern, passAccess);
  const options = {
    foreground: palette.fg,
    background: palette.bg,
    accent: palette.accent,
    accents: pattern.accents,
  };
  let drawn: string;
  if (pattern.template === "basalt" || pattern.template === "portals")
    drawn = renderBlockQr(qr, {
      ...options,
      surface: pattern.template,
      cardPalette: passAccess !== undefined,
    });
  else if (pattern.template === "constellation") drawn = renderBeadQr(qr, options);
  else if (pattern.template === "folds")
    drawn = renderFoldsQr(qr, {
      ...options,
      ...("foldsLayout" in chosen ? { layout: chosen.foldsLayout } : {}),
    });
  else if (pattern.template === "weave")
    drawn = renderRibbonQr(qr, {
      ...options,
      surface: pattern.template,
      cardPalette: passAccess !== undefined,
    });
  else throw new Error("Неизвестная версия материального QR.");
  const n = qr.modules.size,
    side = n + 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 ${side} ${side}" role="img" aria-label="QR-код"><rect width="${side}" height="${side}" fill="${palette.bg}"/><svg x="4" y="4" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" overflow="hidden">${drawn}</svg></svg>`;
  return {
    svg,
    fingerprint: hash(
      JSON.stringify({
        text,
        pattern,
        engine: engineForPattern(pattern),
        ...(passAccess ? { passAccess } : {}),
      }),
    ),
    version: qr.version,
    mask: qr.maskPattern ?? 0,
    searchedMatrices: searched,
    macroGlyphs: 0,
    macroCoverage: 0,
    size: n,
    inverted: passAccess ? ["VIP", "SECURITY"].includes(passAccess) : pattern.palette === "night",
    matrix: Array.from(qr.modules.data),
    reserved: Array.from(qr.modules.reservedBit),
  };
}
