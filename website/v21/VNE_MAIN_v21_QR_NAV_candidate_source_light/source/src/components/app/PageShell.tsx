import { useRouterState } from "@tanstack/react-router";
import { isAdminPath } from "@/lib/admin-navigation";
import { createContext, useContext, type ReactNode } from "react";

/** 03.8-10: legal pages render every heading immediately, without decorative text motion. */
const QuietContext = createContext(false);
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { TextScramble } from "@/components/motion/Interactive";
import type { ScrambleTargetId } from "@/lib/text-scramble";

export function PageShell({
  eyebrow,
  title,
  intro,
  density = "default",
  headerMedia,
  background,
  quiet = false,
  scrambleEyebrow,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  density?: "default" | "compact" | "editorial";
  headerMedia?: ReactNode;
  background?: ReactNode;
  quiet?: boolean;
  scrambleEyebrow?: ScrambleTargetId;
  children: ReactNode;
}) {
  const isAdmin = useRouterState({ select: (s) => isAdminPath(s.location.pathname) });
  const headerSpacing =
    density === "compact"
      ? "py-10 sm:py-14"
      : density === "editorial"
        ? "py-12 sm:py-18"
        : "py-14 sm:py-20";
  const titleSize = density === "compact" ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl";
  return (
    <div
      className={`min-h-screen bg-background text-foreground${background ? " relative isolate" : ""}`}
    >
      {background}
      {!isAdmin && <AppHeader />}
      <main
        id="main-content"
        tabIndex={-1}
        className="pt-16 outline-none"
        style={
          isAdmin ? { paddingTop: "calc(var(--vne-admin-nav-height, 210px) + 26px)" } : undefined
        }
      >
        <header className={`border-b border-border px-5 sm:px-8 lg:px-12 ${headerSpacing}`}>
          <div className="mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-12 lg:items-end">
            <div className={headerMedia ? "lg:col-span-7" : "lg:col-span-9"}>
              <p className="font-display text-xs uppercase text-mint">
                {quiet ? (
                  eyebrow
                ) : scrambleEyebrow ? (
                  <TextScramble targetId={scrambleEyebrow}>{eyebrow}</TextScramble>
                ) : (
                  <AnimatedText role="accent">{eyebrow}</AnimatedText>
                )}
              </p>
              <h1
                className={`mt-4 max-w-5xl [overflow-wrap:anywhere] font-display leading-[1.08] ${titleSize}`}
              >
                {quiet ? title : <AnimatedText role="heading">{title}</AnimatedText>}
              </h1>
              <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
                {quiet ? intro : <AnimatedText role="body">{intro}</AnimatedText>}
              </p>
            </div>
            {headerMedia && <div className="lg:col-span-5">{headerMedia}</div>}
          </div>
        </header>
        <QuietContext.Provider value={quiet}>{children}</QuietContext.Provider>
      </main>
      <AppFooter />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  scrambleEyebrow,
  scrambleTitle,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  scrambleEyebrow?: ScrambleTargetId;
  scrambleTitle?: ScrambleTargetId;
}) {
  const quiet = useContext(QuietContext);
  return (
    <div>
      {eyebrow && (
        <p className="font-display text-xs uppercase text-mint">
          {scrambleEyebrow && !quiet ? (
            <TextScramble targetId={scrambleEyebrow}>{eyebrow}</TextScramble>
          ) : (
            <AnimatedText role="accent" enabled={!quiet}>
              {eyebrow}
            </AnimatedText>
          )}
        </p>
      )}
      <h2 className="mt-3 [overflow-wrap:anywhere] font-display text-2xl leading-tight sm:text-4xl">
        {scrambleTitle && !quiet ? (
          <TextScramble targetId={scrambleTitle}>{title}</TextScramble>
        ) : (
          <AnimatedText role="heading" enabled={!quiet}>
            {title}
          </AnimatedText>
        )}
      </h2>
      {body && (
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          <AnimatedText role="body" enabled={!quiet}>
            {body}
          </AnimatedText>
        </p>
      )}
    </div>
  );
}
