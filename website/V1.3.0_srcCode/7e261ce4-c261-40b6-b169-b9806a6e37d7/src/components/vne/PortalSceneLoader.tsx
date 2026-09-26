import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PortalLoadingFallback } from "./PortalLoadingFallback";

const MODULE_TIMEOUT_MS = 8000;

const LazyPortalScene = lazy(() =>
  import("./PortalScene").then((module) => ({ default: module.PortalScene })),
);

class PortalModuleBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onFailure();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useActiveTimeout(
  enabled: boolean,
  paused: boolean,
  timeoutMs: number,
  onTimeout: () => void,
) {
  const remainingMs = useRef(timeoutMs);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    let lastTick = performance.now();

    const schedule = () => {
      timer = window.setTimeout(tick, Math.min(remainingMs.current, 100));
    };
    const tick = () => {
      const now = performance.now();
      if (!document.hidden && !paused) remainingMs.current -= now - lastTick;
      lastTick = now;
      if (remainingMs.current <= 0) {
        onTimeoutRef.current();
        return;
      }
      schedule();
    };
    const resetClock = () => {
      lastTick = performance.now();
    };

    document.addEventListener("visibilitychange", resetClock);
    schedule();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resetClock);
    };
  }, [enabled, paused]);
}

export interface PortalSceneLoaderProps {
  progressRef: RefObject<number>;
  displayedProgressRef: RefObject<number>;
  paused: boolean;
  onFailure: () => void;
  onProgressLabel: (progress: number) => void;
}

export function PortalSceneLoader({
  progressRef,
  displayedProgressRef,
  paused,
  onFailure,
  onProgressLabel,
}: PortalSceneLoaderProps) {
  const terminal = useRef(false);
  const [moduleMounted, setModuleMounted] = useState(false);
  const handleModuleMounted = useCallback(() => setModuleMounted(true), []);
  const failOnce = useCallback(() => {
    if (terminal.current) return;
    terminal.current = true;
    onFailure();
  }, [onFailure]);

  useActiveTimeout(!moduleMounted, paused, MODULE_TIMEOUT_MS, failOnce);

  return (
    <PortalModuleBoundary onFailure={failOnce}>
      <Suspense fallback={<PortalLoadingFallback />}>
        <LazyPortalScene
          progressRef={progressRef}
          displayedProgressRef={displayedProgressRef}
          paused={paused}
          onModuleMounted={handleModuleMounted}
          onFallbackChange={(fallback) => {
            if (fallback) failOnce();
          }}
          onProgressLabel={onProgressLabel}
        />
      </Suspense>
    </PortalModuleBoundary>
  );
}
