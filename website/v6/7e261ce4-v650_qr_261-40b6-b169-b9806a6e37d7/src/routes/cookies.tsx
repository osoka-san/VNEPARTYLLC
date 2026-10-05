import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/app/DocumentPage";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/cookies")({
  head: () =>
    pageMeta(
      "Файлы cookie — ВНЕ",
      "Черновая структура уведомления о технических настройках сайта.",
      true,
    ),
  component: () => (
    <DocumentPage
      title="Файлы cookie"
      description="Черновая структура уведомления о технических настройках сайта."
    />
  ),
});
