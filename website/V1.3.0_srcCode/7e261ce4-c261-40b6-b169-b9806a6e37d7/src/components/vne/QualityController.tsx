import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

export function QualityController({ paused }: { paused: boolean }) {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const wake = () => {
      if (!document.hidden && !paused) invalidate();
    };
    const onVisibility = () => {
      setFrameloop(document.hidden || paused ? "never" : "demand");
      if (!document.hidden && !paused) window.requestAnimationFrame(invalidate);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("portal-motion-wake", wake);
    window.addEventListener("resize", wake);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("portal-motion-wake", wake);
      window.removeEventListener("resize", wake);
    };
  }, [invalidate, paused, setFrameloop]);
  return null;
}
