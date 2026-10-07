import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/PageShell";
import { ErrorState } from "@/components/app/States";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/i/$code")({
  head: () =>
    pageMeta("Приглашение недоступно — ВНЕ", "Служебная страница будущего приглашения.", true),
  component: CodePage,
});
function CodePage() {
  return (
    <PageShell
      eyebrow="ВНЕ / приглашение"
      title="Проверка приглашений ещё не работает"
      intro="Код из адреса не проверяется и не раскрывает владельца."
      density="compact"
    >
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <ErrorState
          title="Приглашение недоступно"
          body="Эта ссылка зарезервирована для будущего этапа. Она не подтверждает участие или проход."
        />
      </section>
    </PageShell>
  );
}
