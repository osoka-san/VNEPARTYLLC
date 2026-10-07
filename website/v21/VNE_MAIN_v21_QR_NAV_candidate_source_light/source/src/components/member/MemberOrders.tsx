import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL, formatInZone, formatMoney } from "@/lib/orders";
import {
  cancelMyOrder,
  reserveSeat,
  type MyOrder,
  type PurchaseOption,
} from "@/lib/orders.functions";

type Props = {
  state: "ok" | "error" | "unconfigured" | "signin";
  orders: MyOrder[];
  options: PurchaseOption[];
  simulated: boolean;
};

export function MemberOrders({ state, orders, options, simulated }: Props) {
  const router = useRouter();
  const reserve = useServerFn(reserveSeat);
  const cancel = useServerFn(cancelMyOrder);
  const [busy, setBusy] = useState(false);
  useSiteLoading(busy, "Обновляем заказ");
  const [msg, setMsg] = useState("");
  // один ключ операции на выбор: повтор после сбоя сети вернёт тот же заказ
  const [idem, setIdem] = useState<Record<string, string>>({});

  async function onReserve(eventId: string, tierId: string) {
    const k = `${eventId}:${tierId}`;
    const key = idem[k] ?? crypto.randomUUID();
    setIdem((s) => ({ ...s, [k]: key }));
    setBusy(true);
    setMsg("");
    const r = await reserve({ data: { eventId, tierId, idem: key } }).catch(() => null);
    setBusy(false);
    if (!r) return setMsg("Сеть недоступна. Повторите — резерв не будет создан дважды.");
    if (!r.ok) return setMsg(r.message);
    setMsg(r.replayed ? "Резерв уже был создан ранее." : "Место зарезервировано.");
    await router.invalidate();
  }
  async function onCancel(orderId: string) {
    setBusy(true);
    const r = await cancel({ data: { orderId } }).catch(() => null);
    setBusy(false);
    setMsg(!r ? "Сеть недоступна." : r.ok ? "Резерв отменён." : r.message);
    await router.invalidate();
  }

  return (
    <section aria-labelledby="orders-h" className="mt-12 border-t border-border pt-10">
      <h2 id="orders-h" className="font-display text-xl uppercase">
        Мои события и заказы
      </h2>
      {simulated && (
        <p
          role="note"
          className="mt-4 border-l-2 border-blue bg-surface p-4 text-sm text-muted-foreground"
        >
          Sandbox-симуляция: реальные платежи не проводятся, чеки не выдаются. Оплату в тестовой
          среде подтверждает оператор; возврат со страницы оплаты не считается доказательством.
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="mt-4 text-sm text-accent">
          Заказы не загрузились. Это не значит, что их нет.
        </p>
      )}
      {msg && (
        <p role="status" className="mt-4 text-sm">
          {msg}
        </p>
      )}
      {options.length > 0 && (
        <div className="mt-6 space-y-4">
          {options.map((o) => (
            <div key={o.eventId} className="border border-border bg-surface p-5">
              <p className="font-display uppercase">{o.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatInZone(o.startsAt, o.timezone)} · продажи до{" "}
                {formatInZone(o.salesCloseAt, o.timezone)} ({o.timezone})
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {o.tiers.length === 0 && (
                  <p className="text-sm text-muted-foreground">Тарифы ещё не открыты.</p>
                )}
                {o.tiers.map((t) => (
                  <Button
                    key={t.id}
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void onReserve(o.eventId, t.id)}
                  >
                    Зарезервировать · {t.name} · {formatMoney(t.amountMinor, t.currency)}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {orders.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Заказов пока нет.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="border border-border p-5" data-order-status={o.status}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display uppercase">{o.eventTitle}</p>
                <span className="text-sm text-mint">{ORDER_STATUS_LABEL[o.status]}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {o.tierName} · {formatMoney(o.amountMinor, o.currency)}
                {o.environment === "sandbox" ? " · sandbox" : ""}
              </p>
              {o.status === "awaiting_payment" && (
                <>
                  <p className="mt-2 text-sm">
                    Резерв действует до {formatInZone(o.reservationExpiresAt, o.timezone)}. Ожидаем
                    подтверждение оплаты от провайдера.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 min-h-11"
                    disabled={busy}
                    onClick={() => void onCancel(o.id)}
                  >
                    Отменить резерв
                  </Button>
                </>
              )}
              {o.status === "needs_review" && (
                <p className="mt-2 text-sm">
                  Платёж на проверке у команды. Место автоматически не выдаётся.
                </p>
              )}
              {o.participation === "active" && (
                <p className="mt-2 text-sm text-mint">
                  Участие подтверждено. Пропуск появится на следующем этапе.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
