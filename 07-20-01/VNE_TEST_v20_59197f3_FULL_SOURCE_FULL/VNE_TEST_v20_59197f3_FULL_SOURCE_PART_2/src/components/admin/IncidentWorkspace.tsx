import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
import { incidentAction } from "@/lib/incidents/incidents.functions";
import {
  INCIDENT_TYPES,
  DECISIONS,
  type Decision,
  type IncidentType,
} from "@/lib/incidents/incident-contract";
import "./workspace.css";
import "./incidents.css";

type EventAccess = { id: string; title: string; canRecord: boolean; canRestrict: boolean };
type Candidate = { userId: string; displayName: string };
type Item = {
  id: string;
  decision: string | null;
  version: number;
  restrictionRequestPending: boolean;
};
type Summary = {
  totalRecords: number;
  pendingReview: number;
  activeRestrictions: number;
  items: Item[];
  limited: boolean;
};
type HistoryEvent = {
  id: string;
  sequence: number;
  kind: string;
  reason: string;
  decision: string | null;
  requestedDays: number | null;
  referenceEventId: string | null;
  recordedAt: string;
  actorId: string;
};
type Detail = { id: string; originalReason: string; history: HistoryEvent[]; limited: boolean };
const labels = Object.fromEntries([
  ...DECISIONS,
  ["restrict_temporary", "Ограничение одобрено менеджером"],
]);
const errors: Record<string, string> = {
  unconfigured: "Раздел подготовлен, но серверный доступ ещё не включён. Данные не запрашиваются.",
  signin: "Войдите в отдельный аккаунт Supabase. Вход предпросмотра не даёт эти права.",
  mfa: "Для этого раздела нужен вход с двухфакторной проверкой.",
  forbidden: "Нет действующего назначения для этого действия и мероприятия.",
  conflict: "Запись изменилась. Обновите историю перед новым решением.",
  rate_limited: "Слишком много запросов. Подождите минуту.",
  invalid: "Проверьте точного человека, обязательную пометку и поля решения.",
  unavailable: "Действие не выполнено. Можно повторить с теми же данными.",
};

export function IncidentWorkspace() {
  const action = useServerFn(incidentAction);
  const [events, setEvents] = useState<EventAccess[]>([]),
    [eventId, setEventId] = useState("");
  const [mode, setMode] = useState<"id" | "name" | "qr">("id"),
    [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]),
    [selected, setSelected] = useState<Candidate | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null),
    [detail, setDetail] = useState<Detail | null>(null);
  const [type, setType] = useState<IncidentType | "">(""),
    [decision, setDecision] = useState<Decision | "">(""),
    [reason, setReason] = useState(""),
    [days, setDays] = useState("");
  const [appendKind, setAppendKind] = useState("account_note"),
    [referenceId, setReferenceId] = useState(""),
    [replacementType, setReplacementType] = useState(""),
    [appealDecision, setAppealDecision] = useState("");
  const [reviewReason, setReviewReason] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const revoked = useRef(false);
  const generation = useRef(0),
    operation = useRef<{ body: string; id: string } | null>(null),
    busyRef = useRef(false);
  const access = events.find((e) => e.id === eventId);
  const clear = () => {
    generation.current++;
    setSelected(null);
    setCandidates([]);
    setConfirmed(false);
    setSummary(null);
    setDetail(null);
    setReason("");
    setReviewReason("");
    operation.current = null;
  };
  useEffect(() => {
    let alive = true;
    const current = generation.current;
    void action({ data: { action: "context", payload: {} } })
      .then((r) => {
        if (!alive || revoked.current || current !== generation.current) return;
        if (!r.ok) {
          setNotice(errors[r.reason] ?? errors["unavailable"]!);
          return;
        }
        const data = JSON.parse(r.dataJson) as { events: EventAccess[] };
        setEvents(data.events);
        if (data.events.length === 1) setEventId(data.events[0]!.id);
        if (!data.events.length)
          setNotice(
            "Нет назначений на этот раздел. Логин ADMIN_TEST сам по себе не даёт полномочий.",
          );
      })
      .catch(() => alive && setNotice(errors["unavailable"]!));
    return () => {
      alive = false;
    };
  }, [action]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        generation.current++;
        setDetail(null);
        setReviewReason("");
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    const signout = () => {
      revoked.current = true;
      generation.current++;
      setEvents([]);
      setEventId("");
      setQuery("");
      setCandidates([]);
      setSelected(null);
      setConfirmed(false);
      setSummary(null);
      setDetail(null);
      setReason("");
      setReviewReason("");
      operation.current = null;
      setNotice("Сеанс завершён. Войдите заново и обновите страницу.");
    };
    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DRAFT_SIGNOUT_EVENT);
    if (channel) channel.onmessage = signout;
    window.addEventListener(DRAFT_SIGNOUT_EVENT, signout);
    return () => {
      generation.current++;
      channel?.close();
      window.removeEventListener(DRAFT_SIGNOUT_EVENT, signout);
    };
  }, []);
  async function call(kind: "lookup" | "read" | "record" | "append", payload: unknown) {
    if (revoked.current) throw new Error("Сеанс завершён. Войдите заново.");
    const current = generation.current;
    const r = await action({ data: { action: kind, payload } });
    if (revoked.current || current !== generation.current)
      throw new Error("Состояние страницы изменилось. Обновите её.");
    if (!r.ok) throw new Error(errors[r.reason] ?? errors["unavailable"]);
    return JSON.parse(r.dataJson) as unknown;
  }
  const showError = (error: unknown) =>
    setNotice(error instanceof Error ? error.message : errors["unavailable"]!);
  function operationId(body: unknown) {
    const serialized = JSON.stringify(body);
    if (operation.current?.body !== serialized)
      operation.current = { body: serialized, id: crypto.randomUUID() };
    return operation.current.id;
  }
  async function lookup() {
    if (revoked.current || busyRef.current || !eventId) return;
    clear();
    const current = generation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = (await call("lookup", { eventId, mode, value: query })) as {
        outcome: string;
        candidates: Candidate[];
      };
      if (current !== generation.current) return;
      setCandidates(data.candidates);
      setQuery("");
      setNotice(
        data.outcome === "unlinked_account"
          ? "Пропуск не связан с аккаунтом. Привязка по имени не выполняется."
          : data.candidates.length
            ? "Выберите точного человека и подтвердите ID."
            : "Совпадений в этом мероприятии не найдено.",
      );
    } catch (error) {
      if (current === generation.current) showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function load(person: Candidate, afterMutation = false) {
    if (revoked.current || (busyRef.current && !afterMutation)) return;
    const current = ++generation.current;
    setSelected(person);
    setConfirmed(false);
    setSummary(null);
    setDetail(null);
    setReviewReason("");
    try {
      const data = (await call("read", {
        eventId,
        userId: person.userId,
        incidentId: null,
      })) as Summary;
      if (current === generation.current) setSummary(data);
    } catch (error) {
      if (current === generation.current) showError(error);
    }
  }
  async function open(item: Item) {
    if (revoked.current || !selected || busyRef.current) return;
    const current = ++generation.current;
    setDetail(null);
    setReferenceId("");
    try {
      const data = (await call("read", {
        eventId,
        userId: selected.userId,
        incidentId: item.id,
      })) as { item: Detail | null };
      if (current === generation.current) {
        setDetail(data.item);
        setReviewReason("");
      }
    } catch (error) {
      if (current === generation.current) showError(error);
    }
  }
  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (revoked.current || !selected || !confirmed || busyRef.current) return;
    const body = {
      eventId,
      userId: selected.userId,
      confirmedTarget: true,
      type,
      reason,
      decision,
      restrictionDays: decision === "request_restriction" ? Number(days) : null,
    };
    const mutationView = generation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      await call("record", { ...body, operationId: operationId(body) });
      operation.current = null;
      setReason("");
      setType("");
      setDecision("");
      setDays("");
      setNotice(
        decision === "request_restriction"
          ? "Запрос отправлен менеджеру. Ограничение ещё не действует."
          : "Запись и решение сохранены с аудитом.",
      );
      if (mutationView === generation.current) await load(selected, true);
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function review(request: HistoryEvent, approve: boolean) {
    if (
      !selected ||
      !detail ||
      !access?.canRestrict ||
      reviewReason.replace(/\s/gu, "").length < 3 ||
      busyRef.current
    )
      return;
    const body = {
      incidentId: detail.id,
      expectedVersion: Math.max(...detail.history.map((e) => e.sequence)),
      kind: approve ? "restriction_approved" : "restriction_rejected",
      reason: reviewReason,
      decision: approve ? "restrict_temporary" : null,
      restrictionDays: approve ? request.requestedDays : null,
      referenceEventId: request.id,
      replacementType: null,
    };
    const mutationView = generation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      await call("append", { ...body, operationId: operationId(body) });
      operation.current = null;
      setNotice(
        approve
          ? "Решение менеджера сохранено. Подключение фактического ограничения к допуску ещё не включено."
          : "Запрос отклонён. Другие действующие решения не изменены.",
      );
      if (mutationView === generation.current) await load(selected, true);
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function appendNote() {
    if (
      !selected ||
      !detail ||
      detail.limited ||
      busyRef.current ||
      reviewReason.replace(/\s/gu, "").length < 3
    )
      return;
    const kind =
      appendKind === "appeal_resolution" && appealDecision === "uphold"
        ? "appeal_upheld"
        : appendKind;
    if (appendKind === "appeal_resolution" && !appealDecision) return;
    if (
      (kind === "appeal" || kind === "appeal_resolution" || kind === "appeal_upheld") &&
      !referenceId
    )
      return;
    if ((kind === "appeal_resolution" || kind === "appeal_upheld") && !access?.canRestrict) return;
    const body = {
      incidentId: detail.id,
      expectedVersion: Math.max(...detail.history.map((e) => e.sequence)),
      kind,
      reason: reviewReason,
      decision: kind === "appeal_resolution" ? appealDecision : null,
      restrictionDays: null,
      referenceEventId:
        kind === "appeal" || kind === "appeal_resolution" || kind === "appeal_upheld"
          ? referenceId
          : null,
      replacementType: kind === "correction" && replacementType ? replacementType : null,
    };
    const mutationView = generation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      await call("append", { ...body, operationId: operationId(body) });
      operation.current = null;
      setNotice("Событие добавлено в историю. Исходная запись не перезаписана.");
      if (mutationView === generation.current) await load(selected, true);
      setReferenceId("");
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const pending =
    detail?.history.filter(
      (e) =>
        e.kind === "restriction_request" &&
        !detail.history.some(
          (r) =>
            ["restriction_approved", "restriction_rejected"].includes(r.kind) &&
            r.referenceEventId === e.id,
        ),
    ) ?? [];
  return (
    <section className="aw-workspace iw-root mx-auto max-w-[1376px] px-5 py-10 sm:px-8">
      <aside className="iw-guidance" aria-label="Постоянная памятка">
        <strong>Памятка для всех ролей</strong>
        <p>
          Проверьте точный ID человека. Обязательно оставьте фактическую пометку о случившемся и
          основании решения. QR служит только поиском. Запрос воркера на ограничение до 90 дней
          действует лишь после отдельного решения менеджера.
        </p>
      </aside>
      {notice && (
        <p className="aw-message" role="status">
          {notice}
        </p>
      )}
      <div className="aw-toolbar">
        <label className="iw-grow">
          Мероприятие
          <select
            value={eventId}
            disabled={busy || !events.length}
            onChange={(e) => {
              setEventId(e.target.value);
              clear();
            }}
          >
            <option value="">Выберите мероприятие</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <span>
          {access
            ? access.canRestrict
              ? "Менеджер нарушений"
              : "Воркер мероприятия"
            : "Доступ не подтверждён"}
        </span>
      </div>
      <form
        className="aw-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <select
          aria-label="Способ поиска"
          value={mode}
          disabled={busy}
          onChange={(e) => {
            setMode(e.target.value as typeof mode);
            setQuery("");
            clear();
          }}
        >
          <option value="id">По ID</option>
          <option value="name">По имени</option>
          <option value="qr">По QR</option>
        </select>
        <input
          className="iw-grow"
          aria-label="Значение поиска"
          value={query}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
            clear();
          }}
          maxLength={128}
          autoComplete="off"
          placeholder={mode === "qr" ? "VNE1:…" : "Точный ID или имя"}
        />
        <button className="aw-button" disabled={busy || !eventId || !query.trim()}>
          Найти
        </button>
      </form>
      <div className="iw-candidates">
        {candidates.map((c) => (
          <button key={c.userId} type="button" disabled={busy} onClick={() => void load(c)}>
            <strong>{c.displayName}</strong>
            <code>{c.userId}</code>
            <span>Выбрать</span>
          </button>
        ))}
      </div>
      {selected && (
        <>
          <article className="iw-card">
            <h2>{selected.displayName}</h2>
            <code>{selected.userId}</code>
            <label className="iw-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Я проверил(а) ID и подтверждаю выбранного человека.
            </label>
            {summary && (
              <p>
                Записей: {summary.totalRecords} · Ожидают решения: {summary.pendingReview} ·
                Ограничений: {summary.activeRestrictions}
              </p>
            )}
            <small>
              Сводка относится к выбранному мероприятию. Количество не назначает меры автоматически.
            </small>
          </article>
          <form className="aw-form iw-card" onSubmit={(e) => void record(e)}>
            <h2>Зафиксировать случай</h2>
            <div className="iw-grid">
              <label>
                Тип
                <select
                  required
                  value={type}
                  onChange={(e) => setType(e.target.value as IncidentType)}
                >
                  <option value="">Выберите тип</option>
                  {INCIDENT_TYPES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Решение
                <select
                  required
                  value={decision}
                  onChange={(e) => {
                    setDecision(e.target.value as Decision);
                    setDays("");
                  }}
                >
                  <option value="">Выберите решение</option>
                  {DECISIONS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Обязательная пометка по факту нарушения
              <textarea
                required
                minLength={3}
                maxLength={1000}
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Наблюдаемый факт, контекст и основание решения."
              />
            </label>
            {decision === "request_restriction" && (
              <label>
                Запрашиваемый срок, дней
                <input
                  required
                  type="number"
                  min={1}
                  max={90}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
                <small>Это запрос менеджеру. До одобрения ограничение не действует.</small>
              </label>
            )}
            <button className="aw-button" disabled={busy || !confirmed || !access?.canRecord}>
              Сохранить запись
            </button>
          </form>
          <section className="iw-card">
            <h2>История случаев</h2>
            {summary?.limited && (
              <p>Список ограничен; счётчики относятся ко всей истории этого мероприятия.</p>
            )}
            {summary?.items.map((item) => (
              <button
                className="iw-row"
                key={item.id}
                type="button"
                onClick={() => void open(item)}
              >
                <span>
                  {labels[item.decision ?? ""] ?? "Ожидает решения"}
                  {item.restrictionRequestPending ? " · запрос менеджеру" : ""}
                </span>
                <code>{item.id}</code>
                <span>Открыть</span>
              </button>
            ))}
          </section>
        </>
      )}
      {detail && (
        <section className="iw-card">
          <div className="iw-row">
            <h2>История записи</h2>
            <button
              type="button"
              onClick={() => {
                generation.current++;
                setDetail(null);
                setReviewReason("");
              }}
            >
              Закрыть
            </button>
          </div>
          <p>{detail.originalReason}</p>
          {detail.history.map((e) => (
            <article className="iw-history" key={e.id}>
              <strong>
                {e.kind} · версия {e.sequence}
              </strong>
              <p>{e.reason}</p>
              <small>
                {e.recordedAt} · {e.actorId}
              </small>
              {e.requestedDays && (
                <p>Запрошено: {e.requestedDays} дней. Запрос не активирует ограничение.</p>
              )}
            </article>
          ))}
          {access?.canRestrict && pending.length > 0 && (
            <div>
              <label>
                Обязательная пометка менеджера
                <textarea
                  minLength={3}
                  maxLength={1000}
                  rows={3}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                />
              </label>
              {pending.map((e) => (
                <div className="aw-toolbar" key={e.id}>
                  <button
                    type="button"
                    className="aw-button"
                    disabled={busy || reviewReason.replace(/\s/gu, "").length < 3 || detail.limited}
                    onClick={() => void review(e, true)}
                  >
                    Одобрить запрос на {e.requestedDays} дней
                  </button>
                  <button
                    type="button"
                    className="aw-button secondary"
                    disabled={busy || reviewReason.replace(/\s/gu, "").length < 3 || detail.limited}
                    onClick={() => void review(e, false)}
                  >
                    Отклонить
                  </button>
                </div>
              ))}
            </div>
          )}
          <section className="iw-history">
            <h3>Добавить событие в историю</h3>
            <label>
              Действие
              <select
                value={appendKind}
                disabled={busy}
                onChange={(e) => {
                  setAppendKind(e.target.value);
                  setReferenceId("");
                  setReviewReason("");
                }}
              >
                <option value="account_note">Заметка к аккаунту по этому случаю</option>
                <option value="correction">Исправление фактической пометки</option>
                <option value="appeal">Обжалование решения</option>
                {access?.canRestrict && (
                  <option value="appeal_resolution">Решение менеджера по обжалованию</option>
                )}
              </select>
            </label>
            {appendKind === "correction" && (
              <label>
                Уточнённый тип (при необходимости)
                <select
                  value={replacementType}
                  onChange={(e) => setReplacementType(e.target.value)}
                >
                  <option value="">Тип без изменения</option>
                  {INCIDENT_TYPES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(appendKind === "appeal" || appendKind === "appeal_resolution") && (
              <label>
                Конкретное решение / обращение
                <select value={referenceId} onChange={(e) => setReferenceId(e.target.value)}>
                  <option value="">Выберите запись</option>
                  {detail.history
                    .filter((e) =>
                      appendKind === "appeal"
                        ? ["decision", "appeal_resolution", "restriction_approved"].includes(e.kind)
                        : e.kind === "appeal" &&
                          !detail.history.some(
                            (r) =>
                              ["appeal_resolution", "appeal_upheld"].includes(r.kind) &&
                              r.referenceEventId === e.id,
                          ),
                    )
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        Версия {e.sequence}: {labels[e.decision ?? ""] ?? e.kind}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {appendKind === "appeal_resolution" && (
              <label>
                Решение
                <select value={appealDecision} onChange={(e) => setAppealDecision(e.target.value)}>
                  <option value="">Выберите решение</option>
                  <option value="uphold">Оставить решение и срок без изменений</option>
                  {DECISIONS.filter(([id]) => id !== "request_restriction").map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>
                  Новое ограничение до 90 дней оформляется отдельным запросом и рассмотрением.
                </small>
              </label>
            )}
            <label>
              Обязательная фактическая пометка
              <textarea
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                minLength={3}
                maxLength={1000}
                rows={3}
              />
            </label>
            <button
              className="aw-button"
              type="button"
              disabled={
                busy ||
                detail.limited ||
                reviewReason.replace(/\s/gu, "").length < 3 ||
                ((appendKind === "appeal" || appendKind === "appeal_resolution") && !referenceId) ||
                (appendKind === "appeal_resolution" && !appealDecision)
              }
              onClick={() => void appendNote()}
            >
              Добавить в историю
            </button>
          </section>
          {detail.limited && (
            <p>История ограничена. Решения отключены до загрузки полной версии.</p>
          )}
        </section>
      )}
    </section>
  );
}
