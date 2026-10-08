import { useBeginSiteLoading, useSiteLoading } from "@/components/loading/SiteLoading";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ticketAction } from "@/lib/tickets/tickets.functions";
import {
  scanToken,
  ticketError,
  type TicketEvent,
  type TicketResponse,
} from "@/lib/tickets/workspace-contract";
import "@/styles/tickets/workspace.css";
const outcomes: Record<string, string> = {
  ready: "Билет действителен",
  accepted: "Вход подтверждён",
  used: "Билет уже использован",
  revoked: "Билет отозван",
  expired: "Срок действия истёк",
  sandbox: "Тестовый билет — вход запрещён",
  event_unavailable: "Мероприятие закрыто",
  window_required: "Не настроено время входа",
  too_early: "Вход ещё не открыт",
  not_found: "Билет не найден на этом мероприятии",
  version_conflict: "Билет изменился — проверьте заново",
};
export default function TicketScanner({ enabled }: { enabled: boolean }) {
  const beginLoading = useBeginSiteLoading();
  const action = useServerFn(ticketAction),
    [events, setEvents] = useState<TicketEvent[]>([]),
    [eventId, setEvent] = useState(""),
    [text, setText] = useState(""),
    [result, setResult] = useState<TicketResponse | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false);
  useSiteLoading(busy, "Проверяем пропуск");
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    frame = useRef<number>(0),
    generation = useRef(0),
    operation = useRef<string | null>(null);
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    cancelAnimationFrame(frame.current);
    setCamera(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const finish = beginLoading("Открываем сканер");
    void action({ data: { action: "scanCatalog", body: {} } })
      .then((r) => {
        if (!alive) return;
        if (r.ok) setEvents(r.data.events ?? []);
        else setError(ticketError(r.error));
      })
      .catch(() => alive && setError("Список мероприятий не загрузился. Обновите страницу."))
      .finally(finish);
    return () => {
      alive = false;
      finish();
    };
  }, [enabled, action, beginLoading]);
  const clear = () => {
    setResult(null);
    operation.current = null;
    setError("");
  };
  async function start() {
    stop();
    setError("");
    const current = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera");
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      if (generation.current !== current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setCamera(true);
      if (!video.current) {
        stop();
        return;
      }
      video.current.srcObject = media;
      await video.current.play();
      const { default: jsQR } = await import("jsqr");
      if (generation.current !== current) return;
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      const tick = (time: number) => {
        if (!stream.current || generation.current !== current) return;
        const v = video.current;
        if (v && ctx && v.readyState >= 2 && time - last > 170) {
          last = time;
          canvas.width = Math.min(v.videoWidth, 900);
          canvas.height = Math.round((v.videoHeight * canvas.width) / v.videoWidth);
          if (canvas.height > 0) {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const code = jsQR(
              ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width,
              canvas.height,
              { inversionAttempts: "attemptBoth" },
            );
            if (code) {
              stop();
              clear();
              setText(code.data);
              if (!scanToken(code.data)) setError("В кадре другой QR. Нужен код билета ВНЕ.");
              return;
            }
          }
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch {
      stop();
      setError("Камера недоступна. Разрешите доступ к ней или вставьте код вручную.");
    }
  }
  async function check(consume = false) {
    if (busy) return;
    const token = scanToken(text);
    if (!token || !eventId) {
      setError("Выберите мероприятие и отсканируйте QR билета.");
      return;
    }
    setBusy(true);
    setError("");
    stop();
    try {
      if (consume && !operation.current) operation.current = crypto.randomUUID();
      const r = await action({
        data: {
          action: consume ? "checkin" : "verify",
          body: {
            eventId,
            token,
            ...(consume
              ? { expectedVersion: result?.pass?.version, operationId: operation.current }
              : {}),
          },
        },
      });
      if (!r.ok) throw new Error(r.error);
      setResult(r.data);
      if (!consume) operation.current = null;
    } catch (e) {
      setError(ticketError(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ticket-workspace tw-scan">
      <div className="ticket-workspace-bar">
        <div>
          <h2>Контроль входа</h2>
          <p>Проверка QR и подтверждение прохода</p>
        </div>
      </div>
      {!enabled && (
        <div className="tw-notice">
          Сканер недоступен: служебный вход и сервис билетов ещё не подключены.
        </div>
      )}
      <section className="tw-panel">
        <label>
          Мероприятие
          <select
            disabled={!enabled || busy}
            value={eventId}
            onChange={(e) => {
              setEvent(e.target.value);
              clear();
              stop();
            }}
          >
            <option value="">Выберите назначенное мероприятие</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.synthetic ? " · тест" : ""}
              </option>
            ))}
          </select>
        </label>
        <video
          ref={video}
          className="tw-camera"
          style={{ display: camera ? "block" : "none" }}
          playsInline
          muted
          aria-label="Камера для QR"
        />
        <div className="tw-inline">
          <button
            className="tw-button"
            disabled={!enabled || !eventId || busy}
            onClick={() => (camera ? stop() : void start())}
          >
            {camera ? "Выключить камеру" : "Включить камеру"}
          </button>
          <span className="tw-help">Поддерживается также внешний QR-сканер.</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <label style={{ marginTop: 24 }}>
            Код билета
            <textarea
              value={text}
              disabled={!enabled || busy}
              onChange={(e) => {
                setText(e.target.value);
                clear();
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="VNE1:…"
              maxLength={256}
              rows={2}
            />
          </label>
          <button
            className="tw-button tw-primary"
            disabled={!enabled || busy || !eventId || !scanToken(text)}
          >
            {busy ? "Проверка…" : "Проверить билет"}
          </button>
        </form>
        <p className="tw-help">
          Проверка не погашает билет. Вход фиксируется только кнопкой подтверждения ниже.
        </p>
        {error && (
          <p className="tw-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div
            className="tw-outcome"
            role="status"
            data-ready={["ready", "accepted"].includes(result.outcome ?? "")}
          >
            <h3>{outcomes[result.outcome ?? ""] ?? "Допуск не подтверждён"}</h3>
            {result.pass && (
              <p>
                {result.pass.name} · {result.pass.access} · № {result.pass.sequenceLabel}
              </p>
            )}
            {result.replayed && (
              <p>Показан результат предыдущего подтверждения. Новый проход не создавался.</p>
            )}
            {result.outcome === "ready" && (
              <button
                className="tw-button tw-primary"
                disabled={busy}
                onClick={() => void check(true)}
              >
                Подтвердить вход
              </button>
            )}
            {result.outcome === "accepted" && (
              <button
                className="tw-button"
                onClick={() => {
                  clear();
                  setText("");
                }}
              >
                Следующий гость
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
