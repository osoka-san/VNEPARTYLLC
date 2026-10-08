import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useMotionEnv } from "./MotionProvider";

/**
 * Text Roll — однократная вертикальная прокрутка букв короткого акцента.
 * SSR, первый клиентский render и любое выключение — обычный текст.
 * Во время прокрутки исходный текст доступен скринридеру (sr-only) ровно один раз,
 * визуальные буквы aria-hidden; ширина каждой графемы задана невидимым оригиналом,
 * поэтому строки не прыгают. Цифры, пробелы и пунктуация статичны.
 */

const LETTER = /\p{L}/u;
const MAX_GRAPHEMES = 32;

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Seg === "function")
    return Array.from(new Seg("ru", { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

type Phase = "plain" | "armed" | "playing";

export function TextRoll({
  children,
  className,
  replay = false,
}: {
  children: string;
  className?: string;
  /** Проба в админке: проигрывается сразу. */
  replay?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { reduced, settings } = useMotionEnv();
  const [phase, setPhase] = useState<Phase>("plain");
  const parts = graphemes(children);
  const off =
    reduced || !settings.textEnabled || !settings.rollEnabled || parts.length > MAX_GRAPHEMES;
  const duration = settings.rollDuration;

  // Армирование только если фраза ещё вне экрана — уже видимый текст не прячем.
  useEffect(() => {
    const node = ref.current;
    if (!node || off) return;
    if (replay) {
      setPhase("playing");
      return;
    }
    const r = node.getBoundingClientRect();
    if (!(r.top < window.innerHeight && r.bottom > 0)) setPhase("armed");
  }, [off, replay]);

  useEffect(() => {
    const node = ref.current;
    if (!node || phase !== "armed") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase("playing");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [phase]);

  // Завершение по времени; выключение/resize посреди — сразу обычный текст.
  useEffect(() => {
    if (phase === "plain") return;
    if (off) {
      setPhase("plain");
      return;
    }
    const onResize = () => setPhase("plain");
    window.addEventListener("resize", onResize);
    let t: number | undefined;
    if (phase === "playing") t = window.setTimeout(() => setPhase("plain"), duration * 1000 + 60);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t) window.clearTimeout(t);
    };
  }, [phase, off, duration]);

  if (phase === "plain" || off) {
    return (
      <span ref={ref} className={className}>
        {children}
      </span>
    );
  }

  const letters = parts.filter((g) => LETTER.test(g)).length || 1;
  // Буквы стартуют с небольшим шагом, общая длительность = duration.
  const each = duration * 0.6;
  const step = letters > 1 ? (duration - each) / (letters - 1) : 0;
  let li = 0;

  return (
    <span ref={ref} className={className} data-roll={phase}>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {parts.map((g, i) => {
          if (!LETTER.test(g) || phase === "armed")
            return (
              <span
                key={i}
                style={phase === "armed" && LETTER.test(g) ? { opacity: 0 } : undefined}
              >
                {g}
              </span>
            );
          const delay = li++ * step;
          return (
            <span
              key={i}
              className="relative inline-block"
              // Перспектива на букву: вращение вокруг горизонтальной оси, ширина не меняется.
              style={{ perspective: "600px" }}
            >
              <motion.span
                className="inline-block [backface-visibility:hidden]"
                style={{ transformOrigin: "50% 50% -0.4em" }}
                initial={{ rotateX: -90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ duration: each, delay, ease: [0.22, 1, 0.36, 1] }}
              >
                {g}
              </motion.span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
