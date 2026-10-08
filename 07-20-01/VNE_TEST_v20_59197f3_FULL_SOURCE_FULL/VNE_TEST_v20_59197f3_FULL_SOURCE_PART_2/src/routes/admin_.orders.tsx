import { useSiteLoadingAction } from "@/components/loading/SiteLoading";
import { UnavailableBody } from "@/components/admin/UnavailableSection";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { Button } from "@/components/ui/button";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { isUuid } from "@/lib/applications";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, formatInZone, formatMoney } from "@/lib/orders";
import {
  getOrderDetail,
  listOrders,
  refundSandbox,
  simulatePayment,
  type AdminOrder,
} from "@/lib/orders.functions";
import { SCENARIO_LABEL, SIMULATION_SCENARIOS } from "@/lib/payments/provider";
import { pageMeta } from "@/lib/seo";

type Search = {
  status?: string | undefined;
  event?: string | undefined;
  page?: number | undefined;
};

export const Route = createFileRoute("/admin_/orders")({
  headers: privateRouteHeaders,
  head: () => pageMeta("Заказы — управление ВНЕ", "Заказы и sandbox-платежи.", true),
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: typeof s["status"] === "string" ? s["status"] : undefined,
    event: typeof s["event"] === "string" && isUuid(s["event"]) ? s["event"] : undefined,
    page: Number(s["page"]) || undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const decision = enforceStaff(
      (await getStaffAccess({ data: { area: "admin" } })).decision,
      "/admin",
    );
    if (decision !== "allowed") return { decision, list: null };
    return { decision, list: await listOrders({ data: deps }) };
  },
  component: OrdersPage,
});

function OrdersPage() {
  const { decision, list } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  if (decision === "unconfigured")
    return (
      <PageShell eyebrow="ВНЕ / управление" title="Заказы" intro="" density="compact">
        <section className="mx-auto max-w-[900px] px-5 py-10 sm:px-8">
          <UnavailableBody section="orders" label="Заказы" />
        </section>
      </PageShell>
    );
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / заказы" />;
  if (!list?.ok)
    return (
      <PageShell
        eyebrow="ВНЕ / заказы"
        title="Не загрузилось"
        intro="Ошибка загрузки. Это не значит, что заказов нет."
        density="compact"
      >
        <div className="h-10" />
      </PageShell>
    );
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return (
    <PageShell
      eyebrow="ВНЕ / заказы"
      title="Заказы и платежи"
      intro="Sandbox: платежи симулируются, реальные деньги и чеки отсутствуют. Видимость строк ограничена вашим назначением."
      density="compact"
    >
      <div className="mx-auto max-w-[1376px] space-y-6 px-5 py-10 sm:px-8 lg:px-12">
        <p role="note" className="border-l-2 border-blue bg-surface p-4 text-sm">
          Симуляция оплаты (FakePaymentProvider, только development). Настоящий провайдер не
          подключён.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Статус"
            value={search.status ?? ""}
            onChange={(e) =>
              void navigate({
                search: { ...search, status: e.target.value || undefined, page: undefined },
              })
            }
            className="min-h-11 border border-border bg-surface px-2"
          >
            <option value="">Все статусы</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Событие"
            value={search.event ?? ""}
            onChange={(e) =>
              void navigate({
                search: { ...search, event: e.target.value || undefined, page: undefined },
              })
            }
            className="min-h-11 border border-border bg-surface px-2"
          >
            <option value="">Все события</option>
            {list.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <Link
            to="/admin/events"
            className="inline-flex min-h-11 items-center px-3 text-blue underline"
          >
            События
          </Link>
        </div>
        {list.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Заказов нет.</p>
        ) : (
          <ul className="space-y-3">
            {list.items.map((o: AdminOrder) => (
              <li key={o.id} className="border border-border bg-surface p-4">
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-wrap items-baseline justify-between gap-2 text-left"
                  aria-expanded={open === o.id}
                  onClick={() => setOpen(open === o.id ? null : o.id)}
                >
                  <span className="font-display uppercase">
                    {o.eventTitle} · {o.tierName}
                  </span>
                  <span className="text-sm text-mint">
                    {ORDER_STATUS_LABEL[o.status]} · {formatMoney(o.amountMinor, o.currency)}
                  </span>
                </button>
                <p className="text-xs text-muted-foreground">
                  {o.id.slice(0, 8)} · гость {o.userId.slice(0, 8)} ·{" "}
                  {formatInZone(o.createdAt, o.timezone)}
                  {o.reviewReason ? ` · причина: ${o.reviewReason}` : ""}
                </p>
                {open === o.id && <OrderCard order={o} />}
              </li>
            ))}
          </ul>
        )}
        <nav aria-label="Страницы" className="flex items-center gap-3">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={list.page <= 1}
            onClick={() => void navigate({ search: { ...search, page: list.page - 1 } })}
          >
            Назад
          </Button>
          <span className="text-sm">
            {list.page} / {pages}
          </span>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={list.page >= pages}
            onClick={() => void navigate({ search: { ...search, page: list.page + 1 } })}
          >
            Вперёд
          </Button>
        </nav>
      </div>
    </PageShell>
  );
}

function OrderCard({ order }: { order: AdminOrder }) {
  const router = useRouter();
  const detail = useSiteLoadingAction(useServerFn(getOrderDetail), "Открываем заказ");
  const simulate = useSiteLoadingAction(useServerFn(simulatePayment), "Обновляем заказ");
  const refund = useSiteLoadingAction(useServerFn(refundSandbox), "Обновляем заказ");
  const [d, setD] = useState<Awaited<ReturnType<typeof getOrderDetail>> | null>(null);
  const [msg, setMsg] = useState("");
  const [refundKey] = useState(() => crypto.randomUUID());
  const load = async () => setD(await detail({ data: { id: order.id } }).catch(() => null));
  useEffect(() => {
    void load();
  }, [order.id]);
  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
      <div className="flex flex-wrap gap-2">
        {SIMULATION_SCENARIOS.map((s) => (
          <Button
            key={s}
            variant="outline"
            className="min-h-11"
            onClick={async () => {
              const r = await simulate({ data: { orderId: order.id, scenario: s } }).catch(
                () => null,
              );
              setMsg(
                !r
                  ? "Сеть недоступна."
                  : r.ok
                    ? `Симуляция «${SCENARIO_LABEL[s]}»: ${r.outcomes.join(" → ")}`
                    : r.message,
              );
              await load();
              await router.invalidate();
            }}
          >
            Симулировать: {SCENARIO_LABEL[s]}
          </Button>
        ))}
        {(order.status === "paid" || order.status === "needs_review") && (
          <Button
            className="min-h-11"
            onClick={async () => {
              const r = await refund({
                data: { orderId: order.id, amountMinor: order.amountMinor, idem: refundKey },
              }).catch(() => null);
              setMsg(
                !r
                  ? "Сеть недоступна. Повтор не создаст второй возврат."
                  : r.ok
                    ? r.replayed
                      ? "Возврат уже выполнен ранее."
                      : "Sandbox-возврат выполнен."
                    : r.message,
              );
              await load();
              await router.invalidate();
            }}
          >
            Sandbox-возврат полной суммы
          </Button>
        )}
      </div>
      {msg && <p role="status">{msg}</p>}
      {d?.ok && (
        <>
          <div>
            <p className="font-display uppercase">Платежи</p>
            {d.payments.length ? (
              d.payments.map((p, i) => (
                <p key={i}>
                  {String(p["provider"])} · {String(p["environment"])} · {String(p["status"])}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">нет</p>
            )}
          </div>
          <div>
            <p className="font-display uppercase">Уведомления провайдера</p>
            {d.events.map((e, i) => (
              <p key={i}>
                {String(e["kind"])} → {String(e["outcome"])} · {String(e["provider_event_id"])}
              </p>
            ))}
          </div>
          <div>
            <p className="font-display uppercase">Журнал</p>
            {d.history.map((h, i) => (
              <p key={i}>
                {formatInZone(h.at, order.timezone)} · {h.action} · {h.result}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
