import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { PassAccess, PassDTO } from "./types";
import "@/styles/tickets/base.css";
import "@/styles/tickets/admin.css";

export type IssuedResult = {
  pass: PassDTO;
  /** Путь сайта /pass#token (секрет предъявителя) или абсолютный url модуля. */
  passPath?: string | null;
  url?: string;
  duplicate: boolean;
  delivery: { channel: string; state: string; last_error?: string }[];
};
export type ApiRequest = (
  path: string,
  body: Record<string, unknown>,
  key: string,
  requestId?: string,
) => Promise<IssuedResult>;

const TYPES: { id: PassAccess; label: string; note: string; tone: string; number: string }[] = [
  { id: "GENERAL", label: "GUEST GENERAL", note: "Гостевой билет", tone: "ember", number: "01" },
  { id: "VIP", label: "VIP", note: "Особый уровень доступа", tone: "gold", number: "02" },
  {
    id: "SECURITY",
    label: "SECURITY STAFF",
    note: "Команда безопасности",
    tone: "mint",
    number: "03",
  },
  { id: "ARTIST", label: "ARTIST", note: "Артист · выступление", tone: "ice", number: "04" },
];
const messages: Record<string, string> = {
  event_capacity_reached: "Все номера для этого события уже выданы. Новый пропуск не создан.",
  event_capacity_conflict:
    "Для этого ID события уже задан другой тираж. Проверь значение общего числа билетов.",
  event_details_conflict:
    "Для этого ID события сохранены другие сведения. Название, дата, трансфер и тираж должны совпадать.",
  name_or_telegram_required: "Укажи имя гостя или Telegram-логин.",
  invalid_telegram:
    "Telegram-логин: @ и 5–32 латинских символа, цифры и подчёркивания; первый символ — буква.",
  invalid_valid_until: "Срок действия должен быть в будущем.",
  invalid_event: "Проверь поля события: ID, название, дата, время шаттла, место сбора и тираж.",
  invalid_recipient: "Проверь адрес получателя.",
  invalid_user_id: "Укажи ID пользователя.",
  invalid_input: "Запрос отклонён: неверные данные.",
  not_configured: "Выдача не подключена.",
  unauthorized: "Нет действующего доступа команды. Войдите заново со вторым фактором.",
  forbidden: "Запрос отклонён.",
  pass_not_found: "Пропуск не найден.",
  idempotency_conflict: "Запрос уже использован с другими данными.",
  rate_limited: "Слишком много запросов. Подожди минуту.",
  service_unavailable: "Сервис выдачи недоступен. Билет не создан.",
  service_misconfigured: "Сервис выдачи отклонил ключ сайта. Проверьте конфигурацию.",
  service_error: "Сервис выдачи вернул ошибку. Билет не создан.",
};
const explain = (code: string) => messages[code] || `Не удалось выполнить запрос: ${code}`;
const emptyForm = {
  userId: "",
  name: "",
  telegram: "",
  eventId: "",
  eventTitle: "",
  date: "",
  shuttleTime: "",
  meetingPoint: "",
  totalTickets: "",
  until: "",
  recipient: "",
};
type FormKey = keyof typeof emptyForm;

/** Встраиваемая панель. На сайте: apiRequest через серверные функции, requireKey={false}. */
export function TicketAdminPanel({
  apiRequest,
  requireKey = false,
  issueEnabled = true,
  onAccessChange,
}: {
  apiRequest: ApiRequest;
  requireKey?: boolean;
  issueEnabled?: boolean;
  onAccessChange?: (a: PassAccess) => void;
}) {
  const [key, setKey] = useState("");
  const [result, setResult] = useState<IssuedResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useSiteLoading(busy, "Обновляем карточку пропуска");
  const [notice, setNotice] = useState("");
  const [channel, setChannel] = useState<"none" | "email" | "telegram">("none");
  const [access, setAccessState] = useState<PassAccess>("GENERAL");
  const [form, setForm] = useState(emptyForm);
  const requestRef = useRef<{ body: string; id: string } | null>(null);
  const selected = TYPES.find((t) => t.id === access) ?? TYPES[0]!;
  const setAccess = (a: PassAccess) => {
    setAccessState(a);
    onAccessChange?.(a);
  };
  const update = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const field = (name: FormKey) => ({ name, value: form[name], onChange: update });
  const link = result
    ? result.passPath && typeof window !== "undefined"
      ? `${window.location.origin}${result.passPath}`
      : (result.url ?? "")
    : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!issueEnabled) return;
    setError("");
    setBusy(true);
    setNotice("");
    try {
      if (!form.name.trim() && !form.telegram.trim()) throw new Error("name_or_telegram_required");
      const until = new Date(form.until);
      if (Number.isNaN(until.getTime())) throw new Error("invalid_valid_until");
      const payload = {
        userId: form.userId,
        name: form.name,
        telegram: form.telegram || null,
        access,
        validUntil: until.toISOString(),
        event: {
          id: form.eventId,
          title: form.eventTitle,
          date: form.date,
          shuttleTime: form.shuttleTime,
          meetingPoint: form.meetingPoint,
          totalTickets: Number(form.totalTickets),
        },
        recipient: channel === "none" ? null : { channel, address: form.recipient },
      };
      const body = JSON.stringify(payload);
      if (requestRef.current?.body !== body) requestRef.current = { body, id: crypto.randomUUID() };
      setResult(await apiRequest("/api/admin/issue", payload, key, requestRef.current.id));
    } catch (err) {
      setError(explain(err instanceof Error ? err.message : "service_error"));
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, extra: Record<string, unknown> = {}) {
    if (!result) return;
    setError("");
    setBusy(true);
    try {
      setResult(await apiRequest(path, { id: result.pass.id, ...extra }, key));
      setNotice("Статус обновлён.");
    } catch (err) {
      setError(explain(err instanceof Error ? err.message : "service_error"));
    } finally {
      setBusy(false);
    }
  }
  const issuedTone = result
    ? TYPES.find((t) => t.id === result.pass.access)?.tone || "ember"
    : "ember";
  return (
    <section className="vne-ticket-admin" aria-label="Генерация билетов ВНЕ">
      <header className="vne-admin-header">
        <div>
          <span className="vne-admin-eyebrow">ВНЕ / УПРАВЛЕНИЕ ДОСТУПОМ</span>
          <h1>
            Выпуск билетов<span>.</span>
          </h1>
          <p>Индивидуальная карточка. Один гость, один QR, один номер в тираже события.</p>
        </div>
        <span className="vne-admin-private">РУЧНАЯ ВЫДАЧА</span>
      </header>
      {requireKey && (
        <label className="vne-admin-key">
          Доступ администратора
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Ключ ADMIN_KEY"
            required
          />
          <small>Ключ остаётся в памяти этой вкладки.</small>
        </label>
      )}
      {!issueEnabled && (
        <p role="status" className="vne-admin-error">
          Выдача не подключена. Доступен только предпросмотр карточки; билет не создаётся.
        </p>
      )}
      {error && (
        <p role="alert" className="vne-admin-error">
          {error}
        </p>
      )}
      {!result ? (
        <form onSubmit={submit}>
          <fieldset className="vne-admin-type-group">
            <legend>
              <b>01</b> Уровень доступа
            </legend>
            <div className="vne-admin-types">
              {TYPES.map((type) => (
                <button
                  type="button"
                  className={`vne-admin-type vne-admin-${type.tone} ${access === type.id ? "is-selected" : ""}`}
                  key={type.id}
                  aria-pressed={access === type.id}
                  onClick={() => setAccess(type.id)}
                >
                  <span className="vne-admin-type-code">
                    {type.number}
                    <span>{access === type.id ? "●" : "○"}</span>
                  </span>
                  <strong>{type.label}</strong>
                  <small>{type.note}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="vne-admin-layout">
            <div className="vne-admin-form-sections">
              <fieldset>
                <legend>
                  <b>02</b> Получатель
                </legend>
                <div className="vne-admin-fields">
                  <label>
                    ID пользователя
                    <input
                      {...field("userId")}
                      required
                      maxLength={120}
                      placeholder="Внутренний ID аккаунта"
                    />
                  </label>
                  <label>
                    Имя гостя
                    <input
                      {...field("name")}
                      maxLength={80}
                      placeholder="Имя для лицевой стороны"
                    />
                  </label>
                  <label>
                    Telegram-логин
                    <input {...field("telegram")} maxLength={33} placeholder="@username" />
                    <small>Используется на карточке, если имя не указано.</small>
                  </label>
                  <label>
                    Действителен до
                    <input {...field("until")} type="datetime-local" required />
                    <small>Местное время устройства администратора.</small>
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>
                  <b>03</b> Событие и трансфер
                </legend>
                <div className="vne-admin-fields">
                  <label>
                    ID события
                    <input
                      {...field("eventId")}
                      required
                      maxLength={120}
                      placeholder="Уникальный ID события"
                    />
                  </label>
                  <label>
                    Название события
                    <input
                      {...field("eventTitle")}
                      required
                      maxLength={90}
                      placeholder="Название на карточке"
                    />
                  </label>
                  <label>
                    Дата события
                    <input {...field("date")} required type="date" />
                  </label>
                  <label>
                    Первый шаттл · начало
                    <input {...field("shuttleTime")} required type="time" />
                    <small>Время отправления; часовой пояс события.</small>
                  </label>
                  <label className="vne-admin-span">
                    Место сбора и отправления трансфера
                    <input
                      {...field("meetingPoint")}
                      required
                      maxLength={120}
                      placeholder="Согласованное место сбора гостей"
                    />
                    <small>Укажи место отправления трансфера, не закрытый адрес.</small>
                  </label>
                  <label>
                    Общий тираж события
                    <input
                      {...field("totalTickets")}
                      required
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      placeholder="Согласованное число билетов"
                    />
                    <small>Единый для всех четырёх типов. Номер присваивает сервер.</small>
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>
                  <b>04</b> Доставка
                </legend>
                <div className="vne-admin-fields">
                  <label>
                    Способ получения
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as "none" | "email" | "telegram")}
                    >
                      <option value="none">Получить ссылку</option>
                      <option value="email">Email</option>
                      <option value="telegram">Telegram</option>
                    </select>
                    <small>
                      Отправка сообщений в этом объёме не подключена; адрес передаётся сервису
                      выдачи.
                    </small>
                  </label>
                  {channel !== "none" && (
                    <label>
                      {channel === "email" ? "Email получателя" : "Подтверждённый Telegram chat_id"}
                      <input
                        {...field("recipient")}
                        type={channel === "email" ? "email" : "text"}
                        required
                        placeholder={
                          channel === "email" ? "guest@example.com" : "Числовой ID чата с ботом"
                        }
                      />
                    </label>
                  )}
                </div>
              </fieldset>
            </div>
            <aside className={`vne-admin-summary vne-admin-${selected.tone}`}>
              <span className="vne-admin-eyebrow">ПАРАМЕТРЫ КАРТОЧКИ</span>
              <strong className="vne-admin-summary-type">{selected.label}</strong>
              <div className="vne-admin-summary-rule" />
              <p className="vne-admin-summary-event">{form.eventTitle || "Название события"}</p>
              <p className="vne-admin-summary-guest">
                {form.name || form.telegram || "Имя гостя / @username"}
              </p>
              <dl>
                <div>
                  <dt>ID пользователя</dt>
                  <dd>{form.userId || "—"}</dd>
                </div>
                <div>
                  <dt>Дата</dt>
                  <dd>{form.date || "—"}</dd>
                </div>
                <div>
                  <dt>Первый шаттл</dt>
                  <dd>{form.shuttleTime || "—"}</dd>
                </div>
              </dl>
              <div className="vne-admin-summary-edition">
                —<span>/{form.totalTickets || "—"}</span>
              </div>
              <small>
                Номер и рабочий QR появятся после успешной выдачи. Просмотр карточки не погашает
                билет. Тип карты не даёт прав на сайте.
              </small>
            </aside>
          </div>
          <footer className="vne-admin-submit">
            <p>
              Ручная выдача создаёт действующий пропуск без оплаты.
              <br />
              Повтор запроса сохранит тот же билет. Выдача записывается в журнал.
            </p>
            {issueEnabled ? (
              <button type="submit" disabled={busy || (requireKey && key.length < 32)}>
                {busy ? "Создаём карточку…" : "ВЫПУСТИТЬ БИЛЕТ"}
                <span>↗</span>
              </button>
            ) : (
              <p className="vne-admin-private" data-testid="issue-disabled">
                ВЫДАЧА НЕ ПОДКЛЮЧЕНА
              </p>
            )}
          </footer>
        </form>
      ) : (
        <section className={`vne-admin-issued vne-admin-${issuedTone}`}>
          <span className="vne-admin-eyebrow">
            {result.duplicate ? "СУЩЕСТВУЮЩИЙ БИЛЕТ · ПОВТОР БЕЗ ДУБЛЯ" : "БИЛЕТ ВЫПУЩЕН"}
          </span>
          <div className="vne-admin-issued-head">
            <div>
              <h2>{result.pass.name || result.pass.telegram}</h2>
              <p>
                {result.pass.event.title} · {result.pass.access} · {result.pass.status}
              </p>
            </div>
            <strong>{result.pass.sequenceLabel}</strong>
          </div>
          <p className="vne-admin-code">{result.pass.ticketCode}</p>
          {link ? (
            <>
              <label>
                Персональная ссылка
                <input readOnly value={link} onFocus={(e) => e.target.select()} />
              </label>
              <div className="vne-admin-actions">
                <a className="vne-admin-open" href={link} target="_blank" rel="noreferrer noopener">
                  ОТКРЫТЬ КАРТОЧКУ ↗
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setNotice("Ссылка скопирована.");
                    } catch {
                      setNotice("Выдели и скопируй ссылку из поля.");
                    }
                  }}
                >
                  Копировать ссылку
                </button>
              </div>
            </>
          ) : (
            <p>Ссылка доступна только в момент выдачи.</p>
          )}
          <p>
            Доставка:{" "}
            {result.delivery.length
              ? result.delivery.map((d) => `${d.channel}: ${d.state}`).join(", ")
              : "только персональная ссылка"}
          </p>
          <div className="vne-admin-actions">
            <button type="button" disabled={busy} onClick={() => action("/api/admin/get")}>
              Обновить статус
            </button>
            <button
              type="button"
              disabled={busy || result.pass.status === "revoked"}
              onClick={() => {
                if (window.confirm("Отозвать этот пропуск? QR перестанет давать право входа."))
                  action("/api/admin/revoke", { reason: "Отозван администратором" });
              }}
            >
              Отозвать билет
            </button>
          </div>
          <p role="status">{notice}</p>
          <button
            type="button"
            className="vne-admin-new"
            onClick={() => {
              setResult(null);
              requestRef.current = null;
              setNotice("");
            }}
          >
            + ВЫПУСТИТЬ СЛЕДУЮЩИЙ
          </button>
        </section>
      )}
    </section>
  );
}
