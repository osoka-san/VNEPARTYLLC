import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { AppearanceOnlyNotice, StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import {
  getTicket,
  getTicketServiceStatus,
  issueTicket,
  revokeTicket,
} from "@/lib/tickets/tickets.functions";
import {
  TicketAdminPanel,
  type ApiRequest,
  type IssuedResult,
} from "@/components/tickets/TicketAdminPanel";
import PassView, { DesignSheet } from "@/components/tickets/PassView";
import { makeDemoPass } from "@/components/tickets/ticket-designs";
import type { PassAccess } from "@/components/tickets/types";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/admin_/tickets")({
  headers: () => ({ ...privateRouteHeaders(), "Referrer-Policy": "no-referrer" }),
  loader: async () => {
    const decision = enforceStaff(
      (await getStaffAccess({ data: { area: "admin" } })).decision,
      "/admin",
    );
    if (decision !== "allowed") return { decision, issueEnabled: false };
    const { issueEnabled } = await getTicketServiceStatus();
    return { decision, issueEnabled };
  },
  head: () =>
    pageMeta("Билеты — управление ВНЕ", "Ручная выдача индивидуальных пропусков ВНЕ.", true),
  component: TicketsPage,
});

function TicketsPage() {
  const { decision, issueEnabled } = Route.useLoaderData();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / билеты" />;
  const appearanceOnly = decision !== "allowed";
  return (
    <PageShell
      eyebrow="ВНЕ / билеты"
      title="Индивидуальные пропуски"
      intro="Ручная выдача и дизайн-просмотр четырёх типов карт."
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] space-y-10 px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <Link to="/admin" className="text-blue underline">
          ← Панель управления
        </Link>
        {appearanceOnly ? (
          <>
            <AppearanceOnlyNotice>
              Тестовая среда не подключена: доступен только дизайн-просмотр на синтетических данных.
              Выдачи нет, прав нет.
            </AppearanceOnlyNotice>
            <DesignPreview />
          </>
        ) : (
          <StaffTickets issueEnabled={issueEnabled} />
        )}
      </section>
    </PageShell>
  );
}

function StaffTickets({ issueEnabled }: { issueEnabled: boolean }) {
  const issue = useServerFn(issueTicket);
  const get = useServerFn(getTicket);
  const revoke = useServerFn(revokeTicket);
  const [access, setAccess] = useState<PassAccess>("GENERAL");
  const [lastPath, setLastPath] = useState<string | null>(null);
  const apiRequest: ApiRequest = async (path, body, _key, requestId) => {
    const r =
      path === "/api/admin/issue"
        ? await issue({ data: { payload: body, idempotencyKey: requestId } })
        : path === "/api/admin/get"
          ? await get({ data: { id: body["id"] } })
          : path === "/api/admin/revoke"
            ? await revoke({ data: { id: body["id"], reason: body["reason"] } })
            : { ok: false as const, error: "invalid_input" };
    if (!r.ok) throw new Error(r.error);
    // Ссылка выдаётся только при выдаче; при обновлении статуса сохраняем её в памяти вкладки.
    const passPath = r.result.passPath ?? lastPath;
    if (r.result.passPath) setLastPath(r.result.passPath);
    return { ...r.result, passPath } satisfies IssuedResult;
  };
  return (
    <>
      <TicketAdminPanel
        apiRequest={apiRequest}
        requireKey={false}
        issueEnabled={issueEnabled}
        onAccessChange={setAccess}
      />
      <div>
        <h2 className="mb-4 font-display text-sm uppercase tracking-wide">
          Предпросмотр карточки · синтетические данные
        </h2>
        <PassView key={access} pass={makeDemoPass(access)} preview />
      </div>
      <DesignPreview />
    </>
  );
}

function DesignPreview() {
  return (
    <div>
      <h2 className="mb-4 font-display text-sm uppercase tracking-wide">
        Дизайн четырёх типов · образец, не для входа
      </h2>
      <DesignSheet />
    </div>
  );
}
