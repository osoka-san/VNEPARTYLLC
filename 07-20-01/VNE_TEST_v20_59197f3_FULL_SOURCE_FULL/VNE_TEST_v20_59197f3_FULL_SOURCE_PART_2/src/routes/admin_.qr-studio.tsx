import { Link, createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { parsePreviewSearch } from "@/lib/qr-studio/catalog";
import { QrStudio } from "@/components/qr-studio/QrStudio";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/admin_/qr-studio")({
  validateSearch: parsePreviewSearch,
  headers: () => ({ ...privateRouteHeaders(), "Referrer-Policy": "no-referrer" }),
  loader: async () =>
    enforceStaff((await getStaffAccess({ data: { area: "admin" } })).decision, "/admin"),
  head: () => pageMeta("QR-студия — ВНЕ", "Лаборатория фирменных QR-кодов ВНЕ.", true),
  component: StudioPage,
});
function StudioPage() {
  const decision = Route.useLoaderData();
  const search = Route.useSearch();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / QR-студия" />;
  return (
    <PageShell
      eyebrow="ВНЕ / мастерская"
      title="QR-студия"
      intro="Свой язык. В каждом коде."
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-8 sm:px-8 lg:px-12">
        <Link to="/admin" className="mb-8 inline-block text-sm text-muted-foreground underline">
          Панель управления
        </Link>
        <QrStudio
          initialDraft={search.draft}
          initialTemplate={search.template}
          initialAccess={search.access}
        />
      </section>
    </PageShell>
  );
}
