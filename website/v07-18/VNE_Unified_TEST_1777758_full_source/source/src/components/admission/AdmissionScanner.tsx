import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { qrAdmissionCommand } from "@/lib/admission/admission.functions";
import {
  isAdmissionToken,
  type AdmissionCommandInput,
  type AdmissionEvent,
  type AdmissionReceipt,
} from "@/lib/admission/contract";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
import { qrMessage } from "./OwnerPassModel";
import "./OwnerPass.css";
type Checkin = Extract<AdmissionCommandInput, { action: "checkin" }>;
export function AdmissionScanner() {
  const run = useServerFn(qrAdmissionCommand);
  const [events, setEvents] = useState<AdmissionEvent[]>([]),
    [eventId, setEventId] = useState(""),
    [token, setToken] = useState("");
  const [verified, setVerified] = useState<AdmissionReceipt | null>(null),
    [pending, setPending] = useState<Checkin | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    lock = useRef<object | null>(null);
  useEffect(() => {
    const cancel = () => {
      ++epoch.current;
      lock.current = null;
    };
    const clear = () => {
      cancel();
      setToken("");
      setVerified(null);
      setPending(null);
      setBusy(false);
      setMessage("Скрытие страницы очищает скан. Перед следующим действием проверьте код заново.");
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DRAFT_SIGNOUT_EVENT);
    if (channel) channel.onmessage = clear;
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", clear);
    window.addEventListener(DRAFT_SIGNOUT_EVENT, clear);
    return () => {
      cancel();
      channel?.close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener(DRAFT_SIGNOUT_EVENT, clear);
    };
  }, []);
  async function command(input: AdmissionCommandInput) {
    if (lock.current || document.hidden) return;
    const sequence = ++epoch.current,
      attempt = {};
    lock.current = attempt;
    setBusy(true);
    setMessage("");
    const result = await run({ data: input }).catch(() => null);
    if (sequence !== epoch.current || lock.current !== attempt || document.hidden) return;
    lock.current = null;
    setBusy(false);
    if (!result || !result.ok) {
      setMessage(
        input.action === "checkin" && (!result || result.reason === "unavailable")
          ? "Ответ потерян. Повторите ту же команду, не сканируя новый код."
          : qrMessage(result?.reason ?? "unavailable"),
      );
      if (input.action === "checkin" && result && result.reason !== "unavailable") setPending(null);
      return;
    }
    if (input.action === "catalog") {
      setEvents(result.events);
      setEventId(result.events[0]?.eventId ?? "");
      setToken("");
      setVerified(null);
      setMessage(
        result.events.length
          ? "Выберите назначенное событие и проверьте QR."
          : "Нет назначенных синтетических событий.",
      );
      return;
    }
    const receipt = result.receipt;
    if (!receipt || receipt.eventId !== eventId) {
      setMessage(qrMessage("unavailable"));
      return;
    }
    if (input.action === "verify") {
      setVerified(receipt.outcome === "ready" && receipt.version !== null ? receipt : null);
      setMessage(qrMessage(receipt.outcome));
    }
    if (input.action === "checkin") {
      setPending(null);
      setVerified(null);
      setToken("");
      setMessage(
        `${result.replayed ? "Повтор той же команды: " : ""}${qrMessage(receipt.outcome)}`,
      );
    }
  }
  return (
    <section className="owner-qr">
      <h1>Сканер TEST</h1>
      <p className="owner-message">
        Только симуляция. Проверка QR и регистрация первичного входа выполняются отдельными
        действиями. Повторный вход выключен.
      </p>
      <p>
        <a className="owner-text-button" href="/scanner/mfa">
          Подтвердить собственный MFA сканера
        </a>
      </p>
      <button
        className="owner-button owner-button-secondary"
        type="button"
        disabled={busy || !!pending}
        onClick={() => void command({ action: "catalog" })}
      >
        Загрузить назначенные события
      </button>
      <form
        className="owner-rotate"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isAdmissionToken(token) || !eventId || pending) {
            setMessage(qrMessage("invalid_token"));
            return;
          }
          setVerified(null);
          void command({ action: "verify", eventId, token });
        }}
      >
        <label>
          Событие
          <select
            value={eventId}
            disabled={busy || !!pending}
            onChange={(event) => {
              setEventId(event.target.value);
              setToken("");
              setVerified(null);
            }}
          >
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventTitle}
              </option>
            ))}
          </select>
        </label>
        <label>
          Непрозрачный код VNE2
          <input
            type="password"
            value={token}
            autoComplete="off"
            spellCheck={false}
            maxLength={48}
            disabled={busy || !!pending}
            onChange={(event) => {
              setToken(event.target.value);
              setVerified(null);
            }}
          />
        </label>
        <div className="owner-actions">
          <button
            className="owner-button"
            type="submit"
            disabled={busy || !!pending || !eventId || !token}
          >
            Проверить QR
          </button>
          <button
            className="owner-button owner-button-secondary"
            type="button"
            disabled={
              busy || !!pending || verified?.outcome !== "ready" || verified.version === null
            }
            onClick={() => {
              if (!verified || verified.version === null || lock.current || pending) return;
              const request: Checkin = {
                action: "checkin",
                eventId,
                token,
                expectedVersion: verified.version,
                operationId: crypto.randomUUID(),
              };
              setPending(request);
              void command(request);
            }}
          >
            Зарегистрировать первичный вход
          </button>
        </div>
      </form>
      {pending && (
        <button
          className="owner-button"
          type="button"
          disabled={busy}
          onClick={() => void command(pending)}
        >
          Повторить ту же команду входа
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
