import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/EventCard";
import { pageMeta } from "@/lib/seo";
import { InView } from "@/components/motion/InView";
export const Route = createFileRoute("/contact")({
  head: () => pageMeta("Связь — ВНЕ", "Страница будущих подтверждённых каналов связи проекта ВНЕ."),
  component: ContactPage,
});
function ContactPage() {
  return (
    <PageShell
      eyebrow="ВНЕ / связь"
      scrambleEyebrow="contact.page.eyebrow"
      title="Подтверждённый канал ещё не объявлен"
      intro="Канал связи появится здесь после подтверждения организатором."
      density="compact"
    >
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <StatusBadge>Контакты готовятся</StatusBadge>
        <InView className="mt-10 border-y border-border py-8">
          <p className="max-w-[60ch] font-display text-xl leading-relaxed sm:text-2xl">
            Подтверждённые контакты будут опубликованы здесь.
          </p>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-muted-foreground">
            До этого момента страница не предлагает телефон, почту или часы ответа, которыми можно
            воспользоваться.
          </p>
        </InView>
        <InView subtle className="mt-8 leading-relaxed text-muted-foreground">
          Сведения организатора, часы ответа и подтверждённый способ поддержки будут добавлены после
          редакционной проверки.
        </InView>
      </section>
    </PageShell>
  );
}
