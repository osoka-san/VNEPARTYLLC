import { createFileRoute } from "@tanstack/react-router";
import { IncidentWorkspace } from "@/components/admin/IncidentWorkspace";
export const Route = createFileRoute("/admin/violations")({
  head: () => ({
    meta: [{ title: "Нарушения · ВНЕ TEST" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: IncidentWorkspace,
});
