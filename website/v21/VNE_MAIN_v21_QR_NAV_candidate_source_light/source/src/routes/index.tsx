import { ClientOnly, Link, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalLoadingFallback } from "@/components/vne/PortalLoadingFallback";
import { PortalSceneLoader } from "@/components/vne/PortalSceneLoader";
import { SiteHeader } from "@/components/vne/SiteHeader";
import { StaticFallback } from "@/components/vne/StaticFallback";
import { AppFooter } from "@/components/app/AppFooter";
import { GalleryBackground } from "@/components/vne/GalleryBackground";
import { GalleryContinuation } from "@/components/vne/GalleryContinuation";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { TextRoll } from "@/components/motion/TextRoll";
import { TextLoop } from "@/components/motion/TextLoop";
import { TextSection } from "@/components/motion/TextSection";
import { InView } from "@/components/motion/InView";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { Magnetic, TextScramble } from "@/components/motion/Interactive";
import { getSectionProgress } from "@/components/vne/ExperienceController";
import { vneContent } from "@/content/vne-content";
import { motionConfig, portalPhase } from "@/config/motion-config";
import { galleryMedia, mediaSrcSet, mediaUrl } from "@/content/gallery-media";

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
    links: [
      {
        rel: "preload",
        as: "image",
        href: mediaUrl(galleryMedia.hero.mobile, 941, "avif"),
        imageSrcSet: mediaSrcSet(galleryMedia.hero.mobile, "avif"),
        imageSizes: "100vw",
        media: "(max-width: 639px)",
        type: "image/avif",
        fetchPriority: "high",
      },
      {
        rel: "preload",
        as: "image",
        href: mediaUrl(galleryMedia.hero.desktop, 1672, "avif"),
        imageSrcSet: mediaSrcSet(galleryMedia.hero.desktop, "avif"),
        imageSizes: "100vw",
        media: "(min-width: 640px)",
        type: "image/avif",
        fetchPriority: "high",
      },
    ],
  }),
  component: Index,
});

const portalFallbackMemory = new Map<string, boolean>();

function Index() {
  const historyKey = useRouterState({
    select: (state) => state.location.state.__TSR_key ?? state.location.href,
  });
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const displayedProgressRef = useRef(0);
  const scrollDistanceRef = useRef(0);
  const dialogScrollRef = useRef(0);
  const belowOffsetRef = useRef<{ sectionHeight: number; offset: number | null }>({
    sectionHeight: 0,
    offset: null,
  });
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [contextFallback, setContextFallback] = useState(
    () => portalFallbackMemory.get(historyKey) ?? false,
  );
  const [heroImageReady, setHeroImageReady] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [portalVisualReady, setPortalVisualReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progressLabel, setProgressLabel] = useState(0);
  const { reduced: envReduced, settings: motionSettings } = useMotionEnv();
  // Портал гасится системным и ручным «уменьшить движение», а также сценарием «Без движения».
  const motionOff = motionSettings.revealStyle === "none" && !motionSettings.textEnabled;
  const staticMode = reducedMotion === true || contextFallback || motionOff;
  const heroRevealReady = heroImageReady && portalVisualReady;
  useSiteLoading(
    !(heroImageReady || heroImageFailed) || !portalVisualReady,
    "Открываем пространство ВНЕ",
  );
  const staticRef = useRef(false);
  staticRef.current = staticMode;
  const onFallbackChange = useCallback(
    (fallback: boolean) => {
      if (fallback) {
        const section = sectionRef.current;
        if (section) {
          const sectionEnd = section.getBoundingClientRect().bottom + window.scrollY;
          belowOffsetRef.current = {
            sectionHeight: section.offsetHeight,
            offset:
              window.scrollY > sectionEnd - window.innerHeight ? window.scrollY - sectionEnd : null,
          };
        }
      }
      if (fallback) portalFallbackMemory.set(historyKey, true);
      else portalFallbackMemory.delete(historyKey);
      setContextFallback(fallback);
    },
    [historyKey],
  );
  const onDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      dialogScrollRef.current = window.scrollY;
      setDialogOpen(true);
      return;
    }
    setDialogOpen(false);
  }, []);
  const staticModeRef = useRef(staticMode);
  const pausedRef = useRef(dialogOpen);
  staticModeRef.current = staticMode;
  pausedRef.current = dialogOpen;

  useEffect(() => {
    if (!staticMode) return;
    setPortalVisualReady(true);
    const belowOffset = belowOffsetRef.current.offset;
    if (belowOffset === null) return;
    window.requestAnimationFrame(() => {
      const section = sectionRef.current;
      if (!section) return;
      const sectionEnd = section.getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo({ top: Math.max(0, sectionEnd + belowOffset), behavior: "instant" });
      belowOffsetRef.current = { sectionHeight: section.offsetHeight, offset: belowOffset };
    });
  }, [staticMode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () =>
      setReducedMotion(
        media.matches || document.documentElement.dataset["reduceMotion"] === "true",
      );
    const manual = new MutationObserver(updatePreference);
    manual.observe(document.documentElement, { attributeFilter: ["data-reduce-motion"] });
    let lastProgress = -1;
    updatePreference();
    media.addEventListener("change", updatePreference);
    const update = () => {
      progressRef.current =
        media.matches || staticRef.current ? 1 : getSectionProgress(sectionRef.current);
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
      // Будим рендер только при изменении целевого прогресса: ниже портала
      // прогресс остаётся 1 и прокрутка не запускает кадры.
      if (progressRef.current !== lastProgress) {
        lastProgress = progressRef.current;
        window.dispatchEvent(new Event("portal-motion-wake"));
      }
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
      if (pausedRef.current) {
        window.requestAnimationFrame(() => {
          const root = document.documentElement;
          const previousBehavior = root.style.scrollBehavior;
          root.style.scrollBehavior = "auto";
          window.scrollTo(window.scrollX, dialogScrollRef.current);
          root.style.scrollBehavior = previousBehavior;
          update();
        });
        return;
      }
      if (media.matches || staticModeRef.current || editing()) {
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
      manual.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, []);

  const scrollStyle = {
    "--scroll-desktop": `${100 + motionConfig.scroll.desktopVh}svh`,
    "--scroll-mobile": `${100 + motionConfig.scroll.mobileVh}svh`,
    "--scroll-static": `${motionConfig.scroll.staticVh}svh`,
  } as CSSProperties;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background text-foreground">
      <SiteHeader onDialogOpenChange={onDialogOpenChange} />
      <section
        ref={sectionRef}
        id="threshold"
        className="threshold-scroll relative"
        style={scrollStyle}
        aria-labelledby="vne-title"
        data-mode={staticMode ? "static" : "interactive"}
      >
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          <GalleryBackground
            chapter="hero"
            heroRevealReady={heroRevealReady}
            onHeroImageReady={() => setHeroImageReady(true)}
            onHeroImageError={() => setHeroImageFailed(true)}
          />
          {/* 03.8-05: no-JS only — static approved emblem and a compact ~100svh hero.
              With JS, <noscript> is inert, so normal loading keeps the neutral loading state. */}
          <noscript>
            <style
              dangerouslySetInnerHTML={{
                __html:
                  ".threshold-scroll{height:auto!important}.threshold-scroll>.sticky>noscript{display:contents}.threshold-scroll>.sticky{position:relative;height:auto;min-height:100svh;display:flex;flex-direction:column}.threshold-scroll .portal-copy-layer{height:auto;order:1;width:100%;padding-top:max(14vh,6rem);padding-bottom:1.5rem}.threshold-scroll .static-portal{position:relative;inset:auto;order:2;flex:1 1 auto;height:clamp(14rem,42svh,30rem);padding-bottom:max(5.5rem,env(safe-area-inset-bottom))}[data-portal-loading],.portal-hint,.portal-progress,.portal-dock{display:none}",
              }}
            />
            <div
              className="static-portal absolute inset-x-0 bottom-[max(5rem,env(safe-area-inset-bottom))] top-[46svh] z-20 flex items-center justify-center px-4"
              aria-hidden="true"
              data-static-portal="noscript"
            >
              <img
                src="/brand/portal/portal-master.svg"
                alt=""
                className="h-full w-[min(76vw,100%)] object-contain"
              />
            </div>
          </noscript>
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
                onReady={() => setPortalVisualReady(true)}
                onProgressLabel={setProgressLabel}
              />
            )}
          </ClientOnly>
          <div className="pointer-events-none absolute inset-0 z-10 bg-atmosphere" />
          <div className="portal-copy-layer pointer-events-none relative z-30 mx-auto flex h-full max-w-[1600px] flex-col px-5 pb-[14vh] pt-[14vh] sm:px-8 sm:pt-[16vh] lg:px-12">
            <div className="portal-copy w-full max-w-[38rem] sm:w-[48vw]">
              <p className="mb-5 font-display text-xs uppercase text-muted-foreground">
                <TextScramble targetId="home.hero.eyebrow">{vneContent.eyebrow}</TextScramble>
              </p>
              <h1
                id="vne-title"
                className="font-display text-4xl leading-[1.06] sm:text-5xl lg:text-6xl"
              >
                <AnimatedText role="heading" hero delay={motionSettings.heroStagger * 0.8}>
                  {vneContent.title}
                </AnimatedText>
              </h1>
              <p className="mt-4 font-body text-base text-muted-foreground sm:text-lg">
                <AnimatedText role="body" hero delay={motionSettings.heroStagger * 1.5}>
                  {vneContent.tagline}
                </AnimatedText>
              </p>
            </div>
            <div className="portal-actions pointer-events-auto mt-6 flex flex-col items-start gap-3 sm:mt-auto sm:flex-row sm:items-center">
              <Magnetic>
                <Button asChild className="h-12 bg-cta px-6 text-cta-foreground hover:bg-cta/90">
                  <Link to="/apply" search={{ event: undefined }}>
                    {vneContent.primaryCta}
                  </Link>
                </Button>
              </Magnetic>
              <Button
                asChild
                variant="ghost"
                className="h-12 px-3 text-foreground hover:bg-muted/70"
              >
                <Link to="/events">
                  {vneContent.secondaryCta}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            {!staticMode && progressLabel === 0 && (
              <p
                className="portal-hint pointer-events-none mt-3 font-body text-xs text-muted-foreground"
                role="status"
              >
                <AnimatedText role="accent" hero delay={motionSettings.heroStagger * 2.5}>
                  Прокрути, чтобы открыть портал
                </AnimatedText>
              </p>
            )}
          </div>
          {!staticMode && (
            <div
              className="portal-progress pointer-events-none absolute bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-5 z-30 text-muted-foreground sm:right-8"
              aria-hidden="true"
            >
              <div className="vne-portal-phase" data-phase={portalPhase(progressLabel / 100).index}>
                <span>{portalPhase(progressLabel / 100).label}</span>
                <div className="vne-portal-phase-track">
                  {[0, 1, 2].map((index) => (
                    <i
                      key={index}
                      style={
                        {
                          "--phase-fill": Math.min(
                            1,
                            Math.max(
                              0,
                              (progressLabel / 100 - motionConfig.scroll.reveal[index]![0]) /
                                (motionConfig.scroll.settle[index]![1] -
                                  motionConfig.scroll.reveal[index]![0]),
                            ),
                          ),
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      <section
        id="manifesto"
        className="chapter-band flex min-h-[48svh] items-center border-t border-border bg-background px-5 py-14 sm:px-12 sm:py-18"
        aria-labelledby="manifesto-title"
      >
        <div className="mx-auto grid w-full max-w-[1280px] gap-8 lg:grid-cols-12 lg:items-center">
          <p className="font-display text-xs text-mint">
            <TextScramble targetId="home.manifesto.eyebrow">
              {vneContent.manifesto.eyebrow}
            </TextScramble>
          </p>
          {/* Один владелец эффекта: заголовок не обёрнут в Reveal, чтобы Text Roll
              не отыгрывал под прозрачным/размытым родителем. */}
          <div className="lg:col-span-6 lg:col-start-4">
            <h2
              id="manifesto-title"
              className="max-w-4xl font-display text-3xl leading-tight sm:text-5xl lg:text-6xl"
            >
              {(() => {
                const [accent, ...rest] = vneContent.manifesto.title.split(/(?<=\.)\s+/);
                return (
                  <>
                    <TextRoll>{accent ?? ""}</TextRoll>{" "}
                    {rest.length ? (
                      <AnimatedText role="heading">{rest.join(" ")}</AnimatedText>
                    ) : null}
                  </>
                );
              })()}
            </h2>
          </div>
          <div className="chapter-rule pl-6 lg:col-span-3">
            <p className="max-w-sm font-body text-base leading-relaxed text-muted-foreground">
              <TextSection>{vneContent.manifesto.body}</TextSection>
            </p>
            <Link
              to="/about"
              className="mt-7 inline-flex text-sm text-blue underline underline-offset-4"
            >
              <AnimatedText role="accent">О проекте</AnimatedText>
            </Link>
          </div>
        </div>
      </section>

      <section
        id="space"
        className="gallery-chapter relative min-h-[76svh] overflow-hidden"
        aria-labelledby="space-title"
      >
        <GalleryBackground chapter="space" />
        <div className="chapter-shade pointer-events-none absolute inset-0" />
        <div className="relative z-10 mx-auto flex min-h-[76svh] max-w-[1600px] items-end px-5 py-14 sm:px-12 sm:py-18">
          <div className="space-copy max-w-xl">
            <p className="font-display text-xs text-mint">
              <TextScramble targetId="home.space.eyebrow">{vneContent.space.eyebrow}</TextScramble>
            </p>
            <h2 id="space-title" className="mt-4 font-display text-3xl leading-tight sm:text-5xl">
              <TextScramble targetId="home.space.heading">{vneContent.space.title}</TextScramble>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-foreground/80 sm:text-lg">
              <AnimatedText role="body">{vneContent.space.body}</AnimatedText>
            </p>
            <p className="mt-3 max-w-lg text-xs leading-relaxed text-foreground/80">
              {vneContent.artworkNotice}
            </p>
            <Link
              to="/about"
              hash="space"
              className="mt-6 inline-flex text-sm text-blue underline underline-offset-4"
            >
              <AnimatedText role="accent">Образ пространства</AnimatedText>
            </Link>
          </div>
        </div>
      </section>

      <section
        id="next-night"
        className="chapter-band flex min-h-[30svh] items-center border-y border-border bg-background px-5 py-12 sm:px-12 sm:py-14"
        aria-labelledby="next-night-title"
      >
        <div className="mx-auto grid w-full max-w-[1280px] gap-10 md:grid-cols-[0.8fr_1.2fr] md:items-end">
          <div>
            <p className="font-display text-xs text-mint">
              <TextScramble targetId="home.next-night.eyebrow">
                {vneContent.nextNight.eyebrow}
              </TextScramble>
            </p>
            <p className="mt-5 text-sm text-muted-foreground">
              <AnimatedText role="body">Готовим следующую встречу.</AnimatedText>
            </p>
          </div>
          <div>
            <h2 id="next-night-title" className="font-display text-3xl leading-tight sm:text-5xl">
              <AnimatedText role="heading">{vneContent.nextNight.date}</AnimatedText>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              <AnimatedText role="body">{vneContent.nextNight.body}</AnimatedText>
            </p>
            <Link
              to="/events"
              className="mt-6 inline-flex text-sm text-blue underline underline-offset-4"
            >
              <AnimatedText role="accent">Смотреть события</AnimatedText>
            </Link>
          </div>
        </div>
      </section>

      <section
        id="belonging"
        className="gallery-chapter relative min-h-[62svh] overflow-hidden"
        aria-labelledby="belonging-title"
      >
        <GalleryBackground chapter="belonging" />
        <div className="chapter-shade pointer-events-none absolute inset-0" />
        <div className="relative z-10 mx-auto flex min-h-[62svh] max-w-[1600px] items-start px-5 py-16 sm:items-center sm:px-12">
          <div className="belonging-copy max-w-2xl">
            <p className="font-display text-xs text-mint">
              <TextScramble targetId="home.belonging.eyebrow">
                {vneContent.belonging.eyebrow}
              </TextScramble>
            </p>
            <h2
              id="belonging-title"
              className="mt-4 font-display text-3xl leading-tight sm:text-5xl"
            >
              <TextScramble targetId="home.belonging.heading">
                {vneContent.belonging.title}
              </TextScramble>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground/80 sm:text-lg">
              <AnimatedText role="body">{vneContent.belonging.body}</AnimatedText>
            </p>
            <p className="mt-5 font-display text-sm text-mint">
              <TextLoop
                items={["Музыка", "Пространство", "Люди"]}
                staticText="Музыка / Пространство / Люди"
              />
            </p>
            <div className="mt-6 flex flex-wrap gap-5 text-sm">
              <Link to="/about" hash="community" className="text-blue underline underline-offset-4">
                <AnimatedText role="accent">О сообществе</AnimatedText>
              </Link>
              <Link
                to="/faq"
                search={{ event: undefined }}
                hash="access"
                className="text-blue underline underline-offset-4"
              >
                <AnimatedText role="accent">О допуске</AnimatedText>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="invitation"
        className="gallery-chapter relative min-h-[78svh] overflow-hidden"
        aria-labelledby="invitation-title"
      >
        <GalleryBackground chapter="invitation" />
        <div className="chapter-shade pointer-events-none absolute inset-0" />
        <div className="relative z-10 mx-auto flex min-h-[78svh] max-w-[1600px] items-start px-5 py-16 sm:items-center sm:px-12">
          <div className="invitation-copy max-w-xl">
            <p className="font-display text-xs text-mint">
              <TextScramble targetId="home.invitation.eyebrow">
                {vneContent.invitation.eyebrow}
              </TextScramble>
            </p>
            <h2
              id="invitation-title"
              className="mt-4 font-display text-3xl leading-tight sm:text-5xl"
            >
              <AnimatedText role="heading">{vneContent.invitation.title}</AnimatedText>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-foreground/80 sm:text-lg">
              <AnimatedText role="body">{vneContent.invitation.body}</AnimatedText>
            </p>
            <div className="mt-8">
              <Magnetic>
                <Button asChild className="h-12 bg-cta px-6 text-cta-foreground hover:bg-cta/90">
                  <Link to="/apply" search={{ event: undefined }}>
                    <AnimatedText role="accent">Пройти анкету</AnimatedText>
                  </Link>
                </Button>
              </Magnetic>
            </div>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-foreground/80">
              {vneContent.testNotice}
            </p>
            <div className="mt-6 flex gap-5 text-sm">
              <Link
                to="/rules"
                search={{ event: undefined }}
                className="text-blue underline underline-offset-4"
              >
                <AnimatedText role="accent">Правила участия</AnimatedText>
              </Link>
              <Link
                to="/faq"
                search={{ event: undefined }}
                className="text-blue underline underline-offset-4"
              >
                <AnimatedText role="accent">FAQ</AnimatedText>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AppFooter />
      <GalleryContinuation paused={dialogOpen} />
    </main>
  );
}
