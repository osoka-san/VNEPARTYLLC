import { memo, useMemo, useEffect, useState } from "react";
import { useBeginSiteLoading } from "@/components/loading/SiteLoading";
import QRCode from "qrcode";
import { supportsPatternEngine } from "@/lib/qr-studio/pattern";
import type { PassDTO } from "./types";
import { renderArtwork } from "@/lib/qr-studio/render-client";
import { designQrPalette } from "@/lib/qr-studio/reference-pass-palette";
import type { PassAccess } from "./types";
// Only verified artwork is reused across the card and its enlarged view; never persisted.
const verifiedArtwork = new Map<string, string>();

// Полная тихая зона 4 модуля. Без логотипов, градиентов и удалённых модулей.
export function qrGeometry(value: string) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "Q" });
  const dots: [number, number][] = [];
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) dots.push([x + 4, y + 4]);
  return { size: modules.size + 8, dots };
}

export default memo(function QrCode({
  value,
  className = "",
  design,
  onStatus,
  access = "GENERAL",
}: {
  value: string | null;
  className?: string;
  design?: PassDTO["design"];
  access?: PassAccess;
  onStatus?: ((status: "building" | "verified" | "fallback") => void) | undefined;
}) {
  const [art, setArt] = useState<{ key: string; svg: string } | null>(null);
  const beginLoading = useBeginSiteLoading();
  const key = JSON.stringify([value, design, access]);
  const palette = designQrPalette(access, design);
  useEffect(() => {
    const controller = new AbortController();
    const cached = verifiedArtwork.get(key);
    if (cached) {
      setArt({ key, svg: cached });
      onStatus?.("verified");
      return () => controller.abort();
    }
    onStatus?.(
      value && design && supportsPatternEngine(design.engineVersion, design.pattern)
        ? "building"
        : "fallback",
    );
    const finish =
      value && design && supportsPatternEngine(design.engineVersion, design.pattern)
        ? beginLoading("Готовим QR-код пропуска")
        : () => {};
    if (value && design && supportsPatternEngine(design.engineVersion, design.pattern))
      void renderArtwork(value, design.pattern, controller.signal, access, design.engineVersion)
        .then(async (result) => {
          if (controller.signal.aborted) return;
          if (!result.art) {
            onStatus?.("fallback");
            return;
          }
          const { verifyArtwork } = await import("@/lib/qr-studio/browser");
          // Covers the enlarged view and a small phone's scaled card, not just exports.
          const check = await verifyArtwork(result.art.svg, value, [420, 280, 144]);
          if (!controller.signal.aborted) {
            if (check.ok) {
              if (verifiedArtwork.size >= 8)
                verifiedArtwork.delete(verifiedArtwork.keys().next().value!);
              verifiedArtwork.set(key, result.art.svg);
              setArt({ key, svg: result.art.svg });
            }
            onStatus?.(check.ok ? "verified" : "fallback");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) onStatus?.("fallback");
        })
        .finally(finish);
    return () => {
      controller.abort();
      finish();
    };
  }, [key, onStatus, beginLoading]);
  const geo = useMemo(() => (value ? qrGeometry(value) : null), [value]);
  if (!geo)
    return (
      <svg className={className} viewBox="0 0 10 10" role="img" aria-label="QR недоступен">
        <rect width="10" height="10" fill={palette.bg} />
      </svg>
    );
  if (art?.key === key)
    return (
      <svg
        className={className}
        viewBox="0 0 1200 1200"
        role="img"
        aria-label="Индивидуальный QR-код пропуска"
        data-qr-palette={access}
        preserveAspectRatio="xMidYMid meet"
      >
        <image
          width="1200"
          height="1200"
          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}`}
        />
      </svg>
    );
  const { size, dots } = geo;
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Индивидуальный QR-код пропуска"
      data-qr-palette={access}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={size} height={size} fill={palette.bg} />
      <g fill={palette.fg}>
        {dots.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
        ))}
      </g>
    </svg>
  );
});
