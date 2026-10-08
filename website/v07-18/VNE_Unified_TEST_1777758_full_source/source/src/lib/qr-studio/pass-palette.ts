import type { PassAccess } from "@/components/tickets/types";
import type { TemplateId } from "./pattern";

export type QrPalette = { bg: string; fg: string; accent: string };
/** QR ink stays on one side of the contrast threshold; the card's finish stays outside its quiet zone. */
export const PASS_QR_PALETTES: Record<PassAccess, QrPalette & { label: string }> = {
  GENERAL: { label: "Фарфор / терракота", bg: "#f0eade", fg: "#262820", accent: "#6e2e18" },
  VIP: { label: "Графит / шампань", bg: "#181b16", fg: "#eddbb3", accent: "#d7bb81" },
  SECURITY: { label: "Лес / шалфей", bg: "#15281e", fg: "#d5efd4", accent: "#9dc69d" },
  ARTIST: { label: "Серебро / индиго", bg: "#e3e7f2", fg: "#263449", accent: "#425982" },
};
export function isPassAccess(value: unknown): value is PassAccess {
  return typeof value === "string" && Object.hasOwn(PASS_QR_PALETTES, value);
}
export function passQrPalette(access: unknown) {
  return PASS_QR_PALETTES[isPassAccess(access) ? access : "GENERAL"];
}
export function passTemplateImage(template: TemplateId, access: PassAccess) {
  return `/assets/qr-studio/passes/${template}-${access.toLowerCase()}.webp`;
}
export const PASS_TEMPLATE_NOTES: Record<TemplateId, string> = {
  coupling: "Соединённые дуги и открытые промежутки",
  syncopa: "Смещённый ритм и округлые формы",
  dialogue: "Встречные изгибы и точечные акценты",
  flow: "Направленные линии и открытые срезы",
  circle: "Петли и внутренние дуги",
  shift: "Горизонтальный ритм и спокойные интервалы",
  ribs: "Цельные формы с частым рельефом",
  folds: "Ленты с мягкими гранями и сгибами",
  enamel: "Гладкая поверхность и деликатные блики",
  relief: "Тонкие линии по цельному контуру",
  basalt: "Каменная фактура и плотный силуэт",
  portals: "Вложенные рамки и архитектурные грани",
  weave: "Пересечения нитей и небольшие акценты",
  origami: "Складчатые плоскости и острые грани",
  constellation: "Ритм объёмных бусин и световых точек",
  marble: "Каменная поверхность с тонкими прожилками",
};
