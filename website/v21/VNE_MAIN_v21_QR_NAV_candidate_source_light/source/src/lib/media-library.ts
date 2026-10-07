/**
 * Редактируемые изображения сайта: слоты, библиотека утверждённых файлов и применение замен.
 * Замены применяются к общим объектам galleryMedia / editorialMedia до рендера (root loader),
 * поэтому все места показа видят одно и то же значение. Без замен — утверждённый набор final-v6.
 */
import {
  galleryMedia,
  type GalleryChapter,
  type GalleryMediaVariant,
} from "@/content/gallery-media";
import { editorialMedia, editorialFor, type EditorialMedia } from "@/content/editorial-media";

export type GallerySlot = { key: string; kind: "gallery"; chapter: GalleryChapter; label: string };
export type EditorialSlot = {
  key: string;
  kind: "editorial";
  target: keyof typeof editorialMedia;
  label: string;
  area: string;
};
export type MediaSlot = GallerySlot | EditorialSlot;

export const MEDIA_SLOTS: MediaSlot[] = [
  { key: "home-hero", kind: "gallery", chapter: "hero", label: "Главная · Порог" },
  { key: "home-space", kind: "gallery", chapter: "space", label: "Главная · Пространство" },
  {
    key: "home-belonging",
    kind: "gallery",
    chapter: "belonging",
    label: "Главная · Принадлежность",
  },
  {
    key: "home-invitation",
    kind: "gallery",
    chapter: "invitation",
    label: "Главная · Приглашение",
  },
  {
    key: "event-resonance",
    kind: "editorial",
    target: "eventResonance",
    area: "События",
    label: "События · Резонанс",
  },
  {
    key: "event-light-interval",
    kind: "editorial",
    target: "eventLightInterval",
    area: "События",
    label: "События · Световой интервал",
  },
  {
    key: "about-pines",
    kind: "editorial",
    target: "aboutPines",
    area: "О ВНЕ",
    label: "О ВНЕ · Сосны",
  },
  {
    key: "about-stone",
    kind: "editorial",
    target: "aboutStone",
    area: "О ВНЕ",
    label: "О ВНЕ · Камень",
  },
  {
    key: "about-water",
    kind: "editorial",
    target: "aboutWater",
    area: "О ВНЕ",
    label: "О ВНЕ · Тёмная вода",
  },
];

const DESKTOP = { widths: [1280, 1672], width: 1672, height: 941 };
const MOBILE = { widths: [480, 768, 941], width: 941, height: 1672 };

export const GALLERY_LIBRARY = {
  desktop: [
    { id: "vne-threshold-gallery-v5-c-desktop", label: "Порог" },
    { id: "vne-space-gallery-v6-desktop", label: "Пространство" },
    { id: "vne-belonging-gallery-v6-desktop", label: "Принадлежность" },
    { id: "vne-invitation-gallery-v6-desktop", label: "Приглашение" },
  ],
  mobile: [
    { id: "vne-threshold-gallery-v5-c-mobile", label: "Порог" },
    { id: "vne-space-gallery-v6-mobile", label: "Пространство" },
    { id: "vne-belonging-gallery-v5-d-mobile", label: "Принадлежность" },
    { id: "vne-invitation-gallery-v5-c-mobile", label: "Приглашение" },
  ],
} as const;

export const EDITORIAL_LIBRARY = [
  {
    id: "vne-event-resonance-v6",
    label: "Резонанс",
    w: 1586,
    h: 992,
    widths: [480, 800, 1280, 1586],
  },
  {
    id: "vne-event-light-interval-v5-c",
    label: "Световой интервал",
    w: 1586,
    h: 992,
    widths: [480, 800, 1280, 1586],
  },
  {
    id: "vne-event-stone-sculpture-v5-c",
    label: "Каменная скульптура (резерв)",
    w: 1586,
    h: 992,
    widths: [480, 800, 1280, 1586],
  },
  {
    id: "vne-about-pine-canopy-v6",
    label: "Сосны",
    w: 1448,
    h: 1086,
    widths: [480, 800, 1280, 1448],
  },
  {
    id: "vne-about-stone-detail-v5-d",
    label: "Камень",
    w: 1448,
    h: 1086,
    widths: [480, 800, 1280, 1448],
  },
  {
    id: "vne-about-dark-water-reflection-v6",
    label: "Тёмная вода",
    w: 1672,
    h: 941,
    widths: [480, 800, 1280, 1672],
  },
] as const;

/** Значение слота: из библиотеки (id) или загруженный файл (upload = путь в хранилище). */
export type MediaChoice = { lib?: string; upload?: string };
export type MediaValue =
  | { desktop?: MediaChoice; mobile?: MediaChoice } // gallery
  | { image?: MediaChoice }; // editorial
export type MediaOverrides = Record<string, MediaValue>;

export const UPLOAD_PREFIX = "/api/public/site-media/";
const UPLOAD_PATH = /^uploads\/[0-9a-f-]{36}\.(avif|webp|jpg|png)$/;
export const isUploadPath = (v: unknown): v is string =>
  typeof v === "string" && UPLOAD_PATH.test(v);
export const uploadUrl = (path: string) => `${UPLOAD_PREFIX}${path}`;

export function isValidChoice(slot: MediaSlot, part: string, c: unknown): c is MediaChoice {
  if (!c || typeof c !== "object") return false;
  const { lib, upload } = c as MediaChoice;
  if (upload !== undefined) return lib === undefined && isUploadPath(upload);
  if (typeof lib !== "string") return false;
  if (slot.kind === "gallery")
    return (GALLERY_LIBRARY[part as "desktop" | "mobile"] ?? []).some((x) => x.id === lib);
  return EDITORIAL_LIBRARY.some((x) => x.id === lib);
}

// Снимки утверждённых значений по умолчанию.
const galleryDefaults = JSON.parse(JSON.stringify(galleryMedia)) as typeof galleryMedia;
const editorialDefaults = { ...editorialMedia };

function galleryVariant(
  base: GalleryMediaVariant,
  part: "desktop" | "mobile",
  c: MediaChoice | undefined,
): GalleryMediaVariant {
  if (!c) return { ...base };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { formatWidths, src, ...rest } = base;
  if (c.upload) return { ...rest, src: uploadUrl(c.upload) };
  const dims = part === "desktop" ? DESKTOP : MOBILE;
  return { ...rest, ...dims, id: c.lib! };
}

function editorialValue(base: EditorialMedia, c: MediaChoice | undefined): EditorialMedia {
  if (!c) return base;
  if (c.upload) {
    const url = uploadUrl(c.upload);
    return { ...base, src: url, avifSrcSet: url, webpSrcSet: url };
  }
  const item = EDITORIAL_LIBRARY.find((x) => x.id === c.lib);
  return item ? editorialFor(item.id, item.w, item.h, [...item.widths]) : base;
}

let appliedKey = "";
/** Идемпотентно применяет замены (пустой объект — вернуть утверждённый набор). */
export function applyMediaOverrides(overrides: MediaOverrides | undefined) {
  const key = JSON.stringify(overrides ?? {});
  if (key === appliedKey) return;
  appliedKey = key;
  for (const slot of MEDIA_SLOTS) {
    const v = overrides?.[slot.key] as Record<string, MediaChoice> | undefined;
    if (slot.kind === "gallery") {
      const d = galleryDefaults[slot.chapter];
      galleryMedia[slot.chapter].desktop = galleryVariant(d.desktop, "desktop", v?.["desktop"]);
      galleryMedia[slot.chapter].mobile = galleryVariant(d.mobile, "mobile", v?.["mobile"]);
    } else {
      (editorialMedia as Record<string, EditorialMedia>)[slot.target] = editorialValue(
        editorialDefaults[slot.target],
        v?.["image"],
      );
    }
  }
}

/** Превью значения для админки (одна картинка). */
export function previewUrl(slot: MediaSlot, part: string, c: MediaChoice | undefined): string {
  if (c?.upload) return uploadUrl(c.upload);
  const base = "/media/gallery-of-light/final-v6";
  if (slot.kind === "gallery") {
    const id = c?.lib ?? galleryDefaults[slot.chapter][part as "desktop" | "mobile"].id;
    return `${base}/${id}-${part === "desktop" ? 1280 : 480}.webp`;
  }
  if (c?.lib) return `${base}/${c.lib}-480.webp`;
  return editorialDefaults[slot.target].webpSrcSet.split(" ")[0]!;
}
