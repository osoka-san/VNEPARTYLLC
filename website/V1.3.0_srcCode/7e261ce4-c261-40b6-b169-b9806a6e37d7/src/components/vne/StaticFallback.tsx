import { useCallback, useEffect, useRef, useState } from "react";

/** Clear space kept between the copy block, the emblem and the dock. */
const GAP_PX = 16;

type Area = { top: number; bottom: number; left: number };

/**
 * The static emblem is placed inside the space the copy block and the primary
 * CTA actually leave free, measured from the live layout instead of a fixed
 * viewport fraction. Proportions are never altered: the image only shrinks to
 * fit the measured area. On short landscape viewports the free space is to the
 * right of the copy column, so the emblem moves sideways instead of down.
 */
export function StaticFallback() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const parent = container?.offsetParent as HTMLElement | null;
    if (!container || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    const copy = document.querySelector(".portal-copy");
    const actions = document.querySelector(".portal-actions");
    const dock = document.querySelector("[data-dock]");

    // The actions row is a full-width flex container; only its real controls
    // occupy space, so the union of the children is what must stay clear.
    const rects = [copy?.getBoundingClientRect()].filter(Boolean) as DOMRect[];
    if (actions) {
      for (const child of Array.from(actions.children)) {
        rects.push(child.getBoundingClientRect());
      }
    }
    const occupiedBottom = rects.reduce((value, rect) => Math.max(value, rect.bottom), 0);
    const occupiedRight = rects.reduce((value, rect) => Math.max(value, rect.right), 0);
    const dockTop = dock?.getBoundingClientRect().top ?? parentRect.bottom;
    const bottom = Math.max(GAP_PX, parentRect.bottom - dockTop + GAP_PX);

    // Two candidate areas: under the copy block, or beside it. Pick whichever
    // leaves the larger square for the emblem — it keeps proportions either way.
    const belowTop = occupiedBottom > 0 ? occupiedBottom - parentRect.top + GAP_PX : GAP_PX;
    const below = {
      top: Math.max(0, belowTop),
      bottom,
      left: 0,
      score: Math.min(parentRect.width, parentRect.height - belowTop - bottom),
    };
    const besideLeft = Math.max(0, occupiedRight - parentRect.left + GAP_PX);
    const beside = {
      top: GAP_PX,
      bottom,
      left: besideLeft,
      score: Math.min(parentRect.width - besideLeft, parentRect.height - GAP_PX - bottom),
    };
    const best = beside.score > below.score ? beside : below;
    setArea({ top: best.top, bottom: best.bottom, left: best.left });
  }, []);

  useEffect(() => {
    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    const observer = new ResizeObserver(measure);
    const actions = document.querySelector(".portal-actions");
    const layer = document.querySelector(".portal-copy-layer");
    if (actions) observer.observe(actions);
    if (layer) observer.observe(layer);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      observer.disconnect();
    };
  }, [measure]);

  return (
    <div
      ref={containerRef}
      className="static-portal absolute right-0 z-0 flex items-center justify-center px-4"
      style={
        area
          ? { top: `${area.top}px`, bottom: `${area.bottom}px`, left: `${area.left}px` }
          : { top: "34vh", bottom: "max(5rem, env(safe-area-inset-bottom))", left: 0 }
      }
      aria-hidden="true"
      data-static-portal
    >
      <img
        src="/brand/portal/portal-master.svg"
        alt=""
        className="object-contain"
        style={{ height: "100%", width: "min(76vw, 100%)" }}
      />
    </div>
  );
}
