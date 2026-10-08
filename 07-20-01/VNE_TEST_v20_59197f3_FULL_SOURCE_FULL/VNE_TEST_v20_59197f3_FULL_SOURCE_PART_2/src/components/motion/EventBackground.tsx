import { useEffect, useRef, useState, type CSSProperties } from "react";
import { eventBackgroundFor, type EventBackgroundSettings } from "@/lib/event-backgrounds";
import { useMotionEnv } from "./MotionProvider";
import "./event-background.css";

const characterSets = {
  katakana: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789",
  binary: "010011010101101001101010010110101100101010010110",
  symbols: "＋−＝：・〈〉／01＋−＝：・〈〉／02＋−＝：・〈〉／03",
};
type Variables = CSSProperties & Record<`--${string}`, string | number>;

/** CSS-only digital rain adapted from whoisyourdeadie (MIT, public/licenses/uiverse-matrix.txt). */
export function DigitalRain({
  slug,
  config,
  compact = false,
}: {
  slug: string;
  config: EventBackgroundSettings;
  compact?: boolean;
}) {
  const { reduced } = useMotionEnv();
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let inView = true;
    const sync = () => setVisible(inView && !document.hidden);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? false;
            sync();
          });
    if (root.current) observer?.observe(root.current);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [config.enabled]);
  if (!config.enabled) return null;
  const seed = Array.from(slug).reduce((n, c) => n + c.charCodeAt(0), 0);
  const count = compact ? Math.max(12, Math.round(config.density * 0.55)) : config.density;
  const chars = characterSets[config.characters];
  return (
    <div
      ref={root}
      className={`event-rain${compact ? " event-rain--compact" : ""}`}
      aria-hidden="true"
      data-event-background={slug}
      data-motion={config.animated && !reduced ? "animated" : "static"}
      data-visible={visible}
      data-direction={config.direction}
      style={
        {
          "--rain-color": config.color,
          "--rain-highlight": config.highlight,
          "--rain-background": config.background,
          "--rain-size": `${config.size}px`,
          "--rain-opacity": config.opacity,
          "--rain-glow": `${config.glow}px`,
        } as Variables
      }
    >
      <div className="event-rain__streams">
        {Array.from({ length: count }, (_, i) => {
          const n = (seed + i * 137) % 997;
          const duration = (15 + (n % 90) / 10) / config.speed;
          const offset = n % chars.length;
          return (
            <span
              key={i}
              className="event-rain__column"
              style={
                {
                  left: `${((i + 0.35) / count) * 100}%`,
                  "--rain-duration": `${duration.toFixed(3)}s`,
                  "--rain-delay": `${-(n / 997) * duration}s`,
                  "--rain-static-y": `${-30 + (n % 85)}%`,
                  "--rain-column-opacity": 0.5 + (n % 50) / 100,
                } as Variables
              }
            >
              <span>{chars.slice(offset) + chars.slice(0, offset)}</span>
            </span>
          );
        })}
      </div>
      <div className="event-rain__veil" />
    </div>
  );
}

export function EventBackground({ slug }: { slug: string }) {
  const { settings } = useMotionEnv();
  return <DigitalRain slug={slug} config={eventBackgroundFor(settings.eventBackgrounds, slug)} />;
}
