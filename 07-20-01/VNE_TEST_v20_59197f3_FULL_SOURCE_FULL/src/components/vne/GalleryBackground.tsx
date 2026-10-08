import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  focalPosition,
  galleryMedia,
  heroLqip,
  mediaSrcSet,
  mediaUrl,
  type GalleryChapter,
} from "@/content/gallery-media";
import { ImageReveal } from "@/components/motion/Primitives";

const MOBILE_QUERY = "(max-width: 639px)";

const HERO_PREVIEW_EXIT_MS = 500;

export function GalleryBackground({
  chapter,
  heroRevealReady = false,
  onHeroImageReady,
  onHeroImageError,
}: {
  chapter: GalleryChapter;
  heroRevealReady?: boolean;
  onHeroImageReady?: () => void;
  onHeroImageError?: () => void;
}) {
  const { desktop, mobile } = galleryMedia[chapter];
  const isHero = chapter === "hero";
  const heroImageRef = useRef<HTMLImageElement>(null);
  const heroReadySent = useRef(false);
  const [heroPreviewMounted, setHeroPreviewMounted] = useState(isHero);
  const notifyHeroImageReady = useCallback(() => {
    if (!isHero || heroReadySent.current) return;
    const image = heroImageRef.current;
    if (!image || !image.complete || image.naturalWidth < 1) return;
    heroReadySent.current = true;
    onHeroImageReady?.();
  }, [isHero, onHeroImageReady]);

  useEffect(() => {
    const image = heroImageRef.current;
    if (!isHero || !image) return;
    if (image.complete && image.naturalWidth > 0) {
      void image
        .decode()
        .catch(() => undefined)
        .then(notifyHeroImageReady);
    }
    if (image.complete && image.naturalWidth === 0) onHeroImageError?.();
  }, [isHero, notifyHeroImageReady, onHeroImageError]);

  useEffect(() => {
    if (!isHero || !heroRevealReady) return;
    const timer = window.setTimeout(() => setHeroPreviewMounted(false), HERO_PREVIEW_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [heroRevealReady, isHero]);
  // Non-hero chapters use native lazy loading in the SSR markup: it works before hydration
  // (slow networks) and survives ImageReveal swapping its wrapper after hydration, which
  // previously left a JS IntersectionObserver bound to a detached node. No-JS works too.
  const style = {
    "--gallery-position-desktop": focalPosition(desktop),
    "--gallery-position-mobile": focalPosition(mobile),
  } as CSSProperties;

  return (
    <ImageReveal className="pointer-events-none absolute inset-0">
      {isHero && heroPreviewMounted && (
        <div
          className={`absolute inset-0 z-[1] transition-opacity duration-500 ${heroRevealReady ? "opacity-0" : "opacity-100"}`}
          aria-hidden="true"
          data-hero-preview={heroRevealReady ? "leaving" : "loading"}
        >
          <img
            src={heroLqip.desktop}
            alt=""
            className="absolute inset-0 hidden h-full w-full object-cover sm:block"
            style={{
              objectPosition: focalPosition(desktop),
              filter: "blur(12px)",
              transform: "scale(1.05)",
            }}
          />
          <img
            src={heroLqip.mobile}
            alt=""
            className="absolute inset-0 h-full w-full object-cover sm:hidden"
            style={{
              objectPosition: focalPosition(mobile),
              filter: "blur(12px)",
              transform: "scale(1.05)",
            }}
          />
        </div>
      )}
      <picture
        className="gallery-background block h-full w-full"
        style={style}
        aria-hidden="true"
        data-gallery-background={chapter}
      >
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
        <source type="image/avif" srcSet={mediaSrcSet(desktop, "avif")} sizes="100vw" />
        <source type="image/webp" srcSet={mediaSrcSet(desktop, "webp")} sizes="100vw" />
        <img
          ref={heroImageRef}
          src={mediaUrl(desktop, 1280, "webp")}
          width={desktop.width}
          height={desktop.height}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          decoding="async"
          loading={isHero ? "eager" : "lazy"}
          fetchPriority={isHero ? "high" : "auto"}
          onError={isHero ? onHeroImageError : undefined}
          onLoad={
            isHero
              ? () =>
                  void heroImageRef.current
                    ?.decode()
                    .catch(() => undefined)
                    .then(notifyHeroImageReady)
              : undefined
          }
        />
      </picture>
    </ImageReveal>
  );
}
