import { createFileRoute } from "@tanstack/react-router";
import { OwnerPassPage } from "@/components/admission/OwnerPassPage";
export const Route = createFileRoute("/member/pass")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: typeof search["event"] === "string" ? search["event"] : "",
    participation: typeof search["participation"] === "string" ? search["participation"] : "",
  }),
  component: OwnerPassPage,
});
