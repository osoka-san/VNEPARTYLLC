import { Link, createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeading } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/EventCard";
import { getPublicEvent } from "@/content/site-content";
import { pageMeta } from "@/lib/seo";
import { InView } from "@/components/motion/InView";
const parseSearch = (search: Record<string, unknown>) => ({
  event: typeof search["event"] === "string" ? search["event"] : undefined,
});
export const Route = createFileRoute("/rules")({
  validateSearch: parseSearch,
  head: () => pageMeta("Правила участия — ВНЕ", "Черновая структура будущих правил участия ВНЕ."),
  component: RulesPage,
});
function RulesPage() {
  const { event } = Route.useSearch();
  const selected = getPublicEvent(event);
  return (
    <PageShell
      eyebrow="ВНЕ / правила"
      scrambleEyebrow="rules.page.eyebrow"
      title="Правила участия"
      intro="Структура для будущих утверждённых условий. Сейчас раздел не устанавливает возрастную политику, оплату или гарантии допуска."
      density="compact"
    >
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <StatusBadge>Черновик / не утверждено</StatusBadge>
        <nav aria-label="Содержание" className="my-10 border-y border-border py-5 text-sm">
          <a href="#respect" className="mr-6 text-blue">
            Уважение
          </a>
          <a href="#access" className="mr-6 text-blue">
            Доступ
          </a>
          <a href="#changes" className="text-blue">
            Изменения
          </a>
        </nav>
        <div className="space-y-14">
          <InView>
            <section id="respect" className="scroll-mt-24">
              <SectionHeading title="Уважение к музыке и людям" />
              <p className="mt-5 leading-8 text-muted-foreground">
                Редакционный текст-заполнитель описывает спокойное и внимательное отношение к
                пространству. Финальные формулировки будут добавлены после утверждения.
              </p>
            </section>
          </InView>
          <InView>
            <section id="access" className="scroll-mt-24">
              <SectionHeading title="Доступ и подтверждение" />
              <p className="mt-5 leading-8 text-muted-foreground">
                Заполнение демонстрационной формы, ссылка или карта не подтверждают участие. Порядок
                решения ещё не опубликован.
              </p>
            </section>
          </InView>
          <InView>
            <section id="changes" className="scroll-mt-24">
              <SectionHeading title="Изменения" />
              <p className="mt-5 leading-8 text-muted-foreground">
                Версия, дата и владелец документа не назначены. Этот черновик должен быть заменён до
                production.
              </p>
            </section>
          </InView>
        </div>
        <Link
          to="/apply"
          search={{ event: selected?.slug }}
          className="mt-12 inline-flex text-blue underline underline-offset-4"
        >
          Вернуться к форме{selected ? `: ${selected.title}` : ""}
        </Link>
      </article>
    </PageShell>
  );
}
