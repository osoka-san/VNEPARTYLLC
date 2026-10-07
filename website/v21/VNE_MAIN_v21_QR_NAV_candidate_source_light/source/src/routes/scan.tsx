import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import TicketScanner from "@/components/tickets/TicketScanner";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/scan")({
  headers: privateRouteHeaders,
  head: () => pageMeta("Сканер — ВНЕ", "Контроль входа на мероприятие.", true),
  loader: async () =>
    enforceStaff((await getStaffAccess({ data: { area: "scan" } })).decision, "/scan"),
  component: ScanPage,
});
function ScanPage() {
  const decision = Route.useLoaderData();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / вход" />;
  return (
    <PageShell eyebrow="ВНЕ / вход" title="Сканер билетов" intro="" density="compact">
      <TicketScanner enabled={decision === "allowed"} />
    </PageShell>
  );
}
