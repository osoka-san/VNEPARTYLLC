import { useEffect, useRef, useState } from "react";
import { useSiteLoading } from "@/components/loading/SiteLoading";

type EditorialPictureProps = {
  src: string;
  avifSrcSet: string;
  webpSrcSet: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  className: string;
  objectPosition?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

/** Responsive editorial image with a stable layout and a quiet failure state. */
export function EditorialPicture({
  src,
  avifSrcSet,
  webpSrcSet,
  sizes,
  width,
  height,
  alt,
  className,
  objectPosition,
  loading = "lazy",
  fetchPriority = "auto",
}: EditorialPictureProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useSiteLoading(loading === "eager" && !ready && !failed, "Загружаем изображение");
  useEffect(() => {
    let alive = true;
    const image = imageRef.current;
    setReady(false);
    setFailed(false);
    if (image?.complete) {
      if (image.naturalWidth)
        void image
          .decode()
          .catch(() => {})
          .then(() => alive && setReady(true));
      else setFailed(true);
    }
    return () => {
      alive = false;
    };
  }, [src, avifSrcSet, webpSrcSet]);

  return (
    <div
      className={`relative bg-surface ${className}`}
      data-image-state={failed ? "error" : ready ? "ready" : "loading"}
    >
      {!failed && (
        <picture>
          <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
          <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
          <img
            ref={imageRef}
            src={src}
            srcSet={webpSrcSet}
            sizes={sizes}
            width={width}
            height={height}
            alt={alt}
            loading={loading}
            fetchPriority={fetchPriority}
            decoding="async"
            onLoad={() => setReady(true)}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
            style={objectPosition ? { objectPosition } : undefined}
          />
        </picture>
      )}
      {failed && <span className="sr-only">Изображение недоступно</span>}
    </div>
  );
}
