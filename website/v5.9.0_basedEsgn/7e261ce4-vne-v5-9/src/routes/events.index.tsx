import { createFileRoute } from "@tanstack/react-router";
import { EventCard } from "@/components/app/EventCard";
import { InView } from "@/components/motion/InView";
import { PageShell } from "@/components/app/PageShell";
import { publicEvents } from "@/content/site-content";
import { pageMeta } from "@/lib/seo";
import { AnimatedText } from "@/components/motion/AnimatedText";

export const Route = createFileRoute("/events/")({
  head: () =>
    pageMeta("События — ВНЕ", "Демонстрационный каталог будущих закрытых музыкальных событий ВНЕ."),
  component: EventsPage,
});
function EventsPage() {
  return (
    <PageShell
      eyebrow="ВНЕ / события"
      scrambleEyebrow="events.page.eyebrow"
      title="События"
      intro="Каркас будущей афиши. Все карточки ниже синтетические и не являются анонсами реальных событий."
      density="editorial"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-12 sm:px-8 sm:py-18 lg:px-12">
        <div className="mb-12 max-w-[65ch] border-l-2 border-orange pl-4 text-sm text-muted-foreground">
          <AnimatedText role="accent">
            Демонстрационные данные · даты, время и участие не подтверждены
          </AnimatedText>
        </div>
        <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
          {publicEvents.map((event, index) => (
            <InView key={event.slug} delay={index * 0.06}>
              <EventCard event={event} />
            </InView>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
