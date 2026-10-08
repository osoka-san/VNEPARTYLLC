export type EditorialMedia = {
  src: string;
  avifSrcSet: string;
  webpSrcSet: string;
  width: number;
  height: number;
};

const BASE = "/media/gallery-of-light/final-v6";

export function editorialFor(
  stem: string,
  width: number,
  height: number,
  widths: number[],
  avifWidths = widths,
): EditorialMedia {
  const srcWidth = widths.at(-1) ?? width;
  const set = (format: "avif" | "webp", values: number[]) =>
    values.map((value) => `${BASE}/${stem}-${value}.${format} ${value}w`).join(", ");
  return {
    src: `${BASE}/${stem}-${srcWidth}.webp`,
    avifSrcSet: set("avif", avifWidths),
    webpSrcSet: set("webp", widths),
    width,
    height,
  };
}

export const editorialMedia = {
  eventLightInterval: editorialFor(
    "vne-event-light-interval-v5-c",
    1586,
    992,
    [480, 800, 1280, 1586],
  ),
  eventResonance: editorialFor("vne-event-resonance-v6", 1586, 992, [480, 800, 1280, 1586]),
  aboutStone: editorialFor("vne-about-stone-detail-v5-d", 1448, 1086, [480, 800, 1280, 1448]),
  aboutPines: editorialFor("vne-about-pine-canopy-v6", 1448, 1086, [480, 800, 1280, 1448]),
  aboutWater: editorialFor("vne-about-dark-water-reflection-v6", 1672, 941, [480, 800, 1280, 1672]),
} as Record<
  "eventLightInterval" | "eventResonance" | "aboutStone" | "aboutPines" | "aboutWater",
  EditorialMedia
>;
