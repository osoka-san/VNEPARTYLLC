import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
export const Route = createFileRoute("/admin")({ component: AdminRoute });
function AdminRoute() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pathname === "/admin" ? <AdminIndex /> : <Outlet />;
}
function AdminIndex() {
  return (
    <section>
      <h1 className="mb-5 text-3xl">Управление TEST</h1>
      <p className="mb-5">Каждый раздел отдельно проверяет текущий аккаунт, полномочия и MFA.</p>
      <ul className="space-y-3">
        <li>
          <a className="underline" href="/admin/violations">
            Нарушения
          </a>
        </li>
        <li>
          <a className="underline" href="/admin/intakes">
            Ревью общих анкет
          </a>
        </li>
        <li>
          <a className="underline" href="/admin/mfa">
            MFA ADMIN_TEST
          </a>
        </li>
        <li>
          <a className="underline" href="/admin/tickets">
            Синтетические пропуска
          </a>
        </li>
      </ul>
    </section>
  );
}
