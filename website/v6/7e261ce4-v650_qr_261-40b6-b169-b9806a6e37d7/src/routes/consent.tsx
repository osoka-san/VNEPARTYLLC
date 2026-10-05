import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/app/DocumentPage";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/consent")({
  head: () =>
    pageMeta(
      "Согласие на обработку данных — ВНЕ",
      "Черновая структура будущего отдельного согласия.",
      true,
    ),
  component: () => (
    <DocumentPage
      title="Согласие на обработку данных"
      description="Черновая структура будущего отдельного согласия."
    />
  ),
});
