import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Plus,
  RefreshCw,
  Search,
  Inbox,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSiteLoading } from "@/components/loading/SiteLoading";
import { siteAdminRequest, useSiteAccess } from "@/lib/site-admin";
import {
  REQUEST_ACTIONS,
  REQUEST_STATUSES,
  REVIEW_EVENTS,
  allowedRequestActions,
  type RequestKind,
  type RequestList,
  type SiteRequest,
  type RequestHistory,
  type RequestAction,
} from "@/lib/site-requests";
import "./workspace.css";
import "./requests.css";

const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function SiteRequestsPanel({ kind }: { kind: RequestKind }) {
  const access = useSiteAccess();
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState("");
  const [event, setEvent] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const manage = access.actor?.role === "owner" || access.can("requests.manage");
  const read = manage || access.can("requests.read");
  const params = new URLSearchParams({ kind, q, status, event, page: String(page) });
  const query = useQuery({
    queryKey: ["site-requests", kind, q, status, event, page],
    queryFn: () => siteAdminRequest<RequestList>("requests?" + params),
    enabled: read,
    retry: false,
  });
  useSiteLoading(read && query.isFetching, "Загружаем очередь заявок");
  useEffect(() => {
    if (!query.data) return;
    const lastPage = Math.max(0, Math.ceil(query.data.total / query.data.pageSize) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [query.data, page]);

  return (
    <section className="aw-workspace rq-workspace" data-request-kind={kind}>
      <div className="aw-heading">
        <div>
          <div className="aw-eyebrow">ЛЮДИ / ВХОДЯЩИЕ</div>
          <h2>{kind === "membership" ? "Заявки на членство" : "Заявки на события"}</h2>
          <p>От первого интереса до взвешенного решения.</p>
        </div>
        <button className="aw-button" disabled={!manage} onClick={() => setCreating(true)}>
          <Plus size={16} />
          Добавить заявку
        </button>
      </div>
      <nav className="rq-tabs" aria-label="Тип заявок">
        <Link
          to="/admin"
          search={{ section: "requests" }}
          aria-current={kind === "membership" ? "page" : undefined}
        >
          Членство <ArrowUpRight size={14} />
        </Link>
        <Link to="/admin/applications" aria-current={kind === "event" ? "page" : undefined}>
          События <ArrowUpRight size={14} />
        </Link>
      </nav>
      <div className="rq-preview-notice">
        <span className="aw-badge">Тестовая очередь</span>
        <p>
          Заявки сохраняются в этом превью. Используйте вымышленные данные. Решения не создают
          аккаунт или пропуск; сообщения гостям пока не отправляются.
        </p>
      </div>
      {!manage && read && (
        <p className="rq-readonly">
          <LockKeyhole size={14} />
          Просмотр: решения и комментарии доступны администратору.
        </p>
      )}
      <div className="rq-counts">
        {(["submitted", "under_review", "needs_info", "approved"] as const).map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            onClick={() => {
              setStatus(status === s ? "" : s);
              setPage(0);
            }}
          >
            <strong>{query.data?.counts[s] ?? "—"}</strong>
            <span>{REQUEST_STATUSES[s]}</span>
          </button>
        ))}
      </div>
      <form
        className="rq-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draftQ.trim());
          setPage(0);
        }}
      >
        <label className="rq-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Имя, email, Telegram или ID"
            maxLength={100}
            aria-label="Поиск заявок"
          />
        </label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          aria-label="Статус заявки"
        >
          <option value="">Все статусы</option>
          {Object.entries(REQUEST_STATUSES).map(([s, label]) => (
            <option value={s} key={s}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            setPage(0);
          }}
          aria-label="Событие или интерес"
        >
          <option value="">Все события</option>
          {REVIEW_EVENTS.map((e) => (
            <option value={e.id} key={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <button className="aw-button secondary" type="submit">
          Найти
        </button>
        <button
          className="aw-icon-button"
          type="button"
          aria-label="Обновить заявки"
          disabled={!read || query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={17} />
        </button>
      </form>
      {access.error || query.error ? (
        <div className="aw-message" role="alert">
          {access.error?.message || query.error?.message}
          <button
            className="aw-button secondary"
            onClick={() => {
              void access.refetch();
              void query.refetch();
            }}
          >
            Повторить
          </button>
        </div>
      ) : access.isPending || (read && query.isPending) ? (
        <div className="aw-empty" role="status">
          Загружаем заявки…
        </div>
      ) : !read ? (
        <div className="aw-empty">Доступ к заявкам выдаётся в разделе «Учётные записи».</div>
      ) : query.data?.items.length ? (
        <>
          <p className="rq-result" role="status">
            Найдено: {query.data.total} · время МСК
          </p>
          <div className="rq-list">
            {query.data.items.map((item) => (
              <button key={item.id} className="rq-row" onClick={() => setSelected(item.id)}>
                <span className="rq-avatar" aria-hidden="true">
                  {item.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="rq-person">
                  <strong>{item.name}</strong>
                  <span>
                    {item.email} · @{item.telegram}
                  </span>
                  <small>{item.eventTitle || "Общий интерес к проекту"}</small>
                </span>
                <span className="rq-state">
                  <span className="rq-badge" data-status={item.status}>
                    {REQUEST_STATUSES[item.status]}
                  </span>
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          {query.data.total > query.data.pageSize && (
            <nav aria-label="Страницы заявок" className="rq-pagination">
              <button
                className="aw-button secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Назад
              </button>
              <span>
                {page + 1} / {Math.ceil(query.data.total / query.data.pageSize)}
              </span>
              <button
                className="aw-button secondary"
                disabled={(page + 1) * query.data.pageSize >= query.data.total}
                onClick={() => setPage(page + 1)}
              >
                Дальше
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="rq-empty">
          <Inbox size={32} strokeWidth={1.2} />
          <h3>{q || status || event ? "По этим условиям заявок нет" : "Очередь пока пуста"}</h3>
          <p>
            {q || status || event
              ? "Измените фильтры или начните новый поиск."
              : kind === "membership"
                ? "Отправьте тестовую заявку через форму на сайте или добавьте её здесь."
                : "Добавьте тестовую заявку, чтобы пройти весь цикл рассмотрения."}
          </p>
          {kind === "membership" && (
            <Link to="/apply" search={{ event: undefined }} className="aw-text-link">
              Открыть форму <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rq-dialog">
          <DialogHeader>
            <DialogTitle>Новая тестовая заявка</DialogTitle>
            <DialogDescription>
              Только вымышленные данные. Приглашения и сообщения не отправляются.
            </DialogDescription>
          </DialogHeader>
          {creating && (
            <CreateRequest
              kind={kind}
              onCreated={(id) => {
                setCreating(false);
                setSelected(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="rq-dialog">
          <DialogHeader>
            <DialogTitle>Карточка заявки</DialogTitle>
            <DialogDescription>Контакты, решение и история рассмотрения.</DialogDescription>
          </DialogHeader>
          {selected && <RequestDetails id={selected} manage={manage} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CreateRequest({
  kind,
  onCreated,
}: {
  kind: RequestKind;
  onCreated: (id: string) => void;
}) {
  const client = useQueryClient();
  const operation = useRef({ signature: "", id: "" });
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useSiteLoading(pending, "Сохраняем заявку");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const signature = JSON.stringify(values);
    if (operation.current.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const result = await siteAdminRequest<{ id: string }>("requests", {
        ...values,
        kind,
        action: "create",
        id: operation.current.id,
      });
      await client.invalidateQueries({ queryKey: ["site-requests"] });
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить заявку.");
    } finally {
      setPending(false);
    }
  };
  return (
    <form className="rq-form" onSubmit={(e) => void submit(e)}>
      <label>
        Имя
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Тестовый гость"
          autoComplete="off"
        />
      </label>
      <div className="rq-form-columns">
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            maxLength={254}
            placeholder="guest@example.com"
            autoComplete="off"
          />
        </label>
        <label>
          Telegram
          <input
            name="telegram"
            required
            minLength={5}
            maxLength={33}
            placeholder="@test_guest"
            autoComplete="off"
          />
        </label>
      </div>
      <label>
        {kind === "event" ? "Событие" : "Интерес"}
        <select name="event" required={kind === "event"}>
          <option value="">
            {kind === "event" ? "Выберите событие" : "Общий интерес к проекту"}
          </option>
          {REVIEW_EVENTS.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Подробности
        <textarea
          name="details"
          maxLength={2000}
          rows={3}
          placeholder="Контекст заявки для команды"
        />
      </label>
      {error && (
        <p role="alert" className="aw-message">
          {error}
        </p>
      )}
      <button disabled={pending} className="aw-button" type="submit">
        {pending ? "Сохраняем…" : "Сохранить заявку"}
      </button>
    </form>
  );
}

function RequestDetails({ id, manage }: { id: string; manage: boolean }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["site-requests", "detail", id],
    queryFn: () =>
      siteAdminRequest<{ item: SiteRequest; history: RequestHistory[] }>(
        "requests?id=" + encodeURIComponent(id),
      ),
    retry: false,
  });
  const [note, setNote] = useState(""),
    [guestMessage, setGuestMessage] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const operation = useRef({ signature: "", id: "" });
  useSiteLoading(pending, "Обновляем заявку");
  const item = query.data?.item;
  const act = async (action: RequestAction) => {
    if (!item || !manage || pending) return;
    const payload = {
      id,
      version: item.version,
      action,
      note,
      ...(action === "request_info" ? { guestMessage } : {}),
    };
    const signature = JSON.stringify(payload);
    if (operation.current.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setPending(true);
    setMessage("");
    try {
      await siteAdminRequest("requests", { ...payload, operationId: operation.current.id });
      setNote("");
      setGuestMessage("");
      setMessage("Изменение сохранено в истории.");
      await client.invalidateQueries({ queryKey: ["site-requests"] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось изменить заявку.");
      await query.refetch();
    } finally {
      setPending(false);
    }
  };
  if (query.error)
    return (
      <div role="alert" className="aw-message">
        {query.error.message}
        <button className="aw-button secondary" onClick={() => void query.refetch()}>
          Повторить
        </button>
      </div>
    );
  if (!item) return <p role="status">Открываем карточку…</p>;
  return (
    <div className="rq-detail">
      <div className="rq-detail-heading">
        <div>
          <h3>{item.name}</h3>
          <p>
            {item.kind === "membership" ? "Членство" : "Событие"} ·{" "}
            {item.eventTitle || "Общий интерес"}
          </p>
        </div>
        <span className="rq-badge" data-status={item.status}>
          {REQUEST_STATUSES[item.status]}
        </span>
      </div>
      <dl className="rq-contact">
        <div>
          <dt>Email</dt>
          <dd>{item.email}</dd>
        </div>
        <div>
          <dt>Telegram</dt>
          <dd>@{item.telegram}</dd>
        </div>
        <div>
          <dt>Получена</dt>
          <dd>
            {date(item.createdAt)} МСК · {item.source === "form" ? "Форма сайта" : "Администратор"}
          </dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd className="rq-id">{item.id}</dd>
        </div>
      </dl>
      {item.details && <p className="rq-details-text">{item.details}</p>}
      {manage ? (
        <div className="rq-form">
          <label>
            Внутренний комментарий к решению
            <textarea
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Для отказа, уточнения и пересмотра решения укажите причину"
            />
          </label>
          {item.source === "form" &&
            allowedRequestActions(item.status).includes("request_info") && (
              <label>
                Вопрос гостю — будет виден в кабинете
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={guestMessage}
                  onChange={(e) => setGuestMessage(e.target.value)}
                  placeholder="Что именно нужно уточнить? Этот текст увидит автор заявки."
                />
              </label>
            )}
          <div className="rq-actions">
            {allowedRequestActions(item.status).map((action) => (
              <button
                key={action}
                className={"aw-button " + (action === "approve" ? "" : "secondary")}
                disabled={
                  pending ||
                  (action === "request_info" &&
                    item.source === "form" &&
                    guestMessage.trim().length < 3)
                }
                onClick={() => void act(action)}
              >
                {REQUEST_ACTIONS[action].label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="rq-readonly">
          <LockKeyhole size={14} />
          Карточка доступна только для просмотра.
        </p>
      )}
      <p role="status" className="rq-feedback">
        {message}
      </p>
      <section className="rq-history">
        <h4>История рассмотрения</h4>
        <ol>
          {query.data?.history.map((h) => (
            <li key={h.id}>
              <div>
                <strong>
                  {h.action === "created"
                    ? "Заявка создана"
                    : h.action === "member_reply"
                      ? "Ответ гостя"
                      : h.action === "guest_question"
                        ? "Вопрос гостю в кабинете"
                        : REQUEST_ACTIONS[h.action as RequestAction]?.label || h.action}
                </strong>
                <time dateTime={h.createdAt}>{date(h.createdAt)} МСК</time>
              </div>
              <p>
                {h.actorName} · {REQUEST_STATUSES[h.toStatus]}
              </p>
              {h.note && <blockquote>{h.note}</blockquote>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
