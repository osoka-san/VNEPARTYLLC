import { LayoutGroup, motion } from "motion/react";
import { Children, isValidElement, useId, useState, type ReactNode } from "react";
import { useMotionEnv } from "./MotionProvider";

/** Shared moving background adapted from Motion Primitives Animated Background. */
export function AnimatedBackground({
  children,
  className,
  activeIndex = null,
  onActiveIndexChange,
  role,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  activeIndex?: number | null;
  onActiveIndexChange?: (index: number | null) => void;
  role?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  const { reduced, settings } = useMotionEnv();
  const [hovered, setHovered] = useState<number | null>(null);
  const selected = hovered ?? activeIndex;
  const animated = !reduced && settings.animatedBackground;

  return (
    <LayoutGroup id={id}>
      <div
        className={className}
        role={role}
        aria-label={ariaLabel}
        onPointerLeave={() => setHovered(null)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setHovered(null);
          }
        }}
      >
        {Children.map(children, (child, index) => {
          if (!isValidElement(child)) return child;
          const selectedItem = selected === index;
          return (
            <div
              className="relative min-w-0"
              data-animated-background-item=""
              onPointerEnter={() => setHovered(index)}
              onPointerDown={() => setHovered(index)}
              onFocusCapture={() => {
                setHovered(index);
                onActiveIndexChange?.(index);
              }}
              onClick={() => onActiveIndexChange?.(index)}
            >
              {selectedItem ? (
                <motion.span
                  layoutId={`${id}-indicator`}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 border border-orange/35 bg-orange/10"
                  transition={
                    animated
                      ? { duration: settings.backgroundDuration, ease: [0.22, 1, 0.36, 1] }
                      : { duration: 0 }
                  }
                />
              ) : null}
              <div className="relative z-10">{child}</div>
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
