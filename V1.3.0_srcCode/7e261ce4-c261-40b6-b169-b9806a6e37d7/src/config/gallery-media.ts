/** Original candidate PNGs are retained under public/media/gallery/original.
 * The site requests only these browser-ready copies. */
export const galleryMedia = {
  hero: {
    desktop: "/media/gallery/web/gallery-hero-desktop-v1.webp",
    mobile: "/media/gallery/web/gallery-hero-mobile-v2.webp",
  },
  space: {
    desktop: "/media/gallery/web/gallery-space-desktop-v1.webp",
    mobile: "/media/gallery/web/gallery-space-mobile-v1.webp",
  },
  belonging: {
    desktop: "/media/gallery/web/gallery-belonging-desktop-v1.webp",
    mobile: "/media/gallery/web/gallery-belonging-mobile-v1.webp",
  },
  invitation: {
    desktop: "/media/gallery/web/gallery-invitation-desktop-v1.webp",
    mobile: "/media/gallery/web/gallery-invitation-mobile-v1.webp",
  },
} as const;

export type GalleryScene = keyof typeof galleryMedia;
