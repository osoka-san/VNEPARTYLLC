import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMotionEnv } from "./MotionProvider";

/**
 * Scroll-linked editorial highlight inspired by the supplied reference.
 * The source text remains a single accessible/copyable node; only its paint changes.
 */
export function TextSection({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { reduced, settings } = useMotionEnv();
  const [hydrated, setHydrated] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    setHydrated(true);
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const start = window.innerHeight * 0.96;
      const end = window.innerHeight * 0.58 - rect.height;
      const viewportProgress = Math.min(
        1,
        Math.max(0, (start - rect.top) / Math.max(1, start - end)),
      );
      const settingRange = Math.max(0.01, settings.sectionEnd - settings.sectionStart);
      setScrollProgress(
        Math.min(1, Math.max(0, (viewportProgress - settings.sectionStart) / settingRange)),
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [settings.sectionEnd, settings.sectionStart]);

  const enabled = hydrated && !reduced && settings.textEnabled && settings.sectionEnabled;
  if (!enabled)
    return (
      <span ref={ref} className={className}>
        {children}
      </span>
    );

  const cyanMix = Math.round(settings.sectionIntensity * 100);
  return (
    <span
      ref={ref}
      data-text-section="active"
      data-text-section-progress={scrollProgress.toFixed(3)}
      className={`bg-clip-text text-transparent ${className ?? ""}`}
      style={
        {
          "--text-section-progress": scrollProgress,
          backgroundImage: `linear-gradient(90deg, color-mix(in oklab, var(--mint) ${cyanMix}%, var(--foreground)) 0 calc(var(--text-section-progress) * 100%), var(--muted-foreground) calc(var(--text-section-progress) * 100%) 100%)`,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}
