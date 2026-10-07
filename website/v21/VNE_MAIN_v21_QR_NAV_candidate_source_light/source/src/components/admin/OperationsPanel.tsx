import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listGuests, type GuestRow } from "@/lib/applications.functions";
import { STATUS_LABEL, type AppStatus } from "@/lib/applications";

const LATER = ["Заказы", "QR и проход", "Команда и роли", "Журнал действий"];
const COUNTED: AppStatus[] = ["submitted", "under_review", "needs_info", "waitlisted", "approved"];

export function OperationsPanel() {
  const fetchGuests = useServerFn(listGuests);
  const [q, setQ] = useState("");
  const [event, setEvent] = useState("");
  const query = useQuery({
    queryKey: ["admin-guests", q, event],
    queryFn: () => fetchGuests({ data: { q, event } }),
  });
  const d = query.data;
  const blocked =
    d && !d.ok
      ? d.reason === "session"
        ? "Нужен вход со вторым фактором."
        : "Не удалось загрузить данные. Попробуйте позже."
      : null;

  return (
    <div className="space-y-10">
      <section aria-labelledby="ops-01" className="border border-border bg-surface p-5 sm:p-6">
        <p className="font-display text-xs text-mint">01</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="ops-01" className="font-display text-lg">
            Заявки
          </h2>
          <Link to="/admin/applications" className="text-sm text-blue underline">
            Открыть очередь модерации →
          </Link>
        </div>
        {blocked ? (
          <p className="mt-4 text-sm text-muted-foreground">{blocked}</p>
        ) : (
          <dl className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-5">
            {COUNTED.map((s) => (
              <div key={s} className="bg-background p-4">
                <dt className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</dt>
                <dd className="mt-2 font-display text-2xl">
                  {query.isLoading ? "…" : (d?.counts[s] ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-labelledby="ops-02" className="border border-border bg-surface p-5 sm:p-6">
        <p className="font-display text-xs text-mint">02</p>
        <h2 id="ops-02" className="mt-3 font-display text-lg">
          Гости
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Гости с одобренной заявкой. Одобрение — ещё не оплата и не пропуск.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Поиск по имени или email
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-h-11 border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>
          <label className="flex min-w-60 flex-col gap-1 text-xs text-muted-foreground">
            Событие
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="min-h-11 border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">Все события</option>
              {d?.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {blocked ? (
          <p className="mt-5 text-sm text-muted-foreground">{blocked}</p>
        ) : query.isLoading ? (
          <p className="mt-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : d && d.items.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">Гостей пока нет.</p>
        ) : (
          <div className="mt-5 overflow-x-auto border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-background text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-normal">Имя</th>
                  <th className="p-3 font-normal">Email</th>
                  <th className="p-3 font-normal">Событие</th>
                  <th className="p-3 font-normal">Одобрено</th>
                </tr>
              </thead>
              <tbody>
                {d?.items.map((g: GuestRow) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="p-3">{g.displayName ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{g.contactEmail ?? "—"}</td>
                    <td className="p-3">{g.eventTitle}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(g.approvedAt).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {LATER.map((area, i) => (
          <div className="min-h-32 bg-surface p-5" key={area}>
            <p className="font-display text-xs text-mint">{String(i + 3).padStart(2, "0")}</p>
            <h2 className="mt-4 font-display text-base">{area}</h2>
            <p className="mt-3 text-sm text-muted-foreground">Состояние готовится.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
