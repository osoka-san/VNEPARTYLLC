import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { getTicketServiceStatus } from "@/lib/tickets/tickets.functions";
import { parsePreviewSearch } from "@/lib/qr-studio/catalog";
import { TicketDesignPreview } from "@/components/tickets/TicketDesignPreview";
import TicketWorkspace from "@/components/tickets/TicketWorkspace";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/admin_/tickets")({
  validateSearch: parsePreviewSearch,
  headers: () => ({ ...privateRouteHeaders(), "Referrer-Policy": "no-referrer" }),
  loader: async () => {
    const decision = enforceStaff(
      (await getStaffAccess({ data: { area: "admin" } })).decision,
      "/admin",
    );
    return {
      decision,
      issueEnabled: decision === "allowed" ? (await getTicketServiceStatus()).issueEnabled : false,
    };
  },
  head: () =>
    pageMeta("Билеты — управление ВНЕ", "Выдача и управление персональными пропусками ВНЕ.", true),
  component: TicketsPage,
});
function TicketsPage() {
  const { decision, issueEnabled } = Route.useLoaderData();
  const search = Route.useSearch();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / билеты" />;
  return (
    <PageShell eyebrow="ВНЕ / управление" title="Персональные пропуски" intro="" density="compact">
      {search.view === "preview" ? (
        <section className="mx-auto max-w-[1376px] px-5 py-8 sm:px-8 lg:px-12">
          <TicketDesignPreview
            template={search.template}
            draft={search.draft}
            initialAccess={search.access}
          />
        </section>
      ) : (
        <TicketWorkspace enabled={issueEnabled} />
      )}
    </PageShell>
  );
}
