import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/app/DocumentPage";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/terms")({
  head: () =>
    pageMeta(
      "Условия использования — ВНЕ",
      "Черновая структура условий использования сайта.",
      true,
    ),
  component: () => (
    <DocumentPage
      title="Условия использования"
      description="Черновая структура условий использования сайта."
    />
  ),
});
