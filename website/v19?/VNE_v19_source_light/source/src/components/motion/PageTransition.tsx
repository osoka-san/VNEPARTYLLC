import { motion } from "motion/react";
import type { ReactNode } from "react";
import { motionTokens } from "@/lib/motion";
import { useMotionEnv } from "./MotionProvider";

export function PageTransition({
  routeKey,
  children,
  quiet = false,
}: {
  routeKey: string;
  children: ReactNode;
  /** Legal documents: no decorative page entrance (03.8-10). */
  quiet?: boolean;
}) {
  const { reduced, settings } = useMotionEnv();
  const enabled = !quiet && !reduced && settings.pageTransition;
  return (
    <motion.div
      key={routeKey}
      initial={enabled ? { opacity: 0, y: motionTokens.page.y } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: enabled ? settings.pageDuration : 0, ease: motionTokens.ease.out }}
    >
      {children}
    </motion.div>
  );
}
