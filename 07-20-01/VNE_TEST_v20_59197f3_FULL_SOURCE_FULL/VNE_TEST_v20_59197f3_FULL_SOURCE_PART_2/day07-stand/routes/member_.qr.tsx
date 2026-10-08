import { createFileRoute } from "@tanstack/react-router";
import { OwnerQrPage } from "@/components/admission/OwnerQrPage";
export const Route = createFileRoute("/member/qr")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: typeof search["event"] === "string" ? search["event"] : "",
    participation: typeof search["participation"] === "string" ? search["participation"] : "",
  }),
  component: OwnerQrPage,
});
