import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listMembershipRequests,
  listRequestHistory,
  reviewMembershipRequest,
  revokeInvite,
  type HistoryDto,
  type MembershipRequestDto,
} from "@/lib/membership.functions";

const statusLabel = { pending: "Ожидает", approved: "Одобрена", rejected: "Отклонена" } as const;
const inviteLabel: Record<string, string> = {
  created: "создано",
  sent: "отправлено",
  failed: "ошибка письма",
  accepted: "принято",
  revoked: "отозвано",
  expired: "истекло",
  replaced: "заменено",
};
const actionLabel: Record<string, string> = {
  "membership.review": "Решение по заявке",
  "invite.issue": "Создано приглашение",
  "invite.sent": "Письмо отправлено",
  "invite.failed": "Ошибка отправки",
  "invite.accept": "Приглашение принято",
  "invite.revoke": "Приглашение отозвано",
};
const filters = [
  { key: "pending", label: "Ожидают" },
  { key: "approved", label: "Одобрены" },
  { key: "rejected", label: "Отклонены" },
  { key: "failed", label: "Ошибки письма" },
  { key: "all", label: "Все" },
] as const;
type FilterKey = (typeof filters)[number]["key"];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function MembershipRequestsPanel() {
  const load = useServerFn(listMembershipRequests);
  const review = useServerFn(reviewMembershipRequest);
  const revoke = useServerFn(revokeInvite);
  const history = useServerFn(listRequestHistory);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [q, setQ] = useState("");
  const [requests, setRequests] = useState<MembershipRequestDto[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  useSiteLoading(loading || pendingId !== null, "Обновляем заявки");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<{ id: string; items: HistoryDto[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await load({ data: { filter, q } }).catch(() => ({
      ok: false as const,
      requests: [],
      counts: {},
    }));
    setRequests(result.requests);
    setCounts(result.counts);
    setLoading(false);
  }, [load, filter, q]);
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(t);
  }, [refresh]);

  const run = async (key: string, id: string, action: () => Promise<{ message: string }>) => {
    if (confirm !== key) {
      setConfirm(key);
      return;
    }
    setConfirm(null);
    setPendingId(id);
    setMessage(null);
    const r = await action().catch(() => ({ message: "Сервис не ответил." }));
    setMessage(r.message);
    setPendingId(null);
    await refresh();
  };

  const showHistory = async (id: string) => {
    if (openHistory?.id === id) return setOpenHistory(null);
    const r = await history({ data: { id } }).catch(() => ({ items: [] }));
    setOpenHistory({ id, items: r.items });
  };

  return (
    <div>
      <div className="mb-6">
        <p className="font-display text-xs uppercase text-mint">Закрытая регистрация</p>
        <h2 className="mt-2 font-display text-xl">Заявки на участие</h2>
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Фильтр заявок">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="ml-2 tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </Button>
        ))}
      </div>
      <div className="mb-4 flex gap-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск: имя, email, @telegram"
          aria-label="Поиск заявок"
          className="h-11"
        />
        <Button variant="outline" className="min-h-11" onClick={() => void refresh()}>
          Обновить
        </Button>
      </div>
      <p role="status" className="mb-5 min-h-6 text-sm text-muted-foreground">
        {message}
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Загружаем заявки…</p>
      ) : !requests.length ? (
        <p className="border-y border-border py-8 text-sm text-muted-foreground">Заявок нет.</p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {requests.map((item) => {
            const busy = pendingId === item.id;
            const canInvite = item.status === "pending" || item.status === "approved";
            const canRevoke =
              item.invite && ["created", "sent", "failed"].includes(item.invite.status);
            return (
              <article key={item.id} className="py-6">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-display text-lg">{item.displayName}</h3>
                      <span className="text-xs uppercase text-mint">
                        {statusLabel[item.status]}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmt(item.createdAt)}</span>
                    </div>
                    <p className="mt-2 break-all text-sm text-muted-foreground">{item.email}</p>
                    <p className="mt-1 text-sm text-muted-foreground">@{item.telegramUsername}</p>
                    {item.eventSlug && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Интерес: {item.eventSlug}
                      </p>
                    )}
                    {item.invite && (
                      <p className="mt-2 text-xs">
                        <span className="font-mono text-blue">{item.invite.code}</span>{" "}
                        <span
                          className={item.invite.status === "failed" ? "text-orange" : "text-mint"}
                        >
                          · {inviteLabel[item.invite.status] ?? item.invite.status}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {canInvite && (
                      <Button
                        className="min-h-11"
                        disabled={busy}
                        onClick={() =>
                          void run(`a:${item.id}`, item.id, () =>
                            review({ data: { id: item.id, decision: "approved" } }),
                          )
                        }
                      >
                        {confirm === `a:${item.id}`
                          ? "Подтвердить"
                          : item.status === "approved"
                            ? "Повторить приглашение"
                            : "Одобрить"}
                      </Button>
                    )}
                    {item.status === "pending" && (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() =>
                          void run(`r:${item.id}`, item.id, () =>
                            review({ data: { id: item.id, decision: "rejected" } }),
                          )
                        }
                      >
                        {confirm === `r:${item.id}` ? "Точно отклонить" : "Отклонить"}
                      </Button>
                    )}
                    {canRevoke && item.invite && (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => {
                          const inviteId = item.invite!.id;
                          void run(`v:${item.id}`, item.id, () =>
                            revoke({ data: { id: inviteId } }),
                          );
                        }}
                      >
                        {confirm === `v:${item.id}` ? "Точно отозвать" : "Отозвать"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => void showHistory(item.id)}
                    >
                      История
                    </Button>
                  </div>
                </div>
                {openHistory?.id === item.id && (
                  <ol className="mt-4 space-y-1 border-l border-border pl-4 text-xs text-muted-foreground">
                    {openHistory.items.length ? (
                      openHistory.items.map((h, i) => (
                        <li key={i}>
                          {fmt(h.at)} — {actionLabel[h.action] ?? h.action}
                          {h.result !== "ok" && ` (${h.result})`}
                        </li>
                      ))
                    ) : (
                      <li>Записей пока нет.</li>
                    )}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
