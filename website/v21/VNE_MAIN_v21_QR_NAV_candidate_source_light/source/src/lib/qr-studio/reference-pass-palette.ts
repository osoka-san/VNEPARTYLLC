import { passQrPalette, PASS_QR_PALETTES, isPassAccess, type QrPalette } from "./pass-palette";
import { ENGINE_VERSION, engineForPattern, supportsPatternEngine, type Pattern } from "./pattern";
import type { PassAccess } from "@/components/tickets/types";

/** New reference-style finishes only. Never recolour saved v0.5 passes. */
export const REFERENCE_PASS_PALETTES: Record<PassAccess, QrPalette & { label: string }> = {
  GENERAL: { ...PASS_QR_PALETTES.GENERAL },
  VIP: { ...PASS_QR_PALETTES.VIP, bg: "#0b0f0c" },
  SECURITY: { ...PASS_QR_PALETTES.SECURITY, bg: "#07170e" },
  ARTIST: { ...PASS_QR_PALETTES.ARTIST },
};
export function referencePassQrPalette(access: unknown) {
  return REFERENCE_PASS_PALETTES[isPassAccess(access) ? access : "GENERAL"];
}
export function designQrPalette(
  access: PassAccess,
  design?: { engineVersion: string; pattern: Pattern },
) {
  return design &&
    design.engineVersion !== ENGINE_VERSION &&
    supportsPatternEngine(design.engineVersion, design.pattern)
    ? referencePassQrPalette(access)
    : passQrPalette(access);
}
export function currentPatternQrPalette(pattern: Pattern, access: PassAccess) {
  return designQrPalette(access, { pattern, engineVersion: engineForPattern(pattern) });
}
