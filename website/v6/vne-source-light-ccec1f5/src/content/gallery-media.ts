// Официальная библиотека VNE Gallery of Light.
// Базовые главы: v1; актуальный утверждённый набор: final-v6.

export type GalleryChapter = "hero" | "space" | "belonging" | "invitation";
type Variant = "desktop" | "mobile";

export interface GalleryMediaVariant {
  id: string;
  base?: string;
  widths: number[];
  width: number;
  height: number;
  focal: { x: number; y: number };
  formatWidths?: Partial<Record<"avif" | "webp", number[]>>;
  /** Замена из админки: один готовый файл вместо адаптивного набора. */
  src?: string;
}

export interface GalleryMediaPair {
  desktop: GalleryMediaVariant;
  mobile: GalleryMediaVariant;
}

const BASE = "/media/gallery-of-light/final-v6";
const DESKTOP = { widths: [1280, 1672], width: 1672, height: 941 };
const MOBILE = { widths: [480, 768, 941], width: 941, height: 1672 };

export const galleryMedia = {
  hero: {
    desktop: {
      id: "vne-threshold-gallery-v5-c-desktop",
      ...DESKTOP,
      focal: { x: 0.5, y: 0.5 },
    },
    mobile: {
      id: "vne-threshold-gallery-v5-c-mobile",
      ...MOBILE,
      focal: { x: 0.5, y: 0 },
    },
  },
  space: {
    desktop: { id: "vne-space-gallery-v6-desktop", ...DESKTOP, focal: { x: 0.5, y: 0.5 } },
    mobile: { id: "vne-space-gallery-v6-mobile", ...MOBILE, focal: { x: 0.5, y: 0 } },
  },
  belonging: {
    desktop: { id: "vne-belonging-gallery-v6-desktop", ...DESKTOP, focal: { x: 0.5, y: 0.5 } },
    mobile: {
      id: "vne-belonging-gallery-v5-d-mobile",
      ...MOBILE,
      focal: { x: 0.5, y: 0 },
    },
  },
  invitation: {
    desktop: { id: "vne-invitation-gallery-v6-desktop", ...DESKTOP, focal: { x: 0.5, y: 0.5 } },
    mobile: {
      id: "vne-invitation-gallery-v5-c-mobile",
      ...MOBILE,
      focal: { x: 0.5, y: 0 },
    },
  },
} as Record<GalleryChapter, Record<Variant, GalleryMediaVariant>>;

export function mediaUrl(v: GalleryMediaVariant, width: number, format: "avif" | "webp") {
  if (v.src) return v.src;
  return `${v.base ?? BASE}/${v.id}-${width}.${format}`;
}

export function mediaSrcSet(v: GalleryMediaVariant, format: "avif" | "webp") {
  if (v.src) return `${v.src} ${v.width}w`;
  return (v.formatWidths?.[format] ?? v.widths)
    .map((w) => `${mediaUrl(v, w, format)} ${w}w`)
    .join(", ");
}

// Крошечные затемнённые превью (LQIP) первого экрана, сгенерированные из утверждённых
// ассетов final-v6. Встраиваются в разметку, чтобы на медленной сети вместо чистого
// тёмного фона сразу был виден силуэт сцены.
export const heroLqip = {
  desktop:
    "data:image/webp;base64,UklGRpAAAABXRUJQVlA4IIQAAADQBACdASogABIAPtFao02oJSMiKA1RABoJZwAAvgXJxYei7f8D+VI2JqTb0+S0lAD+9o/DHUAEVtRP33q2Qa8Ye6QAl1kBMbvoF9Sm4TX9rSSuFp/PK33DJvozItDAMwJQHYOhzKNjUhXc8YwPwSjVuZ3hp8yC8JL0VqNr2JXRPACOAAA=",
  mobile:
    "data:image/webp;base64,UklGRrQAAABXRUJQVlA4IKgAAABwBgCdASoSACAAPtFSpEuoJKOhsBgMAQAaCWUAv1lZP/23+BeCDfKPuPHh6JLfw3AuWXgUa2mFbUjVgwAA/vd0sRYr9CY8GdQUmNB7T14pEhmPibwHLa80h5u++z8VtPgdbkFXRwufcf6YIUctJoWXeHz7Uc3Rcm4hRsAf1Y9BoeU1eI4gGq6QZFLMeSoGmxb5Zw7Wyjgfwjfg0Kd2bcKzbBm+DLcAAAA=",
} as const;

export function focalPosition(v: GalleryMediaVariant) {
  return `${Math.round(v.focal.x * 100)}% ${Math.round(v.focal.y * 100)}%`;
}
