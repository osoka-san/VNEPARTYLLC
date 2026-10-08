import { createFileRoute } from "@tanstack/react-router";
import { AdmissionScanner } from "@/components/admission/AdmissionScanner";
import { TimedQaScanner } from "@/components/admission/TimedQaScanner";
export const Route = createFileRoute("/scan")({
  validateSearch: (search: Record<string, unknown>): { qa?: "timed" } =>
    search["qa"] === "timed" ? { qa: "timed" } : {},
  component: ScannerRoute,
});
function ScannerRoute() {
  const { qa } = Route.useSearch();
  return qa === "timed" ? <TimedQaScanner /> : <AdmissionScanner />;
}
