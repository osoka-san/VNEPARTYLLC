import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  focalPosition,
  galleryMedia,
  mediaSrcSet,
  mediaUrl,
  type GalleryChapter,
} from "@/content/gallery-media";
import { ImageReveal } from "@/components/motion/Primitives";
import belongingDesktop from "@/assets/vne-belonging-gallery-v2-desktop.jpg";

const MOBILE_QUERY = "(max-width: 639px)";

const replacementMedia: Partial<Record<GalleryChapter, { desktop: string }>> = {
  belonging: { desktop: belongingDesktop },
};

export function GalleryBackground({ chapter }: { chapter: GalleryChapter }) {
  const { desktop, mobile } = galleryMedia[chapter];
  const isHero = chapter === "hero";
  const replacement = replacementMedia[chapter];
  const pictureRef = useRef<HTMLPictureElement>(null);
  const [shouldLoad, setShouldLoad] = useState(isHero);
  const style = {
    "--gallery-position-desktop": focalPosition(desktop),
    "--gallery-position-mobile": focalPosition(mobile),
  } as CSSProperties;

  useEffect(() => {
    if (isHero || shouldLoad) return;
    const node = pictureRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "35% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isHero, shouldLoad]);

  return (
    <ImageReveal className="pointer-events-none absolute inset-0">
      <picture
        ref={pictureRef}
        className="gallery-background block h-full w-full"
        style={style}
        aria-hidden="true"
        data-gallery-background={chapter}
      >
        {shouldLoad && (
          <>
            <source
              media={MOBILE_QUERY}
              type="image/avif"
              srcSet={mediaSrcSet(mobile, "avif")}
              sizes="100vw"
            />
            <source
              media={MOBILE_QUERY}
              type="image/webp"
              srcSet={mediaSrcSet(mobile, "webp")}
              sizes="100vw"
            />
            {replacement ? (
              <source media="(min-width: 640px)" type="image/jpeg" srcSet={replacement.desktop} />
            ) : (
              <>
                <source type="image/avif" srcSet={mediaSrcSet(desktop, "avif")} sizes="100vw" />
                <source type="image/webp" srcSet={mediaSrcSet(desktop, "webp")} sizes="100vw" />
              </>
            )}
            <img
              src={replacement?.desktop ?? mediaUrl(desktop, 1280, "webp")}
              width={desktop.width}
              height={desktop.height}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              decoding="async"
              loading={isHero ? "eager" : "lazy"}
              fetchPriority={isHero ? "high" : "auto"}
            />
          </>
        )}
      </picture>
      {!isHero && (
        // 03.8-05: without JS the IntersectionObserver never runs; noscript keeps the
        // chapter background available (lazy, same derivative sizes).
        <noscript>
          <picture
            className="gallery-background absolute inset-0 block h-full w-full"
            style={style}
          >
            <source
              media={MOBILE_QUERY}
              type="image/webp"
              srcSet={mediaSrcSet(mobile, "webp")}
              sizes="100vw"
            />
            {replacement ? (
              <source media="(min-width: 640px)" type="image/jpeg" srcSet={replacement.desktop} />
            ) : (
              <source type="image/webp" srcSet={mediaSrcSet(desktop, "webp")} sizes="100vw" />
            )}
            <img
              src={replacement?.desktop ?? mediaUrl(desktop, 1280, "webp")}
              width={desktop.width}
              height={desktop.height}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              data-gallery-noscript={chapter}
            />
          </picture>
        </noscript>
      )}
    </ImageReveal>
  );
}
