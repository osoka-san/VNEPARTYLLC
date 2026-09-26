import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/PageShell";
import { ErrorState } from "@/components/app/States";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/c/$code")({
  head: () => pageMeta("Карта недоступна — ВНЕ", "Служебная страница будущей карты участия.", true),
  component: CodePage,
});
function CodePage() {
  return (
    <PageShell
      eyebrow="ВНЕ / карта"
      title="Карта участия ещё не работает"
      intro="Код из адреса не проверяется и не раскрывает владельца."
      density="compact"
    >
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <ErrorState
          title="Карта недоступна"
          body="Эта ссылка зарезервирована для будущего этапа. Карта не является подтверждением допуска."
        />
      </section>
    </PageShell>
  );
}
