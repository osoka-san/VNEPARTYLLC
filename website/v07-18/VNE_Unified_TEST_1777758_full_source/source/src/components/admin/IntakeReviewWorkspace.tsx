import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
import { incidentAction } from "@/lib/incidents/incidents.functions";
import "./workspace.css";
import "./incidents.css";
type Receipt = { requestId: string; ownerUserId: string; status: string; createdAt: string };
type Intake = Receipt & {
  displayName: string;
  contactEmail: string;
  telegramUsername: string;
  consentVersion: string;
  questionnaire: {
    age: number;
    questions: { id: string; label: string; answers: { text: string; source: string }[] }[];
    ratings: { id: string; label: string; minLabel: string; maxLabel: string; value: number }[];
  };
};
const statuses: Record<string, string> = {
  pending: "Ожидает ревью",
  approved: "Одобрена",
  rejected: "Отклонена",
};
export function IntakeReviewWorkspace() {
  const action = useServerFn(incidentAction);
  const [items, setItems] = useState<Receipt[]>([]),
    [page, setPage] = useState(0),
    [filter, setFilter] = useState<string | null>("pending"),
    [hasMore, setHasMore] = useState(false);
  const [item, setItem] = useState<Intake | null>(null),
    [note, setNote] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const revoked = useRef(false);
  const generation = useRef(0),
    operation = useRef<{ body: string; id: string } | null>(null),
    busyRef = useRef(false);
  async function invoke(kind: "intakeList" | "intakeRead" | "intakeReview", payload: unknown) {
    if (revoked.current) throw new Error("Сеанс завершён. Войдите заново.");
    const current = generation.current;
    const r = await action({ data: { action: kind, payload } });
    if (revoked.current || current !== generation.current)
      throw new Error("Состояние страницы изменилось. Обновите её.");
    if (!r.ok)
      throw new Error(
        r.reason === "unconfigured"
          ? "Раздел ещё не подключён к TEST. Данные не запрашиваются."
          : r.reason === "mfa"
            ? "Нужна двухфакторная проверка."
            : r.reason === "forbidden" || r.reason === "signin"
              ? "Нет отдельного права ревью анкет в текущей Supabase-сессии."
              : r.reason === "conflict"
                ? "Статус изменился. Обновите список."
                : "Действие не выполнено. Проверьте поля или повторите.",
      );
    return JSON.parse(r.dataJson) as unknown;
  }
  useEffect(() => {
    let alive = true;
    const current = ++generation.current;
    setItem(null);
    setNote("");
    void invoke("intakeList", { status: filter, page })
      .then((v) => {
        if (!alive || current !== generation.current) return;
        const d = v as { items: Receipt[]; hasMore: boolean };
        setItems(d.items.slice(0, 25));
        setHasMore(d.hasMore);
        setNotice("");
      })
      .catch((e) => alive && setNotice(e instanceof Error ? e.message : "Список недоступен."));
    return () => {
      alive = false;
    };
  }, [action, page, filter]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        generation.current++;
        setItem(null);
        setNote("");
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    const signout = () => {
      revoked.current = true;
      generation.current++;
      setItems([]);
      setItem(null);
      setNote("");
      setHasMore(false);
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
  async function open(receipt: Receipt) {
    if (revoked.current || busyRef.current) return;
    const current = ++generation.current;
    setItem(null);
    setNote("");
    try {
      const d = (await invoke("intakeRead", { requestId: receipt.requestId })) as {
        item: Intake | null;
      };
      if (current === generation.current) setItem(d.item);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Анкета недоступна.");
    }
  }
  async function review(decision: "approved" | "rejected") {
    if (
      revoked.current ||
      !item ||
      item.status !== "pending" ||
      note.replace(/\s/gu, "").length < 3 ||
      busyRef.current
    )
      return;
    const body = { requestId: item.requestId, expectedStatus: "pending", decision, reason: note };
    const key = JSON.stringify(body);
    if (operation.current?.body !== key) operation.current = { body: key, id: crypto.randomUUID() };
    busyRef.current = true;
    setBusy(true);
    try {
      await invoke("intakeReview", { ...body, operationId: operation.current.id });
      operation.current = null;
      setNotice("Решение сохранено с аудитом. Приглашение и допуск на мероприятие не создавались.");
      setItem(null);
      setNote("");
      const d = (await invoke("intakeList", { status: filter, page })) as {
        items: Receipt[];
        hasMore: boolean;
      };
      setItems(d.items.slice(0, 25));
      setHasMore(d.hasMore);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Решение не сохранено.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="aw-workspace iw-root mx-auto max-w-[1376px] px-5 py-10 sm:px-8">
      <aside className="iw-guidance">
        <strong>Памятка для всех ролей</strong>
        <p>
          Открывайте только нужную анкету. Для каждого решения обязательна фактическая пометка.
          Одобрение общей анкеты не создаёт приглашение, билет, оплату или допуск на событие. Здесь
          только TEST.
        </p>
      </aside>
      {notice && (
        <p role="status" className="aw-message">
          {notice}
        </p>
      )}
      <label>
        Статус
        <select
          disabled={busy}
          value={filter ?? ""}
          onChange={(e) => {
            setFilter(e.target.value || null);
            setPage(0);
          }}
        >
          <option value="">Все</option>
          {Object.entries(statuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <section className="iw-card">
        <h2>Список без контактных данных</h2>
        {items.map((r) => (
          <button
            key={r.requestId}
            className="iw-row"
            type="button"
            disabled={busy}
            onClick={() => void open(r)}
          >
            <span>{statuses[r.status] ?? r.status}</span>
            <code>{r.requestId}</code>
            <span>Показать анкету</span>
          </button>
        ))}
        <div className="aw-toolbar">
          <button disabled={busy || page === 0} onClick={() => setPage((p) => p - 1)}>
            Назад
          </button>
          <span>Страница {page + 1}</span>
          <button
            disabled={busy || !hasMore || page >= 10000}
            onClick={() => setPage((p) => p + 1)}
          >
            Дальше
          </button>
        </div>
      </section>
      {item && (
        <article className="iw-card">
          <div className="iw-row">
            <h2>{item.displayName}</h2>
            <button
              type="button"
              onClick={() => {
                setItem(null);
                setNote("");
              }}
            >
              Скрыть
            </button>
          </div>
          <code>Заявка: {item.requestId}</code>
          <code>Аккаунт: {item.ownerUserId}</code>
          <p>Контакт из анкеты: {item.contactEmail}</p>
          <p>Telegram из анкеты: {item.telegramUsername}</p>
          <small>Контактные поля введены заявителем; это не подтверждение Auth email.</small>
          <p>Возраст из анкеты: {item.questionnaire.age}</p>
          {item.questionnaire.questions.map((q) => (
            <section className="iw-history" key={q.id}>
              <h3>{q.label}</h3>
              <ul>
                {q.answers.map((a, i) => (
                  <li key={i}>{a.text}</li>
                ))}
              </ul>
            </section>
          ))}
          {item.questionnaire.ratings.map((r) => (
            <p key={r.id}>
              {r.label}: {r.value}/100 · {r.minLabel} → {r.maxLabel}
            </p>
          ))}
          <p>Согласие: {item.consentVersion}</p>
          <label>
            Обязательная фактическая пометка
            <textarea
              maxLength={1000}
              minLength={3}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="aw-toolbar">
            <button
              className="aw-button"
              disabled={busy || item.status !== "pending" || note.replace(/\s/gu, "").length < 3}
              onClick={() => void review("approved")}
            >
              Одобрить общую анкету
            </button>
            <button
              className="aw-button secondary"
              disabled={busy || item.status !== "pending" || note.replace(/\s/gu, "").length < 3}
              onClick={() => void review("rejected")}
            >
              Отклонить с пометкой
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
