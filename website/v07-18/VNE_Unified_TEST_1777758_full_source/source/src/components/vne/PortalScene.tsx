import { addAfterEffect, Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import * as THREE from "three";
import { designConfig } from "@/config/design-config";
import { advanceDisplayedProgress, motionConfig } from "@/config/motion-config";
import { computeSceneBounds } from "@/lib/portal-bounds";
import { PortalLoadingFallback } from "./PortalLoadingFallback";
import { PortalLinks } from "./PortalLinks";
import { QualityController } from "./QualityController";

/** Hard ceiling for renderer start-up; after it we commit to the static portal. */
const READY_TIMEOUT_MS = 4000;

type SceneStatus = "loading" | "ready" | "static";

class CanvasBoundary extends Component<
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

function ReadySignal({ onReady }: { onReady: () => void }) {
  const signalled = useRef(false);
  const { gl } = useThree();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const removeAfterEffect = addAfterEffect(() => {
      if (signalled.current || !mounted.current) return;
      const context = gl.getContext();
      if (
        gl.info.render.frame < 1 ||
        gl.domElement.width < 1 ||
        gl.domElement.height < 1 ||
        context.isContextLost()
      ) {
        return;
      }
      signalled.current = true;
      window.requestAnimationFrame(() => {
        if (mounted.current && !context.isContextLost()) onReady();
      });
    });
    return () => {
      mounted.current = false;
      removeAfterEffect();
    };
  }, [gl, onReady]);
  return null;
}

function ContextLossSignal({ onFailure }: { onFailure: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", onContextLost, { once: true });
    return () => canvas.removeEventListener("webglcontextlost", onContextLost);
  }, [gl, onFailure]);
  return null;
}

function ProgressController({
  progressRef,
  displayedProgressRef,
  paused,
  onProgressLabel,
}: {
  progressRef: RefObject<number>;
  displayedProgressRef: RefObject<number>;
  paused: boolean;
  onProgressLabel: (progress: number) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const initialized = useRef(false);
  const lastLabel = useRef(-1);
  const wakeNextFrame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (wakeNextFrame.current !== null) window.cancelAnimationFrame(wakeNextFrame.current);
    },
    [],
  );

  useFrame((_, rawDelta) => {
    if (paused) return;
    const target = progressRef.current ?? 0;
    if (!initialized.current) {
      displayedProgressRef.current = target;
      initialized.current = true;
    } else {
      displayedProgressRef.current = advanceDisplayedProgress(
        displayedProgressRef.current ?? target,
        target,
        rawDelta,
      );
    }
    const label = Math.round((displayedProgressRef.current ?? 0) * 100);
    if (label !== lastLabel.current) {
      lastLabel.current = label;
      onProgressLabel(label);
    }
    if ((displayedProgressRef.current ?? target) !== target && wakeNextFrame.current === null) {
      wakeNextFrame.current = window.requestAnimationFrame(() => {
        wakeNextFrame.current = null;
        invalidate();
      });
    }
  }, -2);

  return null;
}

function Atmosphere({ displayedProgressRef }: { displayedProgressRef: RefObject<number> }) {
  const glow = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (glow.current) glow.current.intensity = 0.85 + (displayedProgressRef.current ?? 0) * 0.48;
  });
  return (
    <>
      <fogExp2 attach="fog" args={[designConfig.colors.background, 0.035]} />
      <ambientLight intensity={0.72} color={designConfig.colors.text} />
      <directionalLight
        position={[-4, 6, 6]}
        intensity={2.15}
        color={designConfig.colors.text}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight
        ref={glow}
        position={[-2.5, 0.8, 3]}
        color={designConfig.colors.muted}
        distance={10}
        intensity={0.9}
      />
      <pointLight
        position={[3.8, -1.8, 2]}
        color={designConfig.colors.orange}
        distance={8}
        intensity={0.35}
      />
      <Environment resolution={64}>
        <Lightformer
          intensity={1.8}
          color={designConfig.colors.text}
          position={[-2, 5, 4]}
          scale={[7, 2, 1]}
        />
        <Lightformer
          intensity={0.65}
          color={designConfig.colors.mint}
          position={[-5, 0, 0]}
          rotation-y={Math.PI / 2}
          scale={[8, 1, 1]}
        />
      </Environment>
    </>
  );
}

function Scene({
  progressRef,
  displayedProgressRef,
  paused,
  onProgressLabel,
}: {
  progressRef: RefObject<number>;
  displayedProgressRef: RefObject<number>;
  paused: boolean;
  onProgressLabel: (progress: number) => void;
}) {
  const { viewport, size } = useThree();
  const mobile = size.width < 640;
  const shortViewport = size.height < 600 && size.width >= 640;
  const bounds = computeSceneBounds(mobile);

  // Fit is derived from the real profile bounds across every visible pose,
  // inside the area left free by the copy block above and the controls below.
  const worldPerPx = viewport.height / Math.max(1, size.height);
  const dockPx = shortViewport ? 72 : mobile ? 104 : 116;
  const topReservePx = shortViewport ? 64 : size.height * (mobile ? 0.56 : 0.4);
  // On short landscape the copy sits in a left column (CSS: min(46vw, 25rem)),
  // so the free area is measured from its right edge instead of a fixed
  // fraction that used to collapse the width to the 160px floor.
  const gutterPx = shortViewport ? size.width * 0.05 : mobile ? 14 : 72;
  const copyColumnPx = shortViewport ? Math.min(size.width * 0.46, 400) + 24 : gutterPx;
  const leftReservePx = copyColumnPx;
  const availableHeightPx = Math.max(120, size.height - topReservePx - dockPx);
  const availableWidthPx = Math.max(160, size.width - leftReservePx - gutterPx);
  const availableHeight = availableHeightPx * worldPerPx;
  const availableWidth = availableWidthPx * worldPerPx;

  const scale = THREE.MathUtils.clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    shortViewport ? 0.14 : 0.22,
    1.05,
  );

  // Centre of the free area, converted from CSS pixels to world units.
  const areaCenterPx = topReservePx + availableHeightPx / 2;
  const areaCenterY = viewport.height / 2 - areaCenterPx * worldPerPx;
  const sceneY = areaCenterY - bounds.centerY * scale;
  const areaCenterXPx = leftReservePx + availableWidthPx / 2;
  const sceneX = shortViewport
    ? areaCenterXPx * worldPerPx - viewport.width / 2 - bounds.centerX * scale
    : -bounds.centerX * scale;
  // At rest every link clears the actual canvas edge; there is no opaque dock
  // or ground plane available to conceal an incorrectly positioned profile.
  const hiddenTopY = -viewport.height / 2 - motionConfig.hidden.concealSafetyPx * worldPerPx;
  const localYAxisY = new THREE.Vector3(0, 1, 0).applyEuler(
    new THREE.Euler(...motionConfig.presentation.rotation),
  ).y;
  const hiddenDrop =
    (hiddenTopY - (sceneY + bounds.maxY * scale)) / Math.max(0.001, scale * localYAxisY);

  return (
    <>
      <ProgressController
        progressRef={progressRef}
        displayedProgressRef={displayedProgressRef}
        paused={paused}
        onProgressLabel={onProgressLabel}
      />
      <Atmosphere displayedProgressRef={displayedProgressRef} />
      <group
        scale={scale}
        position={[sceneX, sceneY, 0]}
        rotation={motionConfig.presentation.rotation}
      >
        <PortalLinks
          displayedProgressRef={displayedProgressRef}
          paused={paused}
          mobile={mobile}
          hiddenDrop={hiddenDrop}
        />
      </group>
    </>
  );
}

export function PortalScene({
  progressRef,
  displayedProgressRef,
  paused,
  onModuleMounted,
  onFallbackChange,
  onReady,
  onProgressLabel,
}: {
  progressRef: RefObject<number>;
  displayedProgressRef: RefObject<number>;
  paused: boolean;
  onModuleMounted: () => void;
  onFallbackChange: (fallback: boolean) => void;
  onReady: () => void;
  onProgressLabel: (progress: number) => void;
}) {
  const [status, setStatus] = useState<SceneStatus>("loading");
  const fallback = status === "static";
  const readyRemainingMs = useRef(READY_TIMEOUT_MS);
  const markReady = useCallback(
    () => setStatus((previous) => (previous === "loading" ? "ready" : previous)),
    [],
  );
  const markStatic = useCallback(() => setStatus("static"), []);

  useEffect(onModuleMounted, [onModuleMounted]);
  useEffect(() => onFallbackChange(fallback), [fallback, onFallbackChange]);
  useEffect(() => {
    if (status === "ready") onReady();
  }, [onReady, status]);

  // A renderer that never produces a frame (blocked or failing WebGL) must not
  // leave an empty hero: commit to the static portal after a bounded wait.
  useEffect(() => {
    if (status !== "loading") return;
    let lastTick = performance.now();
    let timer: number | null = null;
    const tick = () => {
      const now = performance.now();
      if (!document.hidden && !paused) readyRemainingMs.current -= now - lastTick;
      lastTick = now;
      if (readyRemainingMs.current <= 0) {
        markStatic();
        return;
      }
      timer = window.setTimeout(tick, Math.min(readyRemainingMs.current, 100));
    };
    const resetClock = () => {
      lastTick = performance.now();
    };
    document.addEventListener("visibilitychange", resetClock);
    timer = window.setTimeout(tick, 100);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resetClock);
    };
  }, [markStatic, paused, status]);

  if (status === "static") return null;

  return (
    <>
      {status === "loading" && <PortalLoadingFallback />}
      <CanvasBoundary onFailure={markStatic}>
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500"
          style={{ opacity: status === "ready" ? 1 : 0 }}
          aria-hidden="true"
        >
          <Canvas
            dpr={[1, 1.5]}
            frameloop="demand"
            shadows="basic"
            camera={{ position: motionConfig.camera.position, fov: motionConfig.camera.fov }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            fallback={null}
            // Прозрачная очистка: фон главы (GalleryBackground) остаётся видимым под знаком.
            onCreated={({ gl }) => gl.setClearColor(designConfig.colors.background, 0)}
          >
            <ReadySignal onReady={markReady} />
            <ContextLossSignal onFailure={markStatic} />
            <QualityController paused={paused} />
            <Scene
              progressRef={progressRef}
              displayedProgressRef={displayedProgressRef}
              paused={paused}
              onProgressLabel={onProgressLabel}
            />
          </Canvas>
        </div>
      </CanvasBoundary>
    </>
  );
}
