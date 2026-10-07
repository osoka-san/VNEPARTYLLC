import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { PublicEvent } from "@/content/site-content";
import { TextScramble, TiltGlow } from "@/components/motion/Interactive";
import { Glow, ImageReveal } from "@/components/motion/Primitives";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { EditorialPicture } from "@/components/app/EditorialPicture";
import { AnimatedBackground } from "@/components/motion/AnimatedBackground";

/** Плашка статуса читается с первого кадра: без перебора букв и мерцания. */
export function StatusBadge({ children }: { children: string }) {
  return (
    <Glow className="border border-orange px-2 py-1 font-display text-[10px] uppercase text-orange">
      {children}
    </Glow>
  );
}

export function EventCard({ event, priority = false }: { event: PublicEvent; priority?: boolean }) {
  const { settings, reduced, finePointer } = useMotionEnv();
  const cardText = settings.textCards;
  const imageMotion = finePointer && !reduced && settings.tilt;
  return (
    <AnimatedBackground activeIndex={null} className="block">
      <TiltGlow>
        <article className="group border-t border-border p-4">
          <Link
            to="/events/$slug"
            params={{ slug: event.slug }}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <ImageReveal className="aspect-[16/10] bg-surface">
              <EditorialPicture
                src={event.image}
                avifSrcSet={event.imageAvifSrcSet}
                webpSrcSet={event.imageWebpSrcSet}
                sizes="(min-width: 1376px) 592px, (min-width: 1024px) calc((100vw - 192px) / 2), (min-width: 768px) calc((100vw - 160px) / 2), (min-width: 640px) calc(100vw - 96px), calc(100vw - 72px)"
                width={event.imageWidth}
                height={event.imageHeight}
                alt=""
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
                objectPosition={event.imagePosition}
                className={`h-full w-full ${imageMotion ? "transition-transform duration-200 group-hover:scale-[1.02]" : ""}`}
              />
            </ImageReveal>
            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  <TextScramble targetId="events.card.kicker">{event.kicker}</TextScramble>
                </p>
                <h2 className="mt-2 font-display text-xl leading-snug">
                  <AnimatedText role="heading" enabled={cardText}>
                    {event.title}
                  </AnimatedText>
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">{event.dateLabel}</p>
              </div>
              <ArrowUpRight className="mt-1 shrink-0 text-blue" aria-hidden="true" />
            </div>
            <div className="mt-4">
              <StatusBadge>Демо / не анонс</StatusBadge>
            </div>
          </Link>
        </article>
      </TiltGlow>
    </AnimatedBackground>
  );
}

export function EventFacts({ event }: { event: PublicEvent }) {
  return (
    <dl className="grid gap-px border border-border bg-border sm:grid-cols-2">
      {[
        ["Дата", event.dateLabel],
        ["Время", event.timeLabel],
        ["Часовой пояс", event.timezone],
        ["Формат", event.format],
      ].map(([term, value]) => (
        <div key={term} className="bg-surface p-4">
          <dt className="text-xs uppercase text-muted-foreground">{term}</dt>
          <dd className="mt-2 text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
