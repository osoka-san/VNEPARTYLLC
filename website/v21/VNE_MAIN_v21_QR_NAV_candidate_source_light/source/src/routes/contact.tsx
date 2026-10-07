import { Link, createFileRoute } from "@tanstack/react-router";
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
      title="Канал связи готовится"
      intro="Контакты команды пока не объявлены."
      density="compact"
    >
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <StatusBadge>Контакты готовятся</StatusBadge>
        <InView className="mt-10 border-y border-border py-8">
          <p className="max-w-[60ch] font-display text-xl leading-relaxed sm:text-2xl">
            Есть вопрос о ВНЕ?
          </p>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-muted-foreground">
            Ответы об анкете, кабинете и участии собраны в{" "}
            <Link
              to="/faq"
              search={{ event: undefined }}
              className="text-blue underline underline-offset-4"
            >
              вопросах и ответах
            </Link>
            .
          </p>
        </InView>
        <InView subtle className="mt-8 leading-relaxed text-muted-foreground">
          Подтверждённый способ связи появится здесь. До этого отправить сообщение команде с этой
          страницы нельзя.
        </InView>
      </section>
    </PageShell>
  );
}
