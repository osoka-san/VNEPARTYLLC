import { motion, useInView, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion";
import type { TextAnimationStyle, TextSplit } from "@/lib/motion-settings";
import { useMotionEnv } from "./MotionProvider";

export type TextRole = "heading" | "body" | "accent";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function splitText(text: string, split: TextSplit) {
  if (split === "character") return Array.from(text);
  if (split === "word") return text.split(/(\s+)/);
  if (split === "line") return text.split(/(\n+)/);
  return [text];
}

export function AnimatedText({
  children,
  role = "body",
  className,
  delay = 0,
  hero = false,
  enabled = true,
  replay = false,
}: {
  replay?: boolean;
  children: ReactNode;
  role?: TextRole;
  className?: string;
  delay?: number;
  hero?: boolean;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { reduced, settings } = useMotionEnv();
  const style: TextAnimationStyle =
    role === "heading"
      ? settings.textHeadingStyle
      : role === "accent"
        ? settings.textAccentStyle
        : settings.textBodyStyle;
  const off = reduced || !enabled || !settings.textEnabled || style === "none";
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, {
    once: !settings.textRepeat,
    amount: settings.textViewportAmount,
  });

  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (!node || off) return;
    if (
      replay ||
      (hero && settings.textHeroSequence) ||
      node.getBoundingClientRect().top > window.innerHeight * 0.72
    )
      setArmed(true);
  }, [hero, off, replay, settings.textHeroSequence]);

  // Проба: сначала мгновенно ставим скрытую позу (duration 0), и только
  // после двух кадров — когда скрытая поза гарантированно отрисована —
  // запускаем отдельный переход к видимому состоянию.
  const [played, setPlayed] = useState(!replay);
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

  const text =
    typeof children === "string" || typeof children === "number" ? String(children) : null;
  const split = role === "body" && settings.textSplit === "character" ? "word" : settings.textSplit;
  const pieces = useMemo(() => (text === null ? [] : splitText(text, split)), [split, text]);
  const active = armed && !off;
  const visible = active ? (replay ? played : inView) : true;
  const itemHidden = {
    opacity: 0,
    y: style === "rise" || style === "blur" || style === "mask" ? settings.textDistance : 0,
    scale: style === "scale" ? settings.textScaleFrom : 1,
    filter: style === "blur" ? `blur(${settings.textBlur}px)` : "blur(0px)",
    clipPath: style === "mask" ? "inset(100% 0 0 0)" : "inset(0% 0 0 0)",
  };
  const itemVisible = {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    clipPath: "inset(0% 0 0 0)",
  };
  // Скрытая поза всегда ставится мгновенно; в выключенном состоянии
  // задержки, каскад и длительность равны нулю — текст сразу финальный.
  const container: Variants = {
    hidden: { transition: { delayChildren: 0, staggerChildren: 0 } },
    visible: {
      transition: active
        ? {
            delayChildren: settings.textDelay + delay,
            staggerChildren: split === "block" ? 0 : settings.textStagger,
          }
        : { delayChildren: 0, staggerChildren: 0 },
    },
  };
  const item: Variants = {
    hidden: { ...itemHidden, transition: { duration: 0 } },
    visible: {
      ...itemVisible,
      transition: active
        ? { duration: settings.textDuration, ease: motionTokens.ease[settings.ease] }
        : { duration: 0 },
    },
  };

  if (text === null) {
    return (
      <motion.span
        ref={ref}
        className={`inline-block ${className ?? ""}`}
        initial={false}
        animate={visible ? itemVisible : itemHidden}
        transition={
          active && visible
            ? {
                delay: settings.textDelay + delay,
                duration: settings.textDuration,
                ease: motionTokens.ease[settings.ease],
              }
            : { duration: 0, delay: 0 }
        }
      >
        {children}
      </motion.span>
    );
  }

  const renderPiece = (piece: string, index: number) => (
    <motion.span
      className={split === "character" ? "inline-block" : "inline-block whitespace-pre-wrap"}
      variants={item}
      key={`${index}-${piece}`}
    >
      {piece}
    </motion.span>
  );

  // Для режима «буква» буквы собираются в слово: inline-flex с переносом
  // держит обычное слово целым, а слишком длинный токен переносит внутри,
  // не создавая горизонтального переполнения.
  const visual =
    split === "character"
      ? text.split(/(\s+)/).map((word, wi) =>
          /^\s+$/.test(word) || word === "" ? (
            <span key={`w${wi}`}>{word}</span>
          ) : (
            <span key={`w${wi}`} className="inline-flex max-w-full flex-wrap">
              {Array.from(word).map((ch, ci) => renderPiece(ch, wi * 1000 + ci))}
            </span>
          ),
        )
      : pieces.map((piece, index) =>
          /^\s+$/.test(piece) ? (
            // Явный перевод строки в режиме «Строка из текста» сохраняется.
            piece.includes("\n") ? (
              Array.from(piece.replace(/[^\n]/g, "")).map((_, bi) => (
                <br key={`${index}-br${bi}`} />
              ))
            ) : (
              <span key={`${index}-s`}>{piece}</span>
            )
          ) : (
            renderPiece(piece, index)
          ),
        );

  return (
    <motion.span
      ref={ref}
      className={`inline ${className ?? ""}`}
      initial={false}
      animate={visible ? "visible" : "hidden"}
      variants={container}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{visual}</span>
    </motion.span>
  );
}
