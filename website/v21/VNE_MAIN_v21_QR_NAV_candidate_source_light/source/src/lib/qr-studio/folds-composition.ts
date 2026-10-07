import QRCode from "qrcode";
import { foldsLayout, scoreFoldsMatrix } from "./folds-layout";
/** Eight standards-valid Q masks, ranked only by matrix geometry. No payload
 * lookup table and no dependence on the approved Origami composition chooser. */
export function chooseFoldsComposition(text: string) {
  if (!text.trim()) throw Error("Empty payload");
  const candidates = Array.from({ length: 8 }, (_, mask) => {
    const qr = QRCode.create(text, {
      errorCorrectionLevel: "Q",
      maskPattern: mask as QRCode.QRCodeMaskPattern,
    });
    return { qr, mask, fast: scoreFoldsMatrix(qr) };
  })
    .sort((a, b) => b.fast - a.fast || a.mask - b.mask)
    .slice(0, 4);
  return candidates
    .map((c) => ({ ...c, layout: foldsLayout(c.qr), searched: 8 }))
    .sort((a, b) => b.layout.score - a.layout.score || b.fast - a.fast || a.mask - b.mask)[0]!;
}
