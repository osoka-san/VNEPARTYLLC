import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/app/DocumentPage";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/refunds")({
  head: () => pageMeta("Возвраты — ВНЕ", "Черновая структура будущих правил возврата.", true),
  component: () => (
    <DocumentPage title="Возвраты" description="Черновая структура будущих правил возврата." />
  ),
});
