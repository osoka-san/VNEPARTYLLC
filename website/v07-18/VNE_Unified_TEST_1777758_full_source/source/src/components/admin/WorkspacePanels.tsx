import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowUpRight, FileText, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { siteAdminRequest, useSiteAccess, type ContentDraft } from "@/lib/site-admin";
import "./workspace.css";
const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
export function WorkspaceOverview() {
  const access = useSiteAccess();
  const stats = useQuery({
    queryKey: ["site-overview"],
    queryFn: () => siteAdminRequest<{ counts: Record<string, number> }>("overview"),
    retry: false,
  });
  return (
    <section className="aw-workspace">
      <div className="aw-heading">
        <div>
          <div className="aw-eyebrow">CONTROL ROOM / ВНЕ</div>
          <h2>Всё начинается здесь.</h2>
          <p>
            {access.actor
              ? `${access.actor.displayName}, ваш рабочий обзор.`
              : "Рабочий обзор сайта и коллекции."}
          </p>
        </div>
        <span className="aw-badge">
          <ShieldCheck size={14} /> Персональный доступ
        </span>
      </div>
      {stats.error && (
        <p className="aw-message" role="alert">
          {stats.error.message}
        </p>
      )}
      <div className="aw-stats">
        {[
          ["patterns", "QR-паттернов"],
          ["drafts", "Черновиков"],
          ["accounts", "Активных записей"],
          ["sessions", "Сессий сейчас"],
        ]
          .filter(([key]) => stats.data?.counts[key!] !== undefined)
          .map(([key, label]) => (
            <div key={key}>
              <strong>{String(stats.data?.counts[key!] ?? "—").padStart(2, "0")}</strong>
              <span>{label}</span>
            </div>
          ))}
      </div>
      <div className="aw-launch-grid">
        <Link to="/admin/qr-studio">
          <span className="aw-eyebrow">КОЛЛЕКЦИЯ / 16 СТИЛЕЙ</span>
          <h3>QR, у которого есть характер.</h3>
          <p>Выберите стиль, настройте форму и посмотрите результат на билете.</p>
          <span className="aw-text-link">
            Открыть витрину <ArrowUpRight size={18} />
          </span>
        </Link>
        <Link to="/admin" search={{ section: "accounts" }}>
          <span className="aw-eyebrow">ЛЮДИ / ДОСТУП</span>
          <h3>Каждому — свои права.</h3>
          <p>Тестовый просмотр, работа с макетами и управление командой.</p>
          <span className="aw-text-link">
            Учётные записи <ArrowUpRight size={18} />
          </span>
        </Link>
      </div>
      <div className="aw-readiness">
        <h3>Готовность разделов</h3>
        {[
          ["QR-студия", "Работает"],
          ["Учётные записи", "Работает"],
          ["Журнал действий", "Работает"],
          ["Контент и мероприятия", "Черновики"],
          ["Членство и заявки", "Тестовая очередь"],
          ["Заказы", "Подключение данных"],
          ["Выдача билетов", "Предпросмотр макетов"],
        ].map(([label, state]) => (
          <div key={label}>
            <span>{label}</span>
            <span className={state === "Работает" ? "aw-ready" : "aw-subtle"}>{state}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
const actionLabels: Record<string, string> = {
  "settings.published": "Сохранены общие настройки",
  "login.success": "Вход выполнен",
  "login.failed": "Неудачный вход",
  logout: "Выход",
  "view.page": "Просмотр страницы",
  "view.section": "Просмотр раздела",
  "view.unavailable": "Открыт незавершённый раздел",
  "access.denied": "Действие отклонено",
  "account.created": "Создана запись",
  "account.updated": "Изменены права",
  "account.disabled": "Заблокирован вход",
  "account.password_reset": "Изменён пароль",
  "draft.saved": "Сохранён черновик",
  "qr.saved": "Сохранён QR",
  "qr.archived": "QR перемещён в архив",
  "request.created": "Получена тестовая заявка",
  "request.take": "Заявка взята на рассмотрение",
  "request.request_info": "Запрошено уточнение",
  "request.resume": "Уточнение записано",
  "request.waitlist": "Заявка в листе ожидания",
  "request.approve": "Заявка одобрена",
  "request.reject": "Заявка отклонена",
  "request.reopen": "Рассмотрение возобновлено",
  "request.note": "Добавлен комментарий к заявке",
};
const targetLabels: Record<string, string> = {
  overview: "Обзор",
  motion: "Анимация",
  content: "Контент",
  events: "Мероприятия",
  applications: "Заявки",
  orders: "Заказы",
  requests: "Членство",
  team: "Команда",
  accounts: "Учётные записи",
  operations: "Операции",
  tickets: "Билеты",
  "qr-studio": "QR-студия",
};
export function AuditPanel() {
  const access = useSiteAccess(),
    [filter, setFilter] = useState("");
  const list = useQuery({
    queryKey: ["site-audit", filter],
    queryFn: () =>
      siteAdminRequest<{
        entries: {
          id: string;
          actor_name: string;
          action: string;
          target: string;
          created_at: string;
        }[];
        hasMore: boolean;
      }>("audit" + (filter ? "?action=" + encodeURIComponent(filter) : "")),
    enabled: access.can("audit.read"),
    retry: false,
  });
  return (
    <section className="aw-workspace">
      <div className="aw-heading">
        <div>
          <div className="aw-eyebrow">ОПЕРАЦИИ / ЖУРНАЛ</div>
          <h2>Действия под контролем.</h2>
          <p>Входы, просмотры админки, изменения записей и черновиков. Время — московское.</p>
        </div>
        <button
          className="aw-icon-button"
          aria-label="Обновить журнал"
          disabled={!access.can("audit.read") || list.isFetching}
          onClick={() => void list.refetch()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {!access.can("audit.read") ? (
        <div className="aw-empty">
          <ShieldCheck size={30} />
          <h3>Журнал доступен администратору</h3>
          <p>Для просмотра истории нужно право «Просмотр журнала действий».</p>
        </div>
      ) : (
        <>
          <label className="aw-filter">
            Тип действия
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Все действия</option>
              {Object.entries(actionLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {list.error && (
            <p className="aw-message" role="alert">
              {list.error.message}
            </p>
          )}
          {list.isPending && <p role="status">Загружаем журнал…</p>}
          <div className="aw-audit-list">
            {list.data?.entries.map((row) => (
              <article key={row.id}>
                <Activity size={16} />
                <div>
                  <strong>{actionLabels[row.action] ?? row.action}</strong>
                  <p>
                    {row.actor_name} ·{" "}
                    <span className="aw-audit-target">
                      {targetLabels[row.target] ?? row.target}
                    </span>
                  </p>
                </div>
                <time dateTime={row.created_at}>{date(row.created_at)}</time>
              </article>
            ))}
          </div>
          {list.data?.entries.length === 0 && <div className="aw-empty">Действий пока нет.</div>}
          {list.data?.hasMore && (
            <p className="aw-subtle">
              Показаны последние 100 действий. Выберите тип для уточнения.
            </p>
          )}
        </>
      )}
    </section>
  );
}
const labels = { draft: "Черновик", review: "На проверке", archived: "Архив" };
export function DraftsPanel({ kind = "page" }: { kind?: "page" | "event" }) {
  const access = useSiteAccess(),
    client = useQueryClient();
  const [editing, setEditing] = useState<ContentDraft | null>(null),
    [filter, setFilter] = useState("active"),
    [notice, setNotice] = useState("");
  const list = useQuery({
    queryKey: ["site-drafts"],
    queryFn: () => siteAdminRequest<{ drafts: ContentDraft[] }>("drafts"),
    enabled: access.can("content.read"),
    retry: false,
  });
  const items = (list.data?.drafts ?? []).filter(
    (d) =>
      d.kind === kind &&
      (filter === "archived" ? d.status === "archived" : d.status !== "archived"),
  );
  function create() {
    setEditing({
      id: crypto.randomUUID(),
      kind,
      title: "",
      body: "",
      status: "draft",
      version: 0,
      updated_at: "",
    });
  }
  return (
    <section className="aw-workspace">
      <div className="aw-heading">
        <div>
          <div className="aw-eyebrow">
            {kind === "event" ? "МЕРОПРИЯТИЯ / ПОДГОТОВКА" : "КОНТЕНТ / РЕДАКТОР"}
          </div>
          <h2>{kind === "event" ? "Замысел будущей ночи." : "Место для новых историй."}</h2>
          <p>
            {kind === "event"
              ? "Соберите название, программу и организационные заметки. Продажи и выдача билетов ещё не подключены."
              : "Сохраняйте тексты страниц, отправляйте на проверку и возвращайтесь к работе с любого устройства."}
          </p>
        </div>
        <button className="aw-button" disabled={!access.can("content.write")} onClick={create}>
          <Plus size={16} /> Новый черновик
        </button>
      </div>
      <div className="aw-message">
        <FileText size={18} />
        <span>Черновики сохраняются в базе. Изменение черновика не публикует текст на сайте.</span>
      </div>
      {!access.can("content.read") && !access.isPending ? (
        <p className="aw-empty">Для просмотра нужно право «Просмотр черновиков».</p>
      ) : (
        <>
          <div className="aw-preset-row">
            <button
              className="aw-chip"
              aria-pressed={filter === "active"}
              onClick={() => setFilter("active")}
            >
              В работе
            </button>
            <button
              className="aw-chip"
              aria-pressed={filter === "archived"}
              onClick={() => setFilter("archived")}
            >
              Архив
            </button>
          </div>
          {(notice || list.error) && (
            <p role="status" className="aw-message">
              {list.error?.message ?? notice}
            </p>
          )}
          {editing && (
            <DraftEditor
              key={editing.id}
              draft={editing}
              canWrite={access.can("content.write")}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setNotice("Черновик сохранён.");
                setEditing(null);
                void client.invalidateQueries({ queryKey: ["site-drafts"] });
              }}
            />
          )}
          {access.isPending || (access.can("content.read") && list.isPending) ? (
            <p role="status">Загружаем черновики…</p>
          ) : items.length === 0 ? (
            <div className="aw-empty">
              <FileText size={32} />
              <h3>{filter === "archived" ? "Архив пока пуст" : "Первый черновик — впереди"}</h3>
              <p>
                {access.can("content.write")
                  ? "Нажмите «Новый черновик», чтобы начать."
                  : "Здесь появятся материалы, подготовленные командой."}
              </p>
            </div>
          ) : (
            <div className="aw-draft-grid">
              {items.map((d) => (
                <button className="aw-draft" key={d.id} onClick={() => setEditing(d)}>
                  <span className="aw-badge">{labels[d.status]}</span>
                  <h3>{d.title}</h3>
                  <p>{d.body.slice(0, 180) || "Текст ещё не добавлен."}</p>
                  <span className="aw-subtle">
                    Версия {d.version} · {date(d.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
function DraftEditor({
  draft,
  canWrite,
  onClose,
  onSaved,
}: {
  draft: ContentDraft;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(draft.title),
    [body, setBody] = useState(draft.body),
    [status, setStatus] = useState(draft.status),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useSiteLoading(busy, "Сохраняем черновик");
  useEffect(() => {
    document.getElementById("aw-draft-title")?.focus();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await siteAdminRequest("drafts", { ...draft, title, body, status });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="aw-form aw-draft-editor" onSubmit={(e) => void save(e)}>
      <fieldset disabled={busy || !canWrite}>
        <label>
          Название
          <input
            id="aw-draft-title"
            maxLength={120}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {draft.kind === "event" ? "Программа и заметки" : "Текст страницы"}
          <textarea
            rows={8}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              draft.kind === "event"
                ? "Идея события, желаемая дата, программа, задачи команды…"
                : "Начните с главной мысли…"
            }
          />
        </label>
        <label>
          Статус
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ContentDraft["status"])}
          >
            {Object.entries(labels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="aw-error">
            {error}
          </p>
        )}
        {canWrite && (
          <button className="aw-button" type="submit">
            {busy ? "Сохраняем…" : "Сохранить черновик"}
          </button>
        )}
      </fieldset>
      <button className="aw-text-link" type="button" onClick={onClose}>
        Закрыть
      </button>
    </form>
  );
}
