import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/app/DocumentPage";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/privacy")({
  head: () =>
    pageMeta(
      "Политика конфиденциальности — ВНЕ",
      "Черновая структура будущей политики обработки данных.",
      true,
    ),
  component: () => (
    <DocumentPage
      title="Политика конфиденциальности"
      description="Черновая структура будущей политики обработки данных."
    />
  ),
});
