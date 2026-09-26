import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomDock } from "@/components/vne/BottomDock";
import { DockOccluder } from "@/components/vne/DockOccluder";
import { InvitationDialog } from "@/components/vne/InvitationDialog";
import { PortalLoadingFallback } from "@/components/vne/PortalLoadingFallback";
import { PortalSceneLoader } from "@/components/vne/PortalSceneLoader";
import { SiteHeader } from "@/components/vne/SiteHeader";
import { StaticFallback } from "@/components/vne/StaticFallback";
import { Wordmark } from "@/components/vne/Wordmark";
import { getSectionProgress } from "@/components/vne/ExperienceController";
import { vneContent } from "@/content/vne-content";
import { motionConfig } from "@/config/motion-config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ВНЕ — закрытые музыкальные события" },
      {
        name: "description",
        content: "ВНЕ — пространство закрытых музыкальных событий. Вход начинается с приглашения.",
      },
      { property: "og:title", content: "ВНЕ — за пределами привычного" },
      {
        property: "og:description",
        content: "Закрытые музыкальные события и пространство за пределами привычного.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const displayedProgressRef = useRef(0);
  const scrollDistanceRef = useRef(0);
  const belowOffsetRef = useRef<{ sectionHeight: number; offset: number | null }>({
    sectionHeight: 0,
    offset: null,
  });
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [contextFallback, setContextFallback] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progressLabel, setProgressLabel] = useState(0);
  const staticMode = reducedMotion === true || contextFallback;
  const onFallbackChange = useCallback((fallback: boolean) => setContextFallback(fallback), []);
  const staticModeRef = useRef(staticMode);
  const pausedRef = useRef(dialogOpen);
  staticModeRef.current = staticMode;
  pausedRef.current = dialogOpen;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    const update = () => {
      progressRef.current = media.matches ? 1 : getSectionProgress(sectionRef.current);
      scrollDistanceRef.current = Math.max(
        1,
        (sectionRef.current?.offsetHeight ?? window.innerHeight) - window.innerHeight,
      );
      const section = sectionRef.current;
      if (section) {
        // Смещение места чтения ниже портала записываем только при неизменной
        // геометрии секции: во время resize браузер сам двигает scrollY, и
        // запись нового значения стёрла бы исходное место чтения.
        const sectionHeight = section.offsetHeight;
        if (belowOffsetRef.current.sectionHeight === sectionHeight) {
          const sectionEnd = section.getBoundingClientRect().bottom + window.scrollY;
          belowOffsetRef.current.offset =
            window.scrollY > sectionEnd - window.innerHeight ? window.scrollY - sectionEnd : null;
        } else if (belowOffsetRef.current.sectionHeight === 0) {
          belowOffsetRef.current = { sectionHeight, offset: null };
        }
      }
      window.dispatchEvent(new Event("portal-motion-wake"));
    };

    const editing = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
        active.closest("[role='dialog']") !== null
      );
    };

    const resize = () => {
      const section = sectionRef.current;
      if (!section) return;
      // Only realign while the reader is actually inside the interactive
      // portal section: below it (next chapter), in static mode, or while a
      // dialog/form has focus we keep the browser's natural position.
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const insideSection =
        window.scrollY >= sectionTop - 1 &&
        window.scrollY <= sectionTop + scrollDistanceRef.current;
      const logicalProgress = progressRef.current;
      if (media.matches || staticModeRef.current || pausedRef.current || editing()) {
        window.requestAnimationFrame(update);
        return;
      }
      // Во время resize браузер уже мог обрезать scrollY, поэтому «читаю ниже
      // портала» определяем по состоянию до изменения геометрии секции.
      const staleRecord = belowOffsetRef.current.sectionHeight !== section.offsetHeight;
      const wasBelow = staleRecord ? belowOffsetRef.current.offset !== null : !insideSection;
      if (wasBelow) {
        // Ниже портала сохраняем логическое место чтения: постоянное смещение
        // от конца секции, с учётом новой максимальной прокрутки.
        const belowOffset = belowOffsetRef.current.offset;
        window.requestAnimationFrame(() => {
          const current = sectionRef.current;
          if (current) {
            const nextEnd = current.getBoundingClientRect().bottom + window.scrollY;
            if (belowOffset !== null) {
              const maxScroll = Math.max(
                0,
                document.documentElement.scrollHeight - window.innerHeight,
              );
              const root = document.documentElement;
              const previousBehavior = root.style.scrollBehavior;
              root.style.scrollBehavior = "auto";
              window.scrollTo(
                window.scrollX,
                Math.min(maxScroll, Math.max(0, nextEnd + belowOffset)),
              );
              root.style.scrollBehavior = previousBehavior;
            }
            belowOffsetRef.current = {
              sectionHeight: current.offsetHeight,
              offset:
                window.scrollY > nextEnd - window.innerHeight ? window.scrollY - nextEnd : null,
            };
          }
          update();
        });
        return;
      }
      window.requestAnimationFrame(() => {
        const current = sectionRef.current;
        if (!current) return;
        const nextDistance = Math.max(1, current.offsetHeight - window.innerHeight);
        const nextTop = current.getBoundingClientRect().top + window.scrollY;
        // A technical correction must never animate, even with a global
        // `scroll-behavior: smooth` on <html>.
        const root = document.documentElement;
        const previousBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(window.scrollX, nextTop + logicalProgress * nextDistance);
        root.style.scrollBehavior = previousBehavior;
        scrollDistanceRef.current = nextDistance;
        belowOffsetRef.current = { sectionHeight: current.offsetHeight, offset: null };
        update();
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => {
      media.removeEventListener("change", updatePreference);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, []);

  const assemble = () => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  const scrollStyle = {
    "--scroll-desktop": `${100 + motionConfig.scroll.desktopVh}svh`,
    "--scroll-mobile": `${100 + motionConfig.scroll.mobileVh}svh`,
    "--scroll-static": `${motionConfig.scroll.staticVh}svh`,
  } as CSSProperties;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader onDialogOpenChange={setDialogOpen} />
      <section
        ref={sectionRef}
        id="threshold"
        className="threshold-scroll relative"
        style={scrollStyle}
        aria-labelledby="vne-title"
        data-mode={staticMode ? "static" : "interactive"}
      >
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          <ClientOnly fallback={<PortalLoadingFallback />}>
            {staticMode ? (
              <StaticFallback />
            ) : reducedMotion === null ? (
              <PortalLoadingFallback />
            ) : (
              <PortalSceneLoader
                progressRef={progressRef}
                displayedProgressRef={displayedProgressRef}
                paused={dialogOpen}
                onFailure={() => onFallbackChange(true)}
                onProgressLabel={setProgressLabel}
              />
            )}
          </ClientOnly>
          <div className="pointer-events-none absolute inset-0 z-10 bg-atmosphere" />
          <div className="portal-copy-layer pointer-events-none relative z-30 mx-auto flex h-full max-w-[1600px] flex-col px-5 pb-[14vh] pt-[16vh] sm:px-8 sm:pt-[13vh] lg:px-12">
            <div className="portal-copy w-[82vw] max-w-[690px] sm:w-[48vw]">
              <p className="mb-5 font-display text-xs uppercase text-muted-foreground">
                {vneContent.eyebrow}
              </p>
              <h1 id="vne-title" className="sr-only">
                ВНЕ
              </h1>
              <Wordmark />
              <p className="mt-4 font-body text-sm text-muted-foreground sm:text-base">
                {vneContent.tagline}
              </p>
            </div>
            <div className="portal-actions pointer-events-auto mt-6 flex flex-col items-start gap-3 sm:mt-auto sm:flex-row sm:items-center">
              <InvitationDialog onOpenChange={setDialogOpen} />
              {!staticMode && (
                <Button
                  variant="ghost"
                  onClick={assemble}
                  className="h-12 px-3 text-foreground hover:bg-muted/70"
                >
                  {vneContent.secondaryCta}
                  <ArrowDown aria-hidden="true" />
                </Button>
              )}
            </div>
            {!staticMode && progressLabel === 0 && (
              <p
                className="portal-hint pointer-events-none mt-3 font-body text-xs text-muted-foreground"
                role="status"
              >
                Прокрутите, чтобы открыть портал
              </p>
            )}
          </div>
          <BottomDock />
          <DockOccluder />
          {!staticMode && (
            <div
              className="pointer-events-none absolute bottom-5 right-5 z-30 font-display text-xs text-muted-foreground sm:right-8"
              aria-hidden="true"
            >
              СБОРКА {progressLabel.toString().padStart(2, "0")}
            </div>
          )}
        </div>
      </section>
      <section
        id="night"
        className="flex min-h-[36vh] items-center border-t border-border bg-surface px-5 py-16 sm:px-12"
      >
        <div className="mx-auto w-full max-w-[1500px]">
          <p className="font-display text-xs text-mint">02 / ДАЛЬШЕ</p>
          <p className="mt-4 max-w-lg font-body text-lg text-muted-foreground">
            История продолжится после утверждения первого порога.
          </p>
        </div>
      </section>
    </main>
  );
}
