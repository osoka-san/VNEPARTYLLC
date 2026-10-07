import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  UserRound,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { PageShell } from "@/components/app/PageShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { REQUEST_STATUSES } from "@/lib/site-requests";
import {
  MemberApiError,
  memberRequest,
  MEMBER_STATUS_TEXT,
  type MemberList,
  type MemberDetail,
  type MemberProfile,
} from "@/lib/site-member";
import "./site-member.css";

const date = (v: string) =>
  new Date(v).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const errorText = (e: unknown) =>
  e instanceof MemberApiError ? e.message : "Нет связи. Действие не подтверждено. Повтори попытку.";
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="sm-error" role="alert">
      <p>{errorText(error)}</p>
      {error instanceof MemberApiError && error.code === "AUTH_REQUIRED" ? (
        <a href="/admin-login?next=%2Fmember">Войти снова</a>
      ) : (
        <Button type="button" variant="outline" onClick={retry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
export function SiteMember({ event }: { event?: string | undefined }) {
  const [tab, setTab] = useState<"requests" | "profile">("requests"),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["site-member", status, page],
    queryFn: () =>
      memberRequest<MemberList>(`?${new URLSearchParams({ status, page: String(page) })}`),
    retry: false,
    staleTime: 10000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (query.data && page > 0 && page * 20 >= query.data.total)
      setPage(Math.max(0, Math.ceil(query.data.total / 20) - 1));
  }, [query.data, page]);
  const data = query.data;
  return (
    <PageShell
      eyebrow="ВНЕ / КАБИНЕТ"
      title={data?.profile.displayName ? `Привет, ${data.profile.displayName}` : "Кабинет"}
      intro="Твои заявки, ответы и настройки профиля — в одном месте."
      density="compact"
    >
      <section className="sm-layout">
        <div className="sm-notice">
          <span>Тестовый режим</span>
          <p>
            Здесь показаны заявки, отправленные из этой учётной записи. Используй вымышленные
            данные. Одобрение в тестовой очереди не означает допуска на событие.
          </p>
        </div>
        <nav className="sm-tabs" aria-label="Разделы кабинета">
          <button
            type="button"
            aria-current={tab === "requests" ? "page" : undefined}
            onClick={() => setTab("requests")}
          >
            <FileText size={17} />
            Мои заявки
          </button>
          <button
            type="button"
            aria-current={tab === "profile" ? "page" : undefined}
            onClick={() => setTab("profile")}
          >
            <UserRound size={17} />
            Профиль и вход
          </button>
        </nav>
        {query.isPending && (
          <p role="status" className="sm-empty">
            Загружаем кабинет…
          </p>
        )}
        {query.error && <Failure error={query.error} retry={() => void query.refetch()} />}
        {data && !query.isError && (
          <>
            {tab === "requests" ? (
              <div className="sm-columns">
                <div className="sm-main">
                  <div className="sm-heading">
                    <div>
                      <p className="sm-kicker">ЛИЧНОЕ / ЗАЯВКИ</p>
                      <h2>Твой следующий шаг</h2>
                    </div>
                    <button
                      className="sm-refresh"
                      type="button"
                      disabled={query.isFetching}
                      onClick={() => void query.refetch()}
                    >
                      <RefreshCw size={16} />
                      {query.isFetching ? "Обновляем…" : "Обновить"}
                    </button>
                  </div>
                  <div className="sm-toolbar">
                    <label>
                      Статус
                      <select
                        value={status}
                        onChange={(e) => {
                          setStatus(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="">Все статусы</option>
                        {Object.entries(REQUEST_STATUSES).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Link to="/apply" search={{ event }} className="sm-primary">
                      Подать заявку <ArrowUpRight size={17} />
                    </Link>
                  </div>
                  {!data.items.length ? (
                    <div className="sm-empty">
                      <FileText size={26} aria-hidden="true" />
                      <h3>{status ? "Заявок с таким статусом нет" : "Начнём со знакомства"}</h3>
                      <p>
                        {status
                          ? "Выбери другой статус или посмотри все заявки."
                          : "Пройди анкету — после отправки она появится здесь вместе со статусом рассмотрения."}
                      </p>
                      {status && (
                        <Button variant="outline" onClick={() => setStatus("")}>
                          Показать все
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="sm-requests">
                      {data.items.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className="sm-request"
                          onClick={() => setSelected(item.id)}
                        >
                          <span className="sm-request-top">
                            <span className="sm-badge" data-status={item.status}>
                              {REQUEST_STATUSES[item.status]}
                            </span>
                            <ChevronRight size={18} aria-hidden="true" />
                          </span>
                          <strong>{item.eventTitle || "Знакомство с ВНЕ"}</strong>
                          <span className="sm-request-description">
                            {MEMBER_STATUS_TEXT[item.status]}
                          </span>
                          <span className="sm-date">{date(item.createdAt)} · МСК</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {data.total > 20 && (
                    <div className="sm-pagination">
                      <Button
                        variant="outline"
                        disabled={page === 0 || query.isFetching}
                        onClick={() => setPage(page - 1)}
                      >
                        Назад
                      </Button>
                      <span>
                        Страница {page + 1} из {Math.ceil(data.total / 20)}
                      </span>
                      <Button
                        variant="outline"
                        disabled={(page + 1) * 20 >= data.total || query.isFetching}
                        onClick={() => setPage(page + 1)}
                      >
                        Далее
                      </Button>
                    </div>
                  )}
                  <p className="sm-footnote">
                    Статусы обновляются каждые 30 секунд, пока открыт кабинет. Время указано по
                    Москве.
                  </p>
                </div>
                <aside className="sm-aside">
                  <ShieldCheck size={23} aria-hidden="true" />
                  <h3>Что дальше</h3>
                  <p>
                    Решение по заявке появится в её карточке. Если понадобятся дополнительные
                    сведения, здесь можно отправить уточнение.
                  </p>
                  <dl>
                    <div>
                      <dt>Участие</dt>
                      <dd>Определяется отдельно для каждого события</dd>
                    </div>
                    <div>
                      <dt>Оплата</dt>
                      <dd>Пока недоступна</dd>
                    </div>
                    <div>
                      <dt>Пропуск</dt>
                      <dd>В этом режиме не выдаётся</dd>
                    </div>
                    <div>
                      <dt>Telegram и письма</dt>
                      <dd>Уведомления не отправляются</dd>
                    </div>
                  </dl>
                  <Link to="/events">
                    Посмотреть события <ArrowUpRight size={15} />
                  </Link>
                  <Link to="/faq" search={{ event: undefined }}>
                    Вопросы об участии <ArrowUpRight size={15} />
                  </Link>
                </aside>
              </div>
            ) : (
              <ProfileSettings profile={data.profile} refresh={() => void query.refetch()} />
            )}
          </>
        )}
        <div className="sm-session">
          <p>Заверши сеанс, если пользуешься общим устройством.</p>
          <form method="post" action="/admin-logout">
            <Button type="submit" variant="outline">
              Выйти из кабинета
            </Button>
          </form>
        </div>
        {selected && <RequestDetail id={selected} close={() => setSelected(null)} />}
      </section>
    </PageShell>
  );
}

function ProfileSettings({ profile, refresh }: { profile: MemberProfile; refresh: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(profile.displayName),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState<unknown>(null);
  const [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const sourceName = useRef(profile.displayName);
  useEffect(() => {
    if (sourceName.current !== profile.displayName) {
      if (name === sourceName.current) setName(profile.displayName);
      sourceName.current = profile.displayName;
    }
  }, [profile.displayName, name]);
  async function save(e: FormEvent, kind: "profile" | "password") {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError(null);
    try {
      const result = await memberRequest<{ profile: MemberProfile }>(
        `/${kind}`,
        kind === "profile"
          ? { displayName: name, version: profile.version }
          : { currentPassword, password, confirmPassword: confirm, version: profile.version },
      );
      client.setQueriesData<MemberList>({ queryKey: ["site-member"] }, (old) =>
        old ? { ...old, profile: result.profile } : old,
      );
      await client.invalidateQueries({ queryKey: ["site-admin-session"] });
      if (kind === "password") {
        setCurrentPassword("");
        setPassword("");
        setConfirm("");
      }
      setMessage(
        kind === "profile" ? "Имя сохранено." : "Пароль изменён. Другие сеансы завершены.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sm-profile">
      <form className="sm-card" onSubmit={(e) => void save(e, "profile")}>
        <p className="sm-kicker">ЛИЧНОЕ / ПРОФИЛЬ</p>
        <h2>Как к тебе обращаться</h2>
        <label>
          Логин
          <input value={profile.username} readOnly autoComplete="username" />
          <small>Логин выдан вместе с доступом.</small>
        </label>
        <label>
          Имя
          <input
            value={name}
            maxLength={80}
            required
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          disabled={busy || !name.trim() || name.trim() === profile.displayName}
        >
          Сохранить имя
        </Button>
      </form>
      <form className="sm-card" onSubmit={(e) => void save(e, "password")}>
        <p className="sm-kicker">БЕЗОПАСНОСТЬ / ВХОД</p>
        <h2>Сменить пароль</h2>
        <input
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          value={profile.username}
          autoComplete="username"
          readOnly
        />
        <label>
          Текущий пароль
          <input
            type="password"
            value={currentPassword}
            required
            maxLength={200}
            autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label>
          Новый пароль
          <input
            type="password"
            value={password}
            required
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <small>От 12 символов. После смены другие сеансы завершатся.</small>
        </label>
        <label>
          Повтори новый пароль
          <input
            type="password"
            value={confirm}
            required
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(confirm && confirm !== password)}
          />
        </label>
        {confirm && confirm !== password && <p className="sm-inline-error">Пароли не совпадают.</p>}
        <Button
          type="submit"
          disabled={busy || password.length < 12 || password !== confirm || !currentPassword}
        >
          Изменить пароль
        </Button>
      </form>
      {error != null && <Failure error={error} retry={refresh} />}
      <p className="sm-form-status" role="status">
        {busy ? "Сохраняем…" : message}
      </p>
    </div>
  );
}

function RequestDetail({ id, close }: { id: string; close: () => void }) {
  const client = useQueryClient(),
    query = useQuery({
      queryKey: ["site-member-detail", id],
      queryFn: () => memberRequest<MemberDetail>(`?id=${encodeURIComponent(id)}`),
      retry: false,
      staleTime: 0,
      refetchInterval: 30000,
    });
  const [reply, setReply] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState("");
  const operation = useRef<{ key: string; id: string } | null>(null);
  const data = query.data;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setError(null);
    setMessage("");
    const payload = { id, version: data.item.version, reply: reply.trim() },
      key = JSON.stringify(payload);
    if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
    try {
      await memberRequest("/reply", { ...payload, operationId: operation.current.id });
      setReply("");
      setMessage("Уточнение отправлено. Заявка снова на рассмотрении.");
      await Promise.all([client.invalidateQueries({ queryKey: ["site-member"] }), query.refetch()]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm-dialog">
        <DialogHeader>
          <DialogTitle>Твоя заявка</DialogTitle>
          <DialogDescription>Ответы, текущий статус и история рассмотрения.</DialogDescription>
        </DialogHeader>
        {query.isPending && <p role="status">Загружаем заявку…</p>}
        {query.error && <Failure error={query.error} retry={() => void query.refetch()} />}
        {data && !query.isError && (
          <>
            <div className="sm-detail-heading">
              <span className="sm-badge" data-status={data.item.status}>
                {REQUEST_STATUSES[data.item.status]}
              </span>
              <h3>{data.item.eventTitle || "Знакомство с ВНЕ"}</h3>
              <p>{MEMBER_STATUS_TEXT[data.item.status]}</p>
            </div>
            <dl className="sm-details">
              <div>
                <dt>Номер заявки</dt>
                <dd>{data.item.id}</dd>
              </div>
              <div>
                <dt>Имя</dt>
                <dd>{data.item.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{data.item.email}</dd>
              </div>
              <div>
                <dt>Telegram</dt>
                <dd>@{data.item.telegram}</dd>
              </div>
              <div>
                <dt>Отправлена</dt>
                <dd>{date(data.item.createdAt)} · МСК</dd>
              </div>
            </dl>
            <details className="sm-answers">
              <summary>Посмотреть свои ответы</summary>
              <p>{data.item.details || "Ответы не сохранены в этой заявке."}</p>
            </details>
            <section className="sm-history">
              <h3>История заявки</h3>
              <ol>
                {data.history.map((h) => (
                  <li key={h.id}>
                    <strong>
                      {h.action === "member_reply"
                        ? "Твоё уточнение отправлено"
                        : h.action === "guest_question"
                          ? "Вопрос от команды"
                          : REQUEST_STATUSES[h.toStatus]}
                    </strong>
                    <span>{date(h.createdAt)} · МСК</span>
                    {(h.reply || h.message) && <p>{h.reply || h.message}</p>}
                  </li>
                ))}
              </ol>
            </section>
            {data.item.status === "needs_info" && (
              <form className="sm-reply" onSubmit={(e) => void submit(e)}>
                <label>
                  Уточнение к заявке
                  <textarea
                    rows={4}
                    value={reply}
                    minLength={3}
                    maxLength={1000}
                    required
                    onChange={(e) => setReply(e.target.value)}
                  />
                </label>
                <small>{reply.length}/1000</small>
                <Button type="submit" disabled={busy || reply.trim().length < 3}>
                  {busy ? "Отправляем…" : "Отправить уточнение"}
                </Button>
              </form>
            )}
          </>
        )}
        {error != null && <Failure error={error} retry={() => void query.refetch()} />}
        <p role="status">{message}</p>
      </DialogContent>
    </Dialog>
  );
}
