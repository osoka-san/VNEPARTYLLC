import { useBeginSiteLoading, useSiteLoading } from "@/components/loading/SiteLoading";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { savePreviewDraft } from "@/lib/qr-studio/ticket-preview";
import { ticketAction } from "@/lib/tickets/tickets.functions";
import {
  ticketError,
  TICKET_ERRORS,
  type TicketAction,
  type TicketEvent,
  type TicketHistory,
  type TicketResponse,
} from "@/lib/tickets/workspace-contract";
import { QR_TEMPLATES } from "@/lib/qr-studio/catalog";
import { ENGINE_VERSION, PATTERNS, readPatternFile, type Pattern } from "@/lib/qr-studio/pattern";
import { listPatterns, type SavedPattern } from "@/lib/qr-studio/library";
import { TicketStage } from "./PassView";
import { makeDemoPass } from "./ticket-designs";
import type { PassAccess, PassDTO } from "./types";
import "@/styles/tickets/workspace.css";

const statusNames = {
  active: "Действует",
  used: "Вход подтверждён",
  revoked: "Отозван",
  expired: "Срок истёк",
};
const typeNames: Record<PassAccess, string> = {
  GENERAL: "Гость",
  VIP: "VIP",
  ARTIST: "Артист",
  SECURITY: "Охрана",
};
export default function TicketWorkspace({ enabled }: { enabled: boolean }) {
  const beginLoading = useBeginSiteLoading();
  const action = useServerFn(ticketAction);
  const navigate = useNavigate();
  const [flipped, setFlipped] = useState(false);
  const [events, setEvents] = useState<TicketEvent[]>([]),
    [eventId, setEvent] = useState("");
  const [items, setItems] = useState<PassDTO[]>([]),
    [selected, setSelected] = useState<PassDTO | null>(null),
    [passPath, setPath] = useState<string | null>(null);
  const [history, setHistory] = useState<TicketHistory[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [name, setName] = useState(""),
    [access, setAccess] = useState<PassAccess>("GENERAL"),
    [reason, setReason] = useState(""),
    [revokeReason, setRevokeReason] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>(QR_TEMPLATES.map((t) => t.pattern)),
    [patternIndex, setPatternIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const retry = useRef<{ id: string; body: Record<string, unknown> } | null>(null),
    revokeOp = useRef<{ id: string; signature: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useSiteLoading(busy, "Обновляем пропуска");
  const event = events.find((e) => e.id === eventId),
    pattern = patterns[patternIndex] ?? PATTERNS[0];
  const request = useCallback(
    async (
      kind: TicketAction,
      body: Record<string, unknown>,
      operationId?: string,
    ): Promise<TicketResponse> => {
      const r = await action({
        data: { action: kind, body, ...(operationId ? { operationId } : {}) },
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    [action],
  );
  const load = useCallback(async () => {
    const [catalog, list] = await Promise.all([
      request("catalog", {}),
      request("list", { ...(eventId ? { eventId } : {}), query, page }),
    ]);
    setEvents(catalog.events ?? []);
    setItems(list.items ?? []);
  }, [request, eventId, query, page]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const finish = beginLoading("Загружаем пропуска");
    const timer = setTimeout(() => {
      void load()
        .catch((e) => current && setError(ticketError(e.message)))
        .finally(finish);
    }, 200);
    return () => {
      current = false;
      finish();
      clearTimeout(timer);
    };
  }, [enabled, load, beginLoading]);
  useEffect(() => {
    let alive = true;
    void listPatterns()
      .then((r) => {
        if (alive)
          setPatterns([
            ...QR_TEMPLATES.map((t) => t.pattern),
            ...r.items
              .filter((x: SavedPattern) => x.engineVersion === ENGINE_VERSION)
              .map((x: SavedPattern) => x.pattern),
          ]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(ticketError(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  };
  const issue = () =>
    run(async () => {
      if (!retry.current)
        retry.current = {
          id: crypto.randomUUID(),
          body: {
            eventId,
            name: name.trim(),
            access,
            reason: reason.trim(),
            design: { engineVersion: ENGINE_VERSION, pattern },
          },
        };
      try {
        const data = await request("issue", retry.current.body, retry.current.id);
        setSelected(data.pass ?? null);
        setPath(data.passPath ?? null);
        setHistory([]);
        setUncertain(false);
        retry.current = null;
        setMessage(
          data.duplicate
            ? "Восстановлен результат предыдущей выдачи."
            : "Билет создан. Персональную ссылку можно скопировать.",
        );
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (!Object.hasOwn(TICKET_ERRORS, code)) {
          setUncertain(true);
        } else {
          retry.current = null;
          setUncertain(false);
        }
        throw e;
      }
      try {
        await load();
      } catch {
        setError("Билет создан, но список не обновился. Сохраните ссылку и нажмите «Обновить».");
      }
    });
  const open = (id: string) =>
    run(async () => {
      const [data, log] = await Promise.all([request("get", { id }), request("history", { id })]);
      setSelected(data.pass ?? null);
      setPath(data.passPath ?? null);
      setHistory(log.history ?? []);
      setRevokeReason("");
    });
  const revoke = () =>
    run(async () => {
      if (!selected) return;
      const signature = JSON.stringify([selected.id, selected.version, revokeReason.trim()]);
      if (revokeOp.current?.signature !== signature)
        revokeOp.current = { id: crypto.randomUUID(), signature };
      const data = await request("revoke", {
        id: selected.id,
        expectedVersion: selected.version,
        reason: revokeReason.trim(),
        operationId: revokeOp.current.id,
      });
      setSelected(data.pass ?? null);
      setPath(data.passPath ?? null);
      setMessage("Билет отозван.");
      revokeOp.current = null;
      setRevokeReason("");
      await load();
      const log = await request("history", { id: selected.id });
      setHistory(log.history ?? []);
    });
  const preview: PassDTO = selected ?? {
    ...makeDemoPass(access),
    name: name || "Имя гостя",
    event: { ...makeDemoPass(access).event, title: event?.title ?? "Выберите мероприятие" },
    design: { engineVersion: ENGINE_VERSION, pattern },
  };
  const canIssue =
    enabled &&
    event &&
    event.capacity != null &&
    event.taken < event.capacity &&
    event.entryOpensAt &&
    event.entryClosesAt &&
    event.qrReleaseAt;
  return (
    <div className="ticket-workspace">
      <div className="ticket-workspace-bar">
        <div>
          <h2>Билеты</h2>
          <p>Персональный пропуск · ручная выдача</p>
        </div>
        <div className="tw-inline">
          <button
            className="tw-button"
            type="button"
            onClick={() => {
              try {
                const id = savePreviewDraft(pattern, "на удачу");
                void navigate({
                  to: "/admin/tickets",
                  search: { view: "preview", template: pattern.template, draft: id, access },
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось открыть макет.");
              }
            }}
          >
            Макет карточки
          </button>
          <Link
            to="/admin/qr-studio"
            search={{ view: undefined, template: undefined, draft: undefined }}
            className="tw-button"
          >
            Все макеты QR
          </Link>
        </div>
        <Link to="/scan" className="tw-button">
          Сканер входа
        </Link>
      </div>
      {!enabled && (
        <div className="tw-notice" role="status">
          <strong>Выдача ещё не подключена</strong>
          <p>
            Для выпуска билетов нужны база мероприятий, сервис выдачи и служебный вход со вторым
            фактором. Ниже можно настроить внешний вид пробной карточки.
          </p>
          <Link to="/login" search={{ redirect: "/admin" }}>
            Служебный вход
          </Link>
        </div>
      )}
      {error && (
        <p className="tw-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="tw-success" role="status">
          {message}
        </p>
      )}
      <div className="ticket-workspace-grid">
        <section className="tw-panel">
          <h3>Новый билет</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void issue();
            }}
          >
            <fieldset disabled={busy || uncertain}>
              <label>
                Мероприятие
                <select
                  value={eventId}
                  disabled={!enabled}
                  onChange={(e) => {
                    setEvent(e.target.value);
                    setPage(0);
                  }}
                  required
                >
                  <option value="">
                    {enabled ? "Выберите мероприятие" : "Нет подключённых мероприятий"}
                  </option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                      {e.synthetic ? " · тест" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {event && (
                <div className="tw-event-info">
                  <span>
                    {event.taken} / {event.capacity ?? "—"} мест занято
                  </span>
                  <span>
                    {event.synthetic ? "Тестовые билеты — без допуска" : "Действующее мероприятие"}
                  </span>
                  {!canIssue && (
                    <p>Проверьте свободные места и время входа в настройках мероприятия.</p>
                  )}
                </div>
              )}
              <label>
                Имя гостя
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  autoComplete="off"
                  placeholder="Как подписать билет"
                />
              </label>
              <label>
                Тип карты
                <select value={access} onChange={(e) => setAccess(e.target.value as PassAccess)}>
                  {Object.entries(typeNames).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Основание выдачи
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  maxLength={300}
                  required
                  placeholder="Приглашение организатора, артист, команда…"
                  rows={2}
                />
              </label>
              <label>
                QR-паттерн
                <select
                  value={patternIndex}
                  onChange={(e) => setPatternIndex(Number(e.target.value))}
                >
                  {patterns.map((p, i) => (
                    <option key={i} value={i}>
                      {p.name}
                      {p.event ? ` · ${p.event}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="tw-inline">
                <Link to="/admin/qr-studio">Открыть QR-студию</Link>
                <label className="tw-file">
                  Загрузить паттерн
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      try {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 16000) throw new Error();
                        const p = readPatternFile(JSON.parse(await f.text()));
                        setPatterns((old) => [...old, p.pattern]);
                        setPatternIndex(patterns.length);
                        setMessage("Паттерн загружен для этого билета.");
                      } catch {
                        setError(
                          "Не удалось открыть файл паттерна. Экспортируйте его из текущей QR-студии.",
                        );
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </fieldset>
            <p className="tw-help">
              Билет действует до закрытия входа. Тип карты не назначает права на сайте. QR появится
              во время, указанное в мероприятии.
            </p>
            <button
              className="tw-button tw-primary"
              disabled={
                busy ||
                (!uncertain && (!canIssue || name.trim().length < 1 || reason.trim().length < 3))
              }
            >
              {busy ? "Обработка…" : uncertain ? "Повторить тот же запрос" : "Выпустить билет"}
            </button>
          </form>
        </section>
        <section className="tw-panel tw-preview">
          <div className="tw-panel-heading">
            <h3>{selected ? "Выданный билет" : "Предпросмотр"}</h3>
            <span>{selected ? statusNames[selected.status] : "Образец · не для входа"}</span>
          </div>
          <TicketStage
            pass={preview}
            paused
            compact
            flipped={flipped}
            onFlip={() => setFlipped((v) => !v)}
          />
          <button type="button" className="tw-button" onClick={() => setFlipped((v) => !v)}>
            {flipped ? "Лицевая сторона" : "Посмотреть QR"}
          </button>
          {selected && (
            <>
              <p>
                {selected.name} · {selected.sequenceLabel}
              </p>
              <p>
                {selected.environment === "sandbox"
                  ? "Тестовый билет — вход запрещён"
                  : selected.event.title}
              </p>
              <div className="tw-inline">
                {passPath && (
                  <>
                    <a className="tw-button" href={passPath} target="_blank" rel="noreferrer">
                      Открыть карточку
                    </a>
                    <button
                      className="tw-button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(new URL(passPath, location.origin).href)
                          .then(() => setMessage("Ссылка скопирована."))
                          .catch(() =>
                            setError(
                              "Не удалось скопировать ссылку. Откройте карточку и скопируйте адрес.",
                            ),
                          )
                      }
                    >
                      Копировать ссылку
                    </button>
                  </>
                )}
                <button
                  className="tw-button"
                  onClick={() => {
                    setSelected(null);
                    setPath(null);
                    setHistory([]);
                  }}
                >
                  К предпросмотру
                </button>
              </div>
              {selected.status === "active" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void revoke();
                  }}
                  className="tw-revoke"
                >
                  <label>
                    Причина отзыва
                    <input
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      minLength={3}
                      maxLength={300}
                      required
                    />
                  </label>
                  <button className="tw-button" disabled={busy || revokeReason.trim().length < 3}>
                    Отозвать билет
                  </button>
                </form>
              )}
              {history.length > 0 && (
                <details>
                  <summary>История билета</summary>
                  <ol className="tw-history">
                    {history.map((h) => (
                      <li key={h.id}>
                        <time>{new Date(h.occurred_at).toLocaleString("ru-RU")}</time> · {h.action}{" "}
                        / {h.outcome}
                        {h.detail ? ` — ${h.detail}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </section>
      </div>
      <section className="tw-panel tw-register">
        <div className="tw-panel-heading">
          <h3>Выданные билеты</h3>
          <button className="tw-button" disabled={!enabled || busy} onClick={() => void run(load)}>
            Обновить
          </button>
        </div>
        <label>
          Поиск по имени
          <input
            value={query}
            disabled={!enabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Имя гостя"
          />
        </label>
        {!items.length ? (
          <p className="tw-empty">
            {enabled
              ? "Билетов по этому фильтру нет."
              : "Список появится после подключения сервиса."}
          </p>
        ) : (
          <div className="tw-table">
            <table>
              <thead>
                <tr>
                  <th>Гость</th>
                  <th>Мероприятие</th>
                  <th>Тип</th>
                  <th>Номер</th>
                  <th>Состояние</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {p.event.title}
                      {p.environment === "sandbox" ? " · тест" : ""}
                    </td>
                    <td>{typeNames[p.access]}</td>
                    <td>{p.sequenceLabel}</td>
                    <td>{statusNames[p.status]}</td>
                    <td>
                      <button className="tw-button" disabled={busy} onClick={() => void open(p.id)}>
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {enabled && (
          <div className="tw-inline">
            <button
              className="tw-button"
              disabled={page === 0 || busy}
              onClick={() => setPage((v) => v - 1)}
            >
              Назад
            </button>
            <span>Страница {page + 1}</span>
            <button
              className="tw-button"
              disabled={items.length < 50 || busy}
              onClick={() => setPage((v) => v + 1)}
            >
              Далее
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
