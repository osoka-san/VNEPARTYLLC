import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowUp, Link as LinkIcon, Square } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import {
  galleryContinuationConfig,
  getGalleryPhase,
  growGalleryAllocation,
} from "@/config/gallery-continuation";
import {
  galleryMedia,
  mediaUrl,
  type GalleryChapter,
  type GalleryMediaVariant,
} from "@/content/gallery-media";

type GalleryMemory = {
  active: boolean;
  allocatedScenes: number;
  sceneUnit: number;
  lastScene: number;
  localOffset: number | null;
};

type SceneSource = {
  key: string;
  avif: string;
  webp: string;
  chapter: GalleryChapter;
  focal: string;
};
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };
type PendingTransition = {
  generation: number;
  key: string;
  incomingSlot: number;
  outgoingSlot: number;
  outgoingOpacity: string;
};

const memory = new Map<string, GalleryMemory>();
const sceneOrder: GalleryChapter[] = ["hero", "space", "belonging", "invitation"];

function remember(key: string, value: GalleryMemory) {
  memory.delete(key);
  memory.set(key, value);
  while (memory.size > galleryContinuationConfig.memoryEntries) {
    const oldest = memory.keys().next().value;
    if (typeof oldest !== "string") break;
    memory.delete(oldest);
  }
}

function selectWidth(widths: number[], fallback: number) {
  const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true;
  const target = window.innerWidth * (saveData ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  return widths.find((width) => width >= target) ?? widths.at(-1) ?? fallback;
}

function sceneSource(chapter: GalleryChapter): SceneSource {
  const mobile = window.matchMedia("(max-width: 639px)").matches;
  const variant: GalleryMediaVariant = galleryMedia[chapter][mobile ? "mobile" : "desktop"];
  const avifWidth = selectWidth(variant.formatWidths?.avif ?? variant.widths, variant.width);
  const webpWidth = selectWidth(variant.formatWidths?.webp ?? variant.widths, variant.width);
  const avif = mediaUrl(variant, avifWidth, "avif");
  return {
    key: `${chapter}:${mobile ? "mobile" : "desktop"}:${avifWidth}:${webpWidth}:${window.devicePixelRatio || 1}`,
    chapter,
    avif,
    webp: mediaUrl(variant, webpWidth, "webp"),
    focal: `${variant.focal.x * 100}% ${variant.focal.y * 100}%`,
  };
}

function forceInstantScroll(target: Element | null) {
  if (!target) return;
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  target.scrollIntoView({ behavior: "auto" });
  window.requestAnimationFrame(() => {
    root.style.scrollBehavior = previous;
  });
}

export function GalleryContinuation({ paused }: { paused: boolean }) {
  const historyKey = useRouterState({
    select: (state) => state.location.state.__TSR_key ?? state.location.href,
  });
  const restored = memory.get(historyKey);
  const { reduced, settings } = useMotionEnv();
  const motionOff = settings.revealStyle === "none" && !settings.textEnabled;
  const activationRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const runwayRef = useRef<HTMLDivElement>(null);
  const firstImageRef = useRef<HTMLImageElement>(null);
  const secondImageRef = useRef<HTMLImageElement>(null);
  const imageRefs = useRef([firstImageRef, secondImageRef] as const);
  const activeSlotRef = useRef(0);
  const installedKeyRef = useRef<string | null>(null);
  const desiredKeyRef = useRef<string | null>(null);
  const desiredSceneRef = useRef(restored?.lastScene ?? 0);
  const generationRef = useRef(0);
  const transitionRef = useRef<number | null>(null);
  const pendingTransitionRef = useRef<PendingTransition | null>(null);
  const preloadRef = useRef<{ key: string; image: HTMLImageElement } | null>(null);
  const frameRef = useRef(0);
  const startRef = useRef(0);
  const sceneUnitRef = useRef(restored?.sceneUnit ?? 0);
  const allocatedRef = useRef(restored?.allocatedScenes ?? galleryContinuationConfig.initialScenes);
  const activeRef = useRef(restored?.active ?? false);
  const restoreOffsetRef = useRef(
    restored?.active && restored.localOffset !== null ? restored.localOffset : null,
  );
  const lastLocalOffsetRef = useRef(restored?.localOffset ?? null);
  const hiddenRef = useRef(false);
  const pausedRef = useRef(paused);
  const frozenRef = useRef(false);
  const opacityRef = useRef(0);
  const [active, setActive] = useState(activeRef.current);
  const [allocatedScenes, setAllocatedScenes] = useState(allocatedRef.current);
  const [frozen, setFrozen] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  pausedRef.current = paused;

  const canCommit = useCallback(
    (generation: number, key: string) =>
      activeRef.current &&
      !pausedRef.current &&
      !frozenRef.current &&
      !hiddenRef.current &&
      generation === generationRef.current &&
      desiredKeyRef.current === key,
    [],
  );

  const ownsRequest = useCallback((image: HTMLImageElement, generation: number, key: string) => {
    return (
      generation === generationRef.current &&
      image.dataset["pendingKey"] === key &&
      image.dataset["pendingGeneration"] === String(generation)
    );
  }, []);

  const cancelPending = useCallback(() => {
    generationRef.current += 1;
    if (transitionRef.current !== null) {
      window.clearTimeout(transitionRef.current);
      transitionRef.current = null;
    }
    const pendingTransition = pendingTransitionRef.current;
    pendingTransitionRef.current = null;
    if (pendingTransition) {
      const outgoing = imageRefs.current[pendingTransition.outgoingSlot]?.current;
      if (
        outgoing &&
        installedKeyRef.current &&
        outgoing.dataset["sourceKey"] === installedKeyRef.current &&
        outgoing.complete &&
        outgoing.naturalWidth > 0
      ) {
        outgoing.style.transition = "none";
        outgoing.style.opacity = pendingTransition.outgoingOpacity;
      }
    }
    if (preloadRef.current) {
      preloadRef.current.image.src = "";
      preloadRef.current = null;
    }
    for (const ref of imageRefs.current) {
      const image = ref.current;
      if (!image?.dataset["pendingKey"]) continue;
      image.removeAttribute("src");
      delete image.dataset["pendingKey"];
      delete image.dataset["pendingGeneration"];
      image.style.opacity = "0";
    }
  }, []);

  const persist = useCallback(() => {
    remember(historyKey, {
      active: activeRef.current,
      allocatedScenes: allocatedRef.current,
      sceneUnit: sceneUnitRef.current,
      lastScene: desiredSceneRef.current,
      localOffset: activeRef.current ? lastLocalOffsetRef.current : null,
    });
  }, [historyKey]);

  const measureStart = useCallback(() => {
    const runway = runwayRef.current;
    if (runway) startRef.current = runway.getBoundingClientRect().top + window.scrollY;
  }, []);

  const preloadNext = useCallback((sceneIndex: number) => {
    if (
      !activeRef.current ||
      pausedRef.current ||
      frozenRef.current ||
      hiddenRef.current ||
      (navigator as NavigatorWithConnection).connection?.saveData === true
    ) {
      return;
    }
    const chapter = sceneOrder[(sceneIndex + 1) % sceneOrder.length];
    if (!chapter) return;
    const source = sceneSource(chapter);
    if (preloadRef.current?.key === source.key) return;
    if (preloadRef.current) preloadRef.current.image.src = "";
    const image = new Image();
    image.decoding = "async";
    preloadRef.current = { key: source.key, image };
    image.src = source.avif;
  }, []);

  const installScene = useCallback(
    (sceneIndex: number, opacity: number) => {
      const chapter = sceneOrder[sceneIndex];
      if (!chapter) return;
      const source = sceneSource(chapter);
      desiredSceneRef.current = sceneIndex;
      opacityRef.current = opacity;

      if (desiredKeyRef.current !== source.key) {
        cancelPending();
        desiredKeyRef.current = source.key;
      }

      const current = imageRefs.current[activeSlotRef.current]?.current;
      if (
        installedKeyRef.current === source.key &&
        current?.dataset["sourceKey"] === source.key &&
        current.complete &&
        current.naturalWidth > 0
      ) {
        current.style.transition = "";
        current.style.opacity = String(opacity);
        return;
      }

      const generation = generationRef.current;
      const incomingSlot = activeSlotRef.current === 0 ? 1 : 0;
      const incoming = imageRefs.current[incomingSlot]?.current;
      if (!incoming || incoming.dataset["pendingKey"] === source.key) return;
      incoming.dataset["pendingKey"] = source.key;
      incoming.dataset["pendingGeneration"] = String(generation);
      incoming.style.transition = "";
      incoming.style.opacity = "0";
      incoming.style.objectPosition = source.focal;

      const decodeMounted = async (url: string) => {
        incoming.src = url;
        await incoming.decode();
        if (!canCommit(generation, source.key)) throw new DOMException("Stale", "AbortError");
        return url;
      };

      void decodeMounted(source.avif)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          if (
            !canCommit(generation, source.key) ||
            !ownsRequest(incoming, generation, source.key)
          ) {
            throw new DOMException("Stale", "AbortError");
          }
          return decodeMounted(source.webp);
        })
        .then((resolved) => {
          if (!canCommit(generation, source.key) || !ownsRequest(incoming, generation, source.key))
            return;
          const outgoingSlot = activeSlotRef.current;
          const outgoing = imageRefs.current[outgoingSlot]?.current;
          const outgoingOpacity = outgoing
            ? String(
                Math.max(
                  Number.parseFloat(window.getComputedStyle(outgoing).opacity) || 0,
                  opacityRef.current,
                ),
              )
            : "1";
          if (outgoing) {
            outgoing.style.transition = "";
            outgoing.style.opacity = "0";
          }
          pendingTransitionRef.current = {
            generation,
            key: source.key,
            incomingSlot,
            outgoingSlot,
            outgoingOpacity,
          };
          transitionRef.current = window.setTimeout(() => {
            transitionRef.current = null;
            const transition = pendingTransitionRef.current;
            if (
              !transition ||
              transition.generation !== generation ||
              transition.key !== source.key ||
              transition.incomingSlot !== incomingSlot ||
              !canCommit(generation, source.key) ||
              !ownsRequest(incoming, generation, source.key)
            ) {
              return;
            }
            pendingTransitionRef.current = null;
            incoming.dataset["chapter"] = source.chapter;
            incoming.dataset["sourceKey"] = source.key;
            delete incoming.dataset["pendingKey"];
            delete incoming.dataset["pendingGeneration"];
            incoming.dataset["resolvedSrc"] = resolved;
            incoming.style.opacity = String(opacityRef.current);
            activeSlotRef.current = incomingSlot;
            installedKeyRef.current = source.key;
            preloadNext(sceneIndex);
            persist();
          }, galleryContinuationConfig.transitionMs);
        })
        .catch((error: unknown) => {
          if (!ownsRequest(incoming, generation, source.key)) return;
          if (!canCommit(generation, source.key)) return;
          delete incoming.dataset["pendingKey"];
          delete incoming.dataset["pendingGeneration"];
          if (error instanceof DOMException && error.name === "AbortError") return;
          const outgoing = imageRefs.current[activeSlotRef.current]?.current;
          if (outgoing && installedKeyRef.current) {
            outgoing.style.transition = "none";
            outgoing.style.opacity = outgoing.style.opacity || "1";
          }
        });
    },
    [cancelPending, canCommit, ownsRequest, persist, preloadNext],
  );

  const update = useCallback(() => {
    frameRef.current = 0;
    if (!activeRef.current || frozenRef.current || pausedRef.current || hiddenRef.current) return;
    if (restoreOffsetRef.current !== null) return;
    lastLocalOffsetRef.current = window.scrollY - startRef.current;
    if (window.scrollY < startRef.current) {
      installScene(desiredSceneRef.current, 1);
      return;
    }
    const phase = getGalleryPhase(window.scrollY, startRef.current, sceneUnitRef.current);
    installScene(phase.sceneIndex, phase.opacity);
    const nextAllocation = growGalleryAllocation(allocatedRef.current, phase.absoluteIndex);
    if (nextAllocation !== allocatedRef.current) {
      allocatedRef.current = nextAllocation;
      setAllocatedScenes(nextAllocation);
      persist();
    }
    if (
      nextAllocation >= galleryContinuationConfig.maxScenes &&
      phase.absoluteIndex >= galleryContinuationConfig.maxScenes - 2
    ) {
      setLimitReached(true);
    }
  }, [installScene, persist]);

  useLayoutEffect(() => {
    if (!active) return;
    activeRef.current = true;
    installedKeyRef.current = null;
    desiredKeyRef.current = null;
    if (sceneUnitRef.current <= 0) {
      sceneUnitRef.current = Math.max(
        1,
        window.innerHeight * galleryContinuationConfig.sceneViewportMultiplier,
      );
    }
    measureStart();
    const restoreOffset = restoreOffsetRef.current;
    if (restoreOffset !== null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!activeRef.current || restoreOffsetRef.current !== restoreOffset) return;
          const root = document.documentElement;
          const previousBehavior = root.style.scrollBehavior;
          root.style.scrollBehavior = "auto";
          window.scrollTo(window.scrollX, startRef.current + restoreOffset);
          root.style.scrollBehavior = previousBehavior;
          lastLocalOffsetRef.current = restoreOffset;
          restoreOffsetRef.current = null;
          if (!frameRef.current) frameRef.current = window.requestAnimationFrame(update);
        });
      });
    }
  }, [active, measureStart, update]);

  useEffect(() => {
    frozenRef.current = frozen;
    if (frozen) cancelPending();
  }, [cancelPending, frozen]);

  useEffect(() => {
    if (!active || (!reduced && !motionOff)) return;
    frozenRef.current = true;
    cancelPending();
    setFrozen(true);
  }, [active, cancelPending, motionOff, reduced]);

  useEffect(() => {
    if (!active) return;
    const wake = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(update);
    };
    const visibility = () => {
      hiddenRef.current = document.hidden;
      if (document.hidden) cancelPending();
      else wake();
    };
    const resize = () => {
      measureStart();
      wake();
    };
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", visibility);
    wake();
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", visibility);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      cancelPending();
      persist();
    };
  }, [active, cancelPending, measureStart, persist, update]);

  useEffect(() => {
    if (paused && active) cancelPending();
    if (!paused && active && !frozen) frameRef.current = window.requestAnimationFrame(update);
  }, [active, cancelPending, frozen, paused, update]);

  useEffect(() => {
    if (!active && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      activationRef.current?.focus({ preventScroll: true });
    }
  }, [active]);

  const resetSlots = () => {
    cancelPending();
    activeSlotRef.current = 0;
    installedKeyRef.current = null;
    desiredKeyRef.current = null;
    for (const ref of imageRefs.current) {
      const image = ref.current;
      if (!image) continue;
      image.removeAttribute("src");
      image.removeAttribute("data-chapter");
      image.removeAttribute("data-source-key");
      image.removeAttribute("data-pending-key");
      image.removeAttribute("data-pending-generation");
      image.style.transition = "";
      image.style.opacity = "0";
    }
  };

  const activate = () => {
    if (reduced || motionOff) return;
    resetSlots();
    activeRef.current = true;
    lastLocalOffsetRef.current = 0;
    sceneUnitRef.current = Math.max(
      1,
      window.innerHeight * galleryContinuationConfig.sceneViewportMultiplier,
    );
    allocatedRef.current = galleryContinuationConfig.initialScenes;
    setAllocatedScenes(allocatedRef.current);
    frozenRef.current = false;
    setFrozen(false);
    setLimitReached(false);
    setActive(true);
    persist();
    window.requestAnimationFrame(() => {
      measureStart();
      runwayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const controlledScroll = (target: Element | null) => {
    if (reduced || motionOff || frozen) forceInstantScroll(target);
    else target?.scrollIntoView({ behavior: "smooth" });
  };

  const restart = () => {
    resetSlots();
    allocatedRef.current = galleryContinuationConfig.initialScenes;
    setAllocatedScenes(allocatedRef.current);
    setLimitReached(false);
    controlledScroll(runwayRef.current);
  };

  const finish = () => {
    activeRef.current = false;
    lastLocalOffsetRef.current = null;
    cancelPending();
    forceInstantScroll(activationRef.current);
    restoreFocusRef.current = true;
    allocatedRef.current = galleryContinuationConfig.initialScenes;
    sceneUnitRef.current = 0;
    remember(historyKey, {
      active: false,
      allocatedScenes: galleryContinuationConfig.initialScenes,
      sceneUnit: 0,
      lastScene: 0,
      localOffset: null,
    });
    setActive(false);
  };

  const runwayStyle = {
    "--gallery-runway-height": `${allocatedScenes * Math.max(1, sceneUnitRef.current)}px`,
    "--gallery-transition": `${galleryContinuationConfig.transitionMs}ms`,
  } as CSSProperties;

  return (
    <section className="border-t border-border bg-background" aria-label="Продолжение галереи">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-3 px-5 py-8 sm:px-8 lg:px-12">
        <Button
          ref={activationRef}
          type="button"
          variant="outline"
          onClick={activate}
          disabled={active}
          aria-disabled={!active && (reduced || motionOff)}
          className="min-h-11 border-border"
        >
          Продолжить галерею
        </Button>
        {!active && (reduced || motionOff) ? (
          <p className="text-sm text-muted-foreground">
            Продолжение доступно при включённом движении.
          </p>
        ) : null}
      </div>
      {active ? (
        <>
          <div
            ref={runwayRef}
            className="gallery-continuation-runway relative bg-background"
            style={runwayStyle}
            data-gallery-continuation="active"
            data-allocated-scenes={allocatedScenes}
          >
            <div
              className="sticky top-0 h-[100svh] overflow-hidden bg-background"
              aria-hidden="true"
            >
              <picture className="absolute inset-0 block h-full w-full">
                <img
                  ref={firstImageRef}
                  alt=""
                  decoding="async"
                  className="gallery-continuation-image h-full w-full object-cover"
                />
              </picture>
              <picture className="absolute inset-0 block h-full w-full">
                <img
                  ref={secondImageRef}
                  alt=""
                  decoding="async"
                  className="gallery-continuation-image h-full w-full object-cover"
                />
              </picture>
              <div className="gallery-continuation-edge absolute inset-0" />
            </div>
          </div>
          <nav
            aria-label="Управление продолжением галереи"
            className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap justify-center gap-2"
          >
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 bg-surface/95"
              onClick={() => controlledScroll(document.querySelector("#threshold"))}
            >
              <ArrowUp aria-hidden="true" /> К началу
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 bg-surface/95"
              onClick={() => controlledScroll(document.querySelector("#site-links"))}
            >
              <LinkIcon aria-hidden="true" /> К ссылкам
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 bg-surface/95"
              onClick={finish}
            >
              <Square aria-hidden="true" /> Завершить просмотр
            </Button>
            {limitReached ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 bg-surface/95"
                onClick={restart}
              >
                Начать продолжение заново
              </Button>
            ) : null}
          </nav>
          {frozen ? (
            <p className="fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md bg-surface/95 p-3 text-center text-sm text-foreground">
              Движение остановлено. Завершите просмотр, чтобы вернуться к странице.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
