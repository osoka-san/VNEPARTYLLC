import { PageShell, SectionHeading } from "./PageShell";
import { StatusBadge } from "./EventCard";

export function DocumentPage({ title, description }: { title: string; description: string }) {
  return (
    <PageShell eyebrow="ВНЕ / документ" title={title} intro={description} density="compact" quiet>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <article>
          <div className="mb-10 flex flex-wrap items-center gap-4">
            <StatusBadge>Черновик / не утверждено</StatusBadge>
            <span className="text-sm text-muted-foreground">
              Версия: не назначена · Дата: не назначена · Владелец: не указан
            </span>
          </div>
          <div className="space-y-12">
            <section>
              <SectionHeading title="Назначение документа" />
              <p className="mt-5 leading-8 text-muted-foreground">
                Этот связный текст служит редакционным заполнителем структуры. Он не устанавливает
                права, обязанности, гарантии или порядок оказания услуг и должен быть полностью
                заменён утверждённой редакцией до публикации.
              </p>
            </section>
            <section>
              <SectionHeading title="Область применения" />
              <p className="mt-5 leading-8 text-muted-foreground">
                Будущая редакция опишет применимые процессы, стороны, сроки и способы связи. Пока
                эти сведения не подтверждены, раздел остаётся черновым и не используется для
                принятия решений.
              </p>
            </section>
            <section>
              <SectionHeading title="Изменения и вопросы" />
              <p className="mt-5 leading-8 text-muted-foreground">
                Версия, дата вступления в силу, сведения владельца и подтверждённый канал для
                вопросов будут добавлены после юридической и редакционной проверки.
              </p>
            </section>
          </div>
        </article>
      </div>
    </PageShell>
  );
}
