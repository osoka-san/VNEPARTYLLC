import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMotionEnv } from "./MotionProvider";

type TextLoopMode = "basic" | "custom";

/** Accessible Text Loop adapted from Motion Primitives; the changing visual is never announced. */
export function TextLoop({
  items,
  staticText,
  mode = "basic",
  className,
  replayKey = 0,
}: {
  items: string[];
  staticText: string;
  mode?: TextLoopMode;
  className?: string;
  replayKey?: number;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const { reduced, settings } = useMotionEnv();
  const off = reduced || !settings.textEnabled || !settings.loopEnabled;
  const [index, setIndex] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const itemsKey = items.join("\u0000");

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(Boolean(entry?.isIntersecting)),
    );
    observer.observe(node);
    const onVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [itemsKey, replayKey]);

  useEffect(() => {
    if (off || manualPaused || interactionPaused || !inView || !documentVisible || items.length < 2)
      return;
    const id = window.setInterval(
      () => setIndex((value) => (value + 1) % items.length),
      settings.loopInterval * 1000,
    );
    return () => window.clearInterval(id);
  }, [
    documentVisible,
    inView,
    interactionPaused,
    items.length,
    manualPaused,
    off,
    settings.loopInterval,
  ]);

  const longest = items.reduce(
    (best, item) => (item.length > best.length ? item : best),
    items[0] ?? "",
  );
  const y = mode === "custom" ? 8 : 6;

  return (
    <span
      ref={rootRef}
      className={`${off ? "inline" : "inline-flex max-w-full items-center gap-2"} ${className ?? ""}`}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={() => setInteractionPaused(false)}
    >
      {off ? (
        staticText
      ) : (
        <>
          <span className="sr-only">{staticText}</span>
          <span
            aria-hidden="true"
            className="relative inline-grid max-w-full overflow-hidden whitespace-nowrap"
          >
            <span className="invisible col-start-1 row-start-1">{longest}</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${replayKey}-${index}`}
                className="col-start-1 row-start-1"
                initial={{ opacity: 0, y, rotateX: mode === "custom" ? 12 : 0 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: -y, rotateX: mode === "custom" ? -12 : 0 }}
                transition={{ duration: settings.loopDuration, ease: [0.22, 1, 0.36, 1] }}
              >
                {items[index]}
              </motion.span>
            </AnimatePresence>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={manualPaused ? "Возобновить смену слов" : "Приостановить смену слов"}
            aria-pressed={manualPaused}
            onClick={() => setManualPaused((value) => !value)}
          >
            {manualPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </Button>
        </>
      )}
    </span>
  );
}
