import { motion, useInView } from "motion/react";
import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion";
import { useMotionEnv } from "./MotionProvider";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Проявление при входе в экран. Сервер отдаёт видимый текст; скрытая поза
 * назначается только блокам, которые при монтировании ещё ниже экрана,
 * поэтому нет мигания и ошибок гидратации. Параметры берутся из админки.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  replay = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Проба в админке: взводится без проверки положения и сразу проигрывается. */
  replay?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced, settings } = useMotionEnv();
  const off = reduced || settings.revealStyle === "none" || settings.duration === 0;
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });

  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (!node || off) return;
    if (replay || node.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [off, replay]);

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

  const hidden = armed && !off && (replay ? !played : !inView);
  const hiddenPose = {
    opacity: 0,
    y: settings.revealStyle === "fade" || settings.revealStyle === "scale" ? 0 : settings.distance,
    scale: settings.revealStyle === "scale" ? settings.scaleFrom : 1,
    filter:
      settings.revealStyle === "blur" && settings.blur > 0
        ? `blur(${settings.blur}px)`
        : "blur(0px)",
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? hiddenPose : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={
        hidden || off || !armed
          ? { duration: 0, delay: 0 }
          : { duration: settings.duration, ease: motionTokens.ease[settings.ease], delay }
      }
    >
      {children}
    </motion.div>
  );
}
