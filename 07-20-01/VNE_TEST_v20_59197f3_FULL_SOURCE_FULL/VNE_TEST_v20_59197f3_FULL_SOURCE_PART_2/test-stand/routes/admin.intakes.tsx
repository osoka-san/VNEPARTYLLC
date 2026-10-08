import { createFileRoute } from "@tanstack/react-router";
import { IntakeReviewWorkspace } from "@/components/admin/IntakeReviewWorkspace";
export const Route = createFileRoute("/admin/intakes")({
  head: () => ({
    meta: [{ title: "Общие анкеты · ВНЕ TEST" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: IntakeReviewWorkspace,
});
