import { motion, useInView, type Variants } from "motion/react";
import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion";
import { useMotionEnv } from "./MotionProvider";

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced, settings } = useMotionEnv();
  const enabled = !reduced && settings.menuMotion;
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: enabled ? settings.menuStagger : 0 } },
  };
  const item: Variants = {
    hidden: enabled ? { opacity: 0, y: motionTokens.menu.y } : { opacity: 1, y: 0 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: enabled ? motionTokens.duration.standard : 0 },
    },
  };
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="visible">
      {Children.map(children, (child) => (
        <motion.div variants={item}>{child}</motion.div>
      ))}
    </motion.div>
  );
}

export function Glow({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced, finePointer, settings } = useMotionEnv();
  return (
    <span
      className={`vne-glow inline-flex ${className ?? ""}`}
      data-enabled={!reduced && finePointer && settings.glow ? "true" : "false"}
    >
      {children}
    </span>
  );
}

export function TextShimmer({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced, settings } = useMotionEnv();
  return (
    <span
      className={`vne-shimmer ${className ?? ""}`}
      data-enabled={!reduced && settings.shimmer ? "true" : "false"}
    >
      {children}
    </span>
  );
}

export function ImageReveal({
  children,
  className,
  replay = false,
}: {
  children: ReactNode;
  className?: string;
  /** Admin probe: replay the production reveal on mount regardless of viewport position. */
  replay?: boolean;
}) {
  const { reduced, settings } = useMotionEnv();
  const enabled =
    !reduced && settings.imageReveal && settings.revealStyle !== "none" && settings.duration > 0;
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [played, setPlayed] = useState(!replay);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (node && enabled && (replay || node.getBoundingClientRect().top > window.innerHeight * 0.7))
      setArmed(true);
  }, [enabled, replay]);
  useEffect(() => {
    if (!replay || !armed) return;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setPlayed(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [replay, armed]);

  if (!enabled) {
    return <div className={`overflow-hidden ${className ?? ""}`}>{children}</div>;
  }

  const hidden = enabled && armed && (replay ? !played : !inView);
  return (
    <motion.div
      ref={ref}
      data-image-reveal={replay ? "replay" : "view"}
      className={`overflow-hidden ${className ?? ""}`}
      initial={false}
      animate={hidden ? { opacity: 0, y: motionTokens.image.y } : { opacity: 1, y: 0 }}
      transition={{
        duration: armed && !hidden ? Math.min(settings.duration, 0.5) : 0,
        ease: motionTokens.ease[settings.ease],
      }}
    >
      <motion.div
        initial={false}
        animate={enabled ? { scale: hidden ? settings.imageScaleFrom : 1 } : { scale: 1 }}
        transition={{
          duration: armed && !hidden ? Math.min(Math.max(settings.duration, 0.45), 0.5) : 0,
          ease: motionTokens.ease.out,
        }}
        className="h-full"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
