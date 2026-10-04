import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACTION_LABEL,
  MOD_ACTIONS,
  STATUS_LABEL,
  canTransition,
  isUuid,
  type AppStatus,
} from "@/lib/applications";
import { listQueue, moderate, type QueueItem } from "@/lib/applications.functions";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { pageMeta } from "@/lib/seo";

type Search = {
  q?: string | undefined;
  status?: string | undefined;
  event?: string | undefined;
  days?: number | undefined;
  page?: number | undefined;
};

export const Route = createFileRoute("/admin_/applications")({
  headers: privateRouteHeaders,
  head: () =>
    pageMeta("Заявки на события — ВНЕ", "Очередь модерации для назначенной команды.", true),
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s["q"] === "string" ? s["q"].slice(0, 80) : undefined,
    status: typeof s["status"] === "string" ? s["status"] : undefined,
    event: typeof s["event"] === "string" && isUuid(s["event"]) ? s["event"] : undefined,
    days: Number(s["days"]) || undefined,
    page: Number(s["page"]) || undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const decision = enforceStaff(
      (await getStaffAccess({ data: { area: "admin" } })).decision,
      "/admin",
    );
    if (decision !== "allowed") return { decision, queue: null };
    return { decision, queue: await listQueue({ data: deps }) };
  },
  component: QueuePage,
});

function QueuePage() {
  const { decision, queue } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / заявки" />;
  if (queue && !queue.ok)
    return (
      <PageShell
        eyebrow="ВНЕ / заявки"
        title={queue.reason === "session" ? "Нужен повторный вход" : "Очередь не загрузилась"}
        intro={
          queue.reason === "session"
            ? "Сессия истекла или нет подтверждения кодом приложения. Войдите снова."
            : queue.reason === "unconfigured"
              ? "Среда не подключена."
              : "Ошибка загрузки. Это не значит, что заявок нет."
        }
        density="compact"
      >
        <div role="alert" className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 lg:px-12">
          {queue.reason === "session" ? (
            <a href="/login?redirect=%2Fadmin%2Fapplications" className="text-blue underline">
              Войти
            </a>
          ) : (
            <Button variant="outline" className="min-h-11" onClick={() => void router.invalidate()}>
              Повторить
            </Button>
          )}
        </div>
      </PageShell>
    );
  if (!queue)
    return (
      <PageShell
        eyebrow="ВНЕ / заявки"
        title="Очередь недоступна"
        intro="Среда не подключена."
        density="compact"
      >
        <div className="h-10" />
      </PageShell>
    );
  const pages = Math.max(1, Math.ceil(queue.total / queue.pageSize));
  return (
    <PageShell
      eyebrow="ВНЕ / заявки"
      title="Заявки на события"
      intro="Только события, на которые вы назначены."
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] space-y-6 px-5 py-10 sm:px-8 lg:px-12">
        <Link to="/admin" className="text-sm text-blue underline">
          ← Панель
        </Link>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void navigate({
              search: {
                q: String(f.get("q") ?? "") || undefined,
                status: String(f.get("status") ?? "") || undefined,
                event: String(f.get("event") ?? "") || undefined,
                days: Number(f.get("days")) || undefined,
                page: undefined,
              },
            });
          }}
        >
          <Input
            name="q"
            defaultValue={search.q}
            placeholder="Имя или email"
            className="min-h-11 w-56"
            aria-label="Поиск"
          />
          <select
            name="status"
            defaultValue={search.status ?? ""}
            aria-label="Статус"
            className="min-h-11 border border-border bg-surface px-3"
          >
            <option value="">Все статусы</option>
            {(Object.keys(STATUS_LABEL) as AppStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            name="event"
            defaultValue={search.event ?? ""}
            aria-label="Событие"
            className="min-h-11 max-w-64 border border-border bg-surface px-3"
          >
            <option value="">Все мои события</option>
            {queue.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <select
            name="days"
            defaultValue={String(search.days ?? "")}
            aria-label="Период"
            className="min-h-11 border border-border bg-surface px-3"
          >
            <option value="">За всё время</option>
            <option value="1">Сутки</option>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
          </select>
          <Button type="submit" className="min-h-11">
            Найти
          </Button>
        </form>
        <p className="text-sm text-muted-foreground" role="status">
          Найдено: {queue.total}
        </p>
        <ul className="space-y-3">
          {queue.items.length === 0 && (
            <li className="text-sm text-muted-foreground">Заявок по этим условиям нет.</li>
          )}
          {queue.items.map((i: QueueItem) => (
            <QueueCard key={i.id} item={i} />
          ))}
        </ul>
        {pages > 1 && (
          <nav className="flex gap-3" aria-label="Страницы">
            <Button
              variant="outline"
              disabled={queue.page === 0}
              onClick={() => navigate({ search: { ...search, page: queue.page - 1 } })}
            >
              Назад
            </Button>
            <span className="self-center text-sm">
              {queue.page + 1} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={queue.page + 1 >= pages}
              onClick={() => navigate({ search: { ...search, page: queue.page + 1 } })}
            >
              Дальше
            </Button>
          </nav>
        )}
      </section>
    </PageShell>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const router = useRouter();
  const run = useServerFn(moderate);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <li className="border border-border bg-surface p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <span>
          {item.displayName ?? "—"} ·{" "}
          <span className="text-muted-foreground">{item.contactEmail}</span>
        </span>
        <span className="text-sm text-mint">{STATUS_LABEL[item.status]}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.eventTitle} · {new Date(item.createdAt).toLocaleString("ru-RU")} · версия{" "}
        {item.version}
      </p>
      {item.guestReply && <p className="mt-2 text-sm">Ответ гостя: {item.guestReply}</p>}
      {canTransition(item.status, "request_info") && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Вопрос гостю (для уточнения)"
          className="mt-3 min-h-11"
          aria-label="Вопрос гостю"
        />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {MOD_ACTIONS.filter((a) => canTransition(item.status, a)).map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === "approve" ? "default" : "outline"}
            disabled={pending}
            className="min-h-10"
            onClick={async () => {
              setPending(true);
              try {
                const r = await run({
                  data: { id: item.id, action: a, version: item.version, message: note },
                });
                setMsg(r.ok ? "Сохранено." : r.message);
                await router.invalidate();
              } catch {
                setMsg("Нет связи.");
              } finally {
                setPending(false);
              }
            }}
          >
            {ACTION_LABEL[a]}
          </Button>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 text-sm">
        {msg}
      </p>
    </li>
  );
}
