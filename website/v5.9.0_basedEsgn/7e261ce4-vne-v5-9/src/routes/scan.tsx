import { createFileRoute } from "@tanstack/react-router";
import { FutureShell } from "@/components/app/FutureShell";
import { privateRouteHeaders, UnavailableNotice } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/scan")({
  headers: privateRouteHeaders,
  head: () => pageMeta("Сканер — ВНЕ", "Зона сканирования для назначенной команды.", true),
  loader: async () =>
    enforceStaff((await getStaffAccess({ data: { area: "scan" } })).decision, "/scan"),
  component: ScanPage,
});

function ScanPage() {
  const decision = Route.useLoaderData();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / вход" />;
  return (
    <>
      {decision === "unconfigured" && (
        <div className="mx-auto max-w-[1376px] px-5 pt-28 sm:px-8 lg:px-12">
          <UnavailableNotice>
            Сканер недоступен: тестовая среда не подключена, права не проверяются и не выдаются.
          </UnavailableNotice>
        </div>
      )}
      <FutureShell
        eyebrow="ВНЕ / вход"
        title={
          decision === "allowed" ? "Назначение подтверждено" : "Сканирование ещё не подключено"
        }
        intro="Камера, проверка QR и решение о допуске появятся на следующих этапах."
        areas={["Назначенное событие", "Состояние камеры", "Результат проверки"]}
      />
    </>
  );
}
