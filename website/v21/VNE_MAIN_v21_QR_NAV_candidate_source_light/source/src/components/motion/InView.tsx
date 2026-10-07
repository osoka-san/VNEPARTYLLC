import { motion, useAnimationControls, useInView } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion";
import { useMotionEnv } from "./MotionProvider";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** SSR-visible, one-shot section entrance adapted from Motion Primitives InView. */
export function InView({
  children,
  className,
  delay = 0,
  amount = 0.18,
  subtle = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  amount?: number;
  subtle?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced, settings } = useMotionEnv();
  const enabled = !reduced && settings.revealStyle !== "none" && settings.duration > 0;
  const [armed, setArmed] = useState(false);
  const visible = useInView(ref, { once: true, amount });
  const controls = useAnimationControls();

  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (node && enabled && node.getBoundingClientRect().top > window.innerHeight * 0.78)
      setArmed(true);
  }, [enabled]);

  const hidden = enabled && armed && !visible;
  const duration = subtle ? Math.min(settings.duration, 0.5) : Math.min(settings.duration, 0.75);
  const distance = subtle ? Math.min(settings.distance, 10) : Math.min(settings.distance, 18);
  const hiddenPose = {
    opacity: settings.revealStyle === "scale" ? 0.45 : 0,
    y: ["rise", "blur"].includes(settings.revealStyle) ? distance : 0,
    scale: settings.revealStyle === "scale" ? settings.scaleFrom : 1,
    filter: settings.revealStyle === "blur" ? `blur(${settings.blur}px)` : "blur(0px)",
  };
  const visiblePose = { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };

  useIsoLayoutEffect(() => {
    controls.stop();
    if (!enabled || !armed) {
      controls.set(visiblePose);
      return;
    }
    if (hidden) {
      controls.set(hiddenPose);
      return;
    }
    void controls.start({
      ...visiblePose,
      transition: { duration, delay, ease: motionTokens.ease.out },
    });
  }, [
    armed,
    controls,
    delay,
    distance,
    duration,
    enabled,
    hidden,
    settings.blur,
    settings.revealStyle,
    settings.scaleFrom,
  ]);

  return (
    <motion.div ref={ref} className={className} initial={false} animate={controls}>
      {children}
    </motion.div>
  );
}

export function InViewGroup({
  children,
  className,
  stagger = 0.06,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, index) => (
            <InView key={index} delay={Math.min(index * stagger, 0.18)}>
              {child}
            </InView>
          ))
        : children}
    </div>
  );
}
