import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion";
import {
  createScrambleFrameGraphemes,
  isScrambleTargetEnabled,
  orderedLetterIndexes,
  splitScrambleGraphemes,
  type ScrambleTargetId,
} from "@/lib/text-scramble";
import { useMotionEnv } from "./MotionProvider";

/** Слабое притяжение к курсору + единое поведение нажатия. Только мышь. */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced, finePointer, settings } = useMotionEnv();
  const spring = {
    ...motionTokens.spring,
    stiffness: settings.springStiffness,
    damping: settings.springDamping,
  };
  const enabled = finePointer && !reduced && settings.magnetic;
  const pressEnabled = finePointer && !reduced && settings.press;
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, spring);
  const y = useSpring(my, spring);
  const maxOffset = settings.magneticMaxOffset;
  const strength = settings.magneticStrength;
  // Выключение посреди движения возвращает кнопку на место.
  useEffect(() => {
    if (!enabled) {
      mx.jump(0);
      my.jump(0);
      x.jump(0);
      y.jump(0);
    }
  }, [enabled, mx, my, x, y]);
  const clamp = (v: number) => Math.max(-maxOffset, Math.min(maxOffset, v));
  return (
    <motion.span
      className={`inline-flex ${className ?? ""}`}
      style={{ x, y }}
      whileHover={pressEnabled ? { scale: settings.pressHover } : {}}
      whileTap={pressEnabled ? { scale: settings.pressTap } : {}}
      transition={spring}
      onPointerMove={(e) => {
        if (!enabled || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(clamp((e.clientX - r.left - r.width / 2) * strength));
        my.set(clamp((e.clientY - r.top - r.height / 2) * strength));
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/** Сдержанный наклон ≤3° с локальным свечением в цветах ВНЕ. */
export function TiltGlow({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced, finePointer, settings } = useMotionEnv();
  const spring = {
    ...motionTokens.spring,
    stiffness: settings.springStiffness,
    damping: settings.springDamping,
  };
  const enabled = finePointer && !reduced && settings.tilt;
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);
  const max = settings.tiltDeg;
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const glow = useTransform(
    [sx, sy] as never,
    ([gx, gy]: number[]) =>
      `radial-gradient(420px circle at ${(gx ?? 0.5) * 100}% ${(gy ?? 0.5) * 100}%, color-mix(in oklab, var(--mint) 14%, transparent), transparent 60%)`,
  );
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled) {
      px.set(0.5);
      py.set(0.5);
      sx.jump(0.5);
      sy.jump(0.5);
      setActive(false);
    }
  }, [enabled, px, py, sx, sy]);
  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      style={enabled ? { rotateX, rotateY, transformPerspective: 900 } : {}}
      onPointerMove={(e) => {
        if (!enabled || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
        setActive(true);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
        setActive(false);
      }}
    >
      {children}
      {enabled && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: glow }}
          animate={{ opacity: active ? 1 : 0 }}
          transition={{ duration: Math.min(settings.duration || 0.4, 0.6) }}
        />
      )}
    </motion.div>
  );
}

/** Произведение computed opacity узла и предков до body. */
function effectiveOpacity(node: Element) {
  let value = 1;
  for (let el: Element | null = node; el && el !== document.body; el = el.parentElement) {
    value *= Number.parseFloat(window.getComputedStyle(el).opacity) || 0;
    if (value < 0.95) break;
  }
  return value;
}

/**
 * Однократный короткий перебор букв при появлении метки.
 * Цифры, пробелы и пунктуация остаются на месте, экранный диктор читает исходный текст.
 */
export function TextScramble({
  children,
  className,
  targetId,
  replayKey,
}: {
  children: string;
  className?: string;
  targetId?: ScrambleTargetId;
  replayKey?: number;
}) {
  const { reduced, settings } = useMotionEnv();
  const targetEnabled = targetId
    ? isScrambleTargetEnabled(targetId, settings.scrambleGroups, settings.scrambleTargets)
    : true;
  const enabled = !reduced && settings.scramble && settings.textEnabled && targetEnabled;
  // SSR и первый клиентский render: исходный текст, без гидратационного скачка.
  const [display, setDisplay] = useState<string[] | null>(null);
  const played = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) {
      // Выключение настройки посреди перебора мгновенно возвращает исходный текст.
      setDisplay(null);
      return;
    }
    const graphemes = splitScrambleGraphemes(children);
    const scrambleMs = settings.scrambleDuration * 1000;
    const tickMs = settings.scrambleTick * 1000;
    const order = orderedLetterIndexes(graphemes, settings.scrambleDirection);
    if (order.length === 0) return;

    let raf = 0;
    let timer = 0;
    let start = 0;
    let lastTick = -Infinity;
    let running = false;
    let inView = false;

    const finish = () => {
      setDisplay(null);
      raf = 0;
      running = false;
    };

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
      raf = 0;
      timer = 0;
      start = 0;
      lastTick = -Infinity;
      running = false;
      setDisplay(null);
    };

    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / scrambleMs, 1);
      if (t >= 1) return finish();
      if (now - lastTick >= tickMs) {
        lastTick = now;
        setDisplay(
          createScrambleFrameGraphemes({
            graphemes,
            order,
            progress: t,
            intensity: settings.scrambleIntensity,
            charset: settings.scrambleCharset,
          }),
        );
      }
      raf = window.requestAnimationFrame(step);
    };

    const startAnimation = () => {
      if (document.visibilityState === "hidden") return;
      if (running) return;
      if (played.current && replayKey === undefined && !settings.scrambleRepeat) return;
      played.current = true;
      running = true;
      start = 0;
      lastTick = -Infinity;
      setDisplay(graphemes.slice());
      // Согласование с родительским reveal: перебор стартует, только когда
      // предки (fade/InView) реально видимы, иначе он проигрался бы под opacity 0.
      const waitVisible = () => {
        timer = 0;
        if (!running) return;
        if (!inView) {
          // Ушёл из вида до появления родителя — следующий вход повторит попытку.
          running = false;
          played.current = false;
          setDisplay(null);
          return;
        }
        if (effectiveOpacity(node) < 0.95) {
          timer = window.setTimeout(waitVisible, 80);
          return;
        }
        timer = window.setTimeout(() => {
          timer = 0;
          raf = window.requestAnimationFrame(step);
        }, settings.scrambleDelay * 1000);
      };
      waitVisible();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      if (inView) startAnimation();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let io: IntersectionObserver | null = null;
    if (typeof window.IntersectionObserver === "function") {
      io = new IntersectionObserver(([entry]) => {
        if (!entry) return;
        inView = entry.isIntersecting;
        if (inView) startAnimation();
        else if (settings.scrambleRepeat) {
          played.current = false;
          stop();
        }
      });
      io.observe(node);
    } else {
      // Старые браузеры получают безопасный однократный запуск без observer.
      inView = true;
      startAnimation();
    }
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Прерванный перебор не оставляет промежуточных знаков.
      stop();
    };
  }, [
    children,
    enabled,
    replayKey,
    settings.scrambleCharset,
    settings.scrambleDelay,
    settings.scrambleDirection,
    settings.scrambleDuration,
    settings.scrambleIntensity,
    settings.scrambleRepeat,
    settings.scrambleTick,
  ]);

  return (
    <span
      ref={ref}
      className={`inline [overflow-wrap:anywhere] ${className ?? ""}`}
      data-text-scramble={targetId ?? "preview"}
      data-scramble-state={enabled && display !== null ? "playing" : "final"}
    >
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {enabled && display ? <ScrambleGlyphs source={children} frame={display} /> : children}
      </span>
    </span>
  );
}

/**
 * Исходная графема остаётся в потоке как прозрачный якорь раскладки,
 * случайный знак рисуется поверх абсолютно — ширина, переносы и высота не меняются.
 * Пробелы остаются обычным текстом, поэтому естественные переносы сохраняются.
 */
function ScrambleGlyphs({ source, frame }: { source: string; frame: string[] }) {
  const graphemes = splitScrambleGraphemes(source);
  return (
    <>
      {graphemes.map((g, i) => {
        const shown = frame[i] ?? g;
        if (shown === g || /\s/.test(g)) return g;
        return (
          <span key={i} className="relative" data-scramble-glyph="">
            <span style={{ color: "transparent" }}>{g}</span>
            <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">
              {shown}
            </span>
          </span>
        );
      })}
    </>
  );
}
