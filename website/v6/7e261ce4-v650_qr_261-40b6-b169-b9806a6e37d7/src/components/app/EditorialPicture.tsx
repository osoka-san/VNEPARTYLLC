import { useState } from "react";

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

  return (
    <div
      className={`relative bg-surface ${className}`}
      data-image-state={failed ? "error" : "ready"}
    >
      {!failed && (
        <picture>
          <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
          <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
          <img
            src={src}
            srcSet={webpSrcSet}
            sizes={sizes}
            width={width}
            height={height}
            alt={alt}
            loading={loading}
            fetchPriority={fetchPriority}
            decoding="async"
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
