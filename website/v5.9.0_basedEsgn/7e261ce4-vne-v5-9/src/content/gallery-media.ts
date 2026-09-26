// Официальная библиотека VNE Gallery of Light.
// Базовые главы: v1; точечные замены: addon-v4.

export type GalleryChapter = "hero" | "space" | "belonging" | "invitation";
type Variant = "desktop" | "mobile";

export interface GalleryMediaVariant {
  id: string;
  base?: string;
  widths: number[];
  width: number;
  height: number;
  focal: { x: number; y: number };
}

export interface GalleryMediaPair {
  desktop: GalleryMediaVariant;
  mobile: GalleryMediaVariant;
}

const BASE = "/media/gallery-of-light/v1";
const V4_BASE = "/media/gallery-of-light/addon-v4";
const DESKTOP = { widths: [1280, 1672], width: 1672, height: 941 };
const MOBILE = { widths: [480, 768, 941], width: 941, height: 1672 };

export const galleryMedia = {
  hero: {
    desktop: {
      id: "vne-threshold-gallery-v4-c-desktop",
      base: V4_BASE,
      ...DESKTOP,
      focal: { x: 0.58, y: 0.5 },
    },
    mobile: {
      id: "vne-threshold-gallery-v4-c-mobile",
      base: V4_BASE,
      ...MOBILE,
      focal: { x: 0.5, y: 0.58 },
    },
  },
  space: {
    desktop: { id: "gallery-space-desktop-v1", ...DESKTOP, focal: { x: 0.5, y: 0.5 } },
    mobile: { id: "gallery-space-mobile-v1", ...MOBILE, focal: { x: 0.5, y: 0.5 } },
  },
  belonging: {
    desktop: { id: "gallery-belonging-desktop-v1", ...DESKTOP, focal: { x: 0.5, y: 0.5 } },
    mobile: {
      id: "vne-belonging-gallery-v4-b-mobile",
      base: V4_BASE,
      ...MOBILE,
      focal: { x: 0.58, y: 0.48 },
    },
  },
  invitation: {
    desktop: { id: "gallery-invitation-desktop-v1", ...DESKTOP, focal: { x: 0.5, y: 0.5 } },
    mobile: {
      id: "vne-invitation-gallery-v4-a-mobile",
      base: V4_BASE,
      ...MOBILE,
      focal: { x: 0.5, y: 0.55 },
    },
  },
} satisfies Record<GalleryChapter, Record<Variant, GalleryMediaVariant>>;

export function mediaUrl(v: GalleryMediaVariant, width: number, format: "avif" | "webp") {
  return `${v.base ?? BASE}/${v.id}-${width}.${format}`;
}

export function mediaSrcSet(v: GalleryMediaVariant, format: "avif" | "webp") {
  return v.widths.map((w) => `${mediaUrl(v, w, format)} ${w}w`).join(", ");
}

export function focalPosition(v: GalleryMediaVariant) {
  return `${Math.round(v.focal.x * 100)}% ${Math.round(v.focal.y * 100)}%`;
}
