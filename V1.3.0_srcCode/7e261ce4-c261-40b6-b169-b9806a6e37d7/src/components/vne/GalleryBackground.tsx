import { galleryMedia, type GalleryScene } from "@/config/gallery-media";

/** Decorative image only; headings, links and the portal remain live elements. */
export function GalleryBackground({ scene }: { scene: GalleryScene }) {
  const media = galleryMedia[scene];

  return (
    <picture className={`gallery-background gallery-background--${scene}`} aria-hidden="true">
      <source media="(max-width: 639px)" srcSet={media.mobile} type="image/webp" />
      <img
        src={media.desktop}
        alt=""
        loading={scene === "hero" ? "eager" : "lazy"}
        fetchPriority={scene === "hero" ? "high" : undefined}
        decoding="async"
        width={1672}
        height={941}
      />
    </picture>
  );
}
