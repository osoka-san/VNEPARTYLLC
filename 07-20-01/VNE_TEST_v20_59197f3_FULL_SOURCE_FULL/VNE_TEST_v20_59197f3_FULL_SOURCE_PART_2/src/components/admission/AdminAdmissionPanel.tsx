import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { qrAdmissionCommand } from "@/lib/admission/admission.functions";
import type { AdmissionCommandInput, AdmissionEvent } from "@/lib/admission/contract";
import { qrMessage } from "./OwnerPassModel";
import "./OwnerPass.css";
export function AdminAdmissionPanel() {
  const run = useServerFn(qrAdmissionCommand),
    lock = useRef(false);
  const [events, setEvents] = useState<AdmissionEvent[]>([]),
    [eventId, setEventId] = useState(""),
    [participation, setParticipation] = useState(""),
    [version, setVersion] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<AdmissionCommandInput | null>(null);
  async function command(input: AdmissionCommandInput) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await run({ data: input });
      if (!result.ok) {
        setMessage(qrMessage(result.reason));
        if (result.reason !== "unavailable") setPending(null);
        return;
      }
      if (input.action === "catalog") {
        setEvents(result.events);
        setEventId(result.events[0]?.eventId ?? "");
      } else {
        setPending(null);
        setConfirmed(false);
        setMessage(qrMessage(result.receipt?.outcome ?? "unavailable"));
      }
    } catch {
      setMessage(qrMessage(input.action === "revoke" ? "lost_reply" : "unavailable"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="owner-qr">
      <h1>Управление пропуском TEST</h1>
      <p className="owner-message">
        Отзыв проверяется сервером по текущему участию, роли, назначению и MFA. Сам доступ к этому
        экрану прав не добавляет.
      </p>
      <button
        type="button"
        className="owner-button owner-button-secondary"
        disabled={busy || !!pending}
        onClick={() => void command({ action: "catalog" })}
      >
        Загрузить назначенные события
      </button>
      <form
        className="owner-rotate"
        onSubmit={(event) => {
          event.preventDefault();
          const expectedVersion = Number(version);
          if (
            !confirmed ||
            !eventId ||
            !/^[0-9a-f-]{36}$/.test(participation) ||
            !Number.isInteger(expectedVersion) ||
            expectedVersion < 0 ||
            !version ||
            reason.trim().length < 3 ||
            lock.current ||
            pending
          )
            return;
          const input: AdmissionCommandInput = {
            action: "revoke",
            eventId,
            participationId: participation,
            expectedVersion,
            reason: reason.trim(),
            operationId: crypto.randomUUID(),
          };
          setPending(input);
          void command(input);
        }}
      >
        <label>
          Событие
          <select
            value={eventId}
            disabled={busy || !!pending}
            onChange={(event) => setEventId(event.target.value)}
          >
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventTitle}
              </option>
            ))}
          </select>
        </label>
        <label>
          ID участия
          <input
            type="text"
            value={participation}
            autoComplete="off"
            disabled={busy || !!pending}
            onChange={(event) => setParticipation(event.target.value)}
            required
          />
        </label>
        <label>
          Текущая версия пропуска
          <input
            type="number"
            min="0"
            step="1"
            value={version}
            disabled={busy || !!pending}
            onChange={(event) => setVersion(event.target.value)}
            required
          />
        </label>
        <label>
          Причина отзыва
          <input
            type="text"
            minLength={3}
            maxLength={300}
            value={reason}
            disabled={busy || !!pending}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </label>
        <label className="owner-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy || !!pending}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Подтверждаю отзыв этого тестового пропуска.
        </label>
        <button className="owner-button" type="submit" disabled={!confirmed || busy || !!pending}>
          Отозвать пропуск
        </button>
      </form>
      {pending && (
        <button
          type="button"
          className="owner-button"
          disabled={busy}
          onClick={() => void command(pending)}
        >
          Повторить ту же команду
        </button>
      )}
      {message && (
        <p className="owner-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
