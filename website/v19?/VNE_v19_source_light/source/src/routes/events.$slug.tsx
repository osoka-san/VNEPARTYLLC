import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EventFacts, StatusBadge } from "@/components/app/EventCard";
import { ErrorState } from "@/components/app/States";
import { PageShell, SectionHeading } from "@/components/app/PageShell";
import { getPublicEvent } from "@/content/site-content";
import { pageMeta } from "@/lib/seo";
import { ImageReveal } from "@/components/motion/Primitives";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { EditorialPicture } from "@/components/app/EditorialPicture";
import { EventBackground } from "@/components/motion/EventBackground";

export const Route = createFileRoute("/events/$slug")({
  // 03.8-09: unknown slug → real not-found (HTTP 404 on SSR) with noindex meta.
  loader: ({ params }) => {
    const event = getPublicEvent(params.slug);
    if (!event) throw notFound();
    return { title: event.title, summary: event.summary };
  },
  head: ({ loaderData }) =>
    loaderData
      ? pageMeta(`${loaderData.title} — ВНЕ`, loaderData.summary)
      : pageMeta("Событие не найдено — ВНЕ", "Такого события нет среди опубликованных.", true),
  notFoundComponent: EventNotFound,
  component: EventPage,
});
function EventNotFound() {
  return (
    <PageShell
      eyebrow="ВНЕ / событие"
      title="Событие недоступно"
      intro="Ссылка не соответствует опубликованному событию."
      density="compact"
    >
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <ErrorState
          title="Событие не найдено"
          body="Ссылка не соответствует опубликованному событию."
        />
      </section>
    </PageShell>
  );
}

function EventPage() {
  const { slug } = Route.useParams();
  const event = getPublicEvent(slug);
  if (!event) return <EventNotFound />;
  return (
    <PageShell
      eyebrow="ВНЕ / событие"
      scrambleEyebrow="event.page.eyebrow"
      title={event.title}
      intro={event.summary}
      density="editorial"
      background={<EventBackground slug={event.slug} />}
    >
      <section className="mx-auto max-w-[1376px] px-5 py-12 sm:px-8 sm:py-18 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.7fr)] lg:items-start">
          <div>
            <ImageReveal className="aspect-[16/10] bg-surface">
              <EditorialPicture
                src={event.image}
                avifSrcSet={event.imageAvifSrcSet}
                webpSrcSet={event.imageWebpSrcSet}
                sizes="(min-width: 1376px) 840px, (min-width: 1050px) calc((100vw - 144px) * 0.681818), (min-width: 1024px) calc(100vw - 432px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                width={event.imageWidth}
                height={event.imageHeight}
                alt=""
                loading="eager"
                fetchPriority="high"
                objectPosition={event.imagePosition}
                className="h-full w-full"
              />
            </ImageReveal>
            <div className="mt-10">
              <EventFacts event={event} />
            </div>
            <section className="mt-14">
              <SectionHeading
                eyebrow="Программа"
                title="Последовательность готовится"
                scrambleEyebrow="event.program.eyebrow"
              />
              <ul className="mt-7 divide-y divide-border border-y border-border">
                {event.program.map((item) => (
                  <li key={item} className="py-4 text-muted-foreground">
                    <AnimatedText role="body">{item}</AnimatedText>
                  </li>
                ))}
              </ul>
            </section>
            <section className="mt-14">
              <SectionHeading
                eyebrow="Условия"
                scrambleEyebrow="event.conditions.eyebrow"
                title="Участие не подтверждено"
                body="Запрос на членство и заявка на событие — разные шаги. Адрес, порядок оплаты и условия допуска пока не опубликованы."
              />
              <div className="mt-6 flex gap-4">
                <Link
                  to="/faq"
                  search={{ event: slug }}
                  hash="access"
                  className="text-blue underline underline-offset-4"
                >
                  <AnimatedText role="accent">О допуске</AnimatedText>
                </Link>
                <Link
                  to="/rules"
                  search={{ event: slug }}
                  className="text-blue underline underline-offset-4"
                >
                  <AnimatedText role="accent">Правила</AnimatedText>
                </Link>
              </div>
            </section>
          </div>
          <aside className="border-t-2 border-orange bg-surface p-6 lg:sticky lg:top-24">
            <StatusBadge>Демо / не анонс</StatusBadge>
            <h2 className="mt-6 font-display text-xl">
              <AnimatedText role="heading">Как попасть</AnimatedText>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Участники клуба подают заявку на событие в кабинете — после входа это событие будет
              выбрано. Заявка требует отдельного одобрения; это не оплата и не пропуск.
            </p>
            <Button asChild className="mt-7 w-full bg-cta text-cta-foreground">
              <Link to="/member" search={{ event: slug }}>
                Заявка на событие — войти
              </Link>
            </Button>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Ещё не в клубе? Начните с запроса на членство. Сейчас доступна тестовая форма; приём
              заявок и отправка приглашений откроются отдельно.
            </p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/apply" search={{ event: slug }}>
                Запросить членство
              </Link>
            </Button>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
