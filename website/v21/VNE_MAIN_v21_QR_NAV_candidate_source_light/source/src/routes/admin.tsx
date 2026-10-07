import { Link, createFileRoute } from "@tanstack/react-router";
import { AccountsPanel } from "@/components/admin/AccountsPanel";
import { WorkspaceOverview, AuditPanel, DraftsPanel } from "@/components/admin/WorkspacePanels";
import { UnavailableBody } from "@/components/admin/UnavailableSection";
import { useSiteAccess } from "@/lib/site-admin";
import { PageShell } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/EventCard";
import { MotionControlPanel } from "@/components/admin/MotionControlPanel";
import { pageMeta } from "@/lib/seo";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { adminSection, type AdminSection } from "@/lib/admin-navigation";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { AppearanceOnlyNotice, StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { MembershipRequestsPanel } from "@/components/admin/MembershipRequestsPanel";
import { SiteRequestsPanel } from "@/components/admin/SiteRequestsPanel";
import { TeamPanel } from "@/components/admin/TeamPanel";
import { SectionsPanel } from "@/components/admin/SectionsPanel";
import { MediaPanel } from "@/components/admin/MediaPanel";
import { OperationsPanel } from "@/components/admin/OperationsPanel";

export const Route = createFileRoute("/admin")({
  headers: privateRouteHeaders,
  validateSearch: (search: Record<string, unknown>): { section?: AdminSection } =>
    search["section"] ? { section: adminSection(search["section"]) } : {},
  // Серверный guard: при подключённом бэкенде нужен вход, aal2 и актуальное назначение.
  loader: async () =>
    enforceStaff((await getStaffAccess({ data: { area: "admin" } })).decision, "/admin"),
  head: () =>
    pageMeta("Панель управления — ВНЕ", "Персональный доступ к управлению сайтом ВНЕ.", true),
  component: AdminPage,
});

function AdminPage() {
  const decision = Route.useLoaderData();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / управление" />;
  return <AdminPanel appearanceOnly={decision === "unconfigured"} />;
}

function AdminPanel({ appearanceOnly }: { appearanceOnly: boolean }) {
  const section = Route.useSearch().section ?? "overview";
  const access = useSiteAccess();
  return (
    <PageShell
      eyebrow="ВНЕ / управление"
      title="Панель управления"
      intro="Сайт, коллекция и команда — в одном пространстве."
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="aw-mode-notice">
          {access.actor?.role === "reviewer" &&
          !access.can("qr.write") &&
          !access.can("content.write") &&
          !access.can("accounts.manage")
            ? "Тестовый просмотр · можно изучать сайт, выбирать QR и примерять макеты. Изменения в базе доступны администратору."
            : "Персональный доступ · действия в админке сохраняются в журнале."}
        </div>
        {section === "overview" && <WorkspaceOverview />}
        {section === "accounts" && <AccountsPanel />}
        {section === "motion" && <MotionControlPanel />}
        {section === "operations" && <AuditPanel />}
        {section === "content" &&
          (appearanceOnly ? (
            <DraftsPanel />
          ) : (
            <>
              <SectionsPanel />
              <MediaPanel />
            </>
          ))}
        {section === "requests" &&
          (appearanceOnly ? <SiteRequestsPanel kind="membership" /> : <MembershipRequestsPanel />)}
        {section === "team" &&
          (appearanceOnly ? <UnavailableBody section="team" label="Команда" /> : <TeamPanel />)}
        {section === "qr-studio" && (
          <Link to="/admin/qr-studio" className="aw-button">
            Открыть QR-студию
          </Link>
        )}
        {section === "tickets" && (
          <Link to="/admin/tickets" className="aw-button">
            Открыть билеты
          </Link>
        )}
      </section>
    </PageShell>
  );
}
