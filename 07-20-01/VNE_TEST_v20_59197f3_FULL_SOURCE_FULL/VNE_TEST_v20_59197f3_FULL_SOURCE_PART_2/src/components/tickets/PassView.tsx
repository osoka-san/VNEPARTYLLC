import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, RotateCw, MoveHorizontal, Pause, Play, ScanLine, X } from "lucide-react";
import HangingBadge from "./HangingBadge";
import BrandMark from "./BrandMark";
import QrCode from "./QrCode";
import { passQrPalette } from "@/lib/qr-studio/pass-palette";
import { TICKET_DESIGNS, PASS_ACCESS, getDesign, makeDemoPass, eventDate } from "./ticket-designs";
import type { PassAccess, PassDTO } from "./types";
import "@/styles/tickets/base.css";
import "@/styles/tickets/pass.css";

const PHYSICS = Object.freeze({ gravity: 0.45, damping: 0.98, stiffness: 14, wind: 0 });

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function TicketStage({
  pass,
  flipped = false,
  onFlip = () => {},
  paused = false,
  compact = false,
  onQrStatus,
}: {
  pass: PassDTO;
  flipped?: boolean;
  onFlip?: () => void;
  paused?: boolean;
  compact?: boolean;
  onQrStatus?: ((status: "building" | "verified" | "fallback") => void) | undefined;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(500);
  const design = getDesign(pass.access);
  useEffect(() => {
    if (!ref.current) return;
    const ob = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, []);
  const w = Math.min(360, width - 32);
  const h = (w * 570) / 360;
  const badge = {
    ...pass,
    lanyardText: `ВНЕ • ${design.label} • ВНЕ`,
    number: "ВНЕ",
    strapColor: design.strap,
    strapEdge: design.edge,
  };
  return (
    <div
      ref={ref}
      className={`vne-stage ${compact ? "vne-stage-compact" : ""}`}
      style={{ height: h + 175 }}
    >
      <HangingBadge
        onQrStatus={onQrStatus}
        badge={badge}
        anchorX={width / 2}
        anchorY={-50}
        cardWidth={w}
        cardHeight={h}
        physicsParams={PHYSICS}
        isFlipped={flipped}
        onToggleFlip={onFlip}
        paused={paused}
      />
    </div>
  );
}

/** Лист дизайна (обе стороны). Используется только в защищённом /admin/tickets. */
export function DesignSheet({
  initialType = "GENERAL",
  still = false,
}: {
  initialType?: PassAccess;
  still?: boolean;
}) {
  const [type, setType] = useState<PassAccess>(initialType);
  const reduced = useReducedMotion();
  const design = getDesign(type);
  const pass = makeDemoPass(type);
  return (
    <div
      className={`vne-design-sheet vne-sheet-${type.toLowerCase()}`}
      style={{ "--sheet-accent": design.accent } as CSSProperties}
    >
      <header>
        <BrandMark />
        <span>PRIVATE EVENTS / ACCESS OBJECTS</span>
        <span>DESIGN {design.serial} / 04</span>
      </header>
      <div className="vne-sheet-title">
        <div>
          <span className="vne-micro">КОЛЛЕКЦИЯ ПЕРСОНАЛЬНЫХ ПРОПУСКОВ</span>
          <h1>{design.label}</h1>
        </div>
        <p>
          {design.description}
          <br />
          Две стороны одной ночи.
        </p>
      </div>
      <section className="vne-sheet-cards">
        <div>
          <TicketStage pass={pass} paused={still || reduced} />
          <div className="vne-sheet-side">
            <span>01 / ЛИЦЕВАЯ СТОРОНА</span>
            <i>IDENTITY</i>
          </div>
        </div>
        <div>
          <TicketStage pass={pass} flipped paused={still || reduced} />
          <div className="vne-sheet-side">
            <span>02 / ОБОРОТНАЯ СТОРОНА</span>
            <i>ACCESS</i>
          </div>
        </div>
      </section>
      <footer>
        <span>ВНЕ / МУЗЫКА. ПРОСТРАНСТВО. ЛЮДИ.</span>
        <span>ДЕМО-ДАННЫЕ · QR НЕ ДАЁТ ВХОДА</span>
        <span>ЛИЧНЫЙ ПРОПУСК ↗</span>
      </footer>
      {!still && (
        <nav className="vne-design-nav" aria-label="Тип карточки">
          {PASS_ACCESS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              aria-pressed={type === key}
            >
              {TICKET_DESIGNS[key].label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/**
 * Персональная карточка. preview=true — только синтетика для защищённого просмотра в админке.
 * Просмотр и flip никогда не погашают код: компонент не делает сетевых запросов.
 */
export default function PassView({ pass, preview = false }: { pass: PassDTO; preview?: boolean }) {
  const [type, setType] = useState<PassAccess>(pass.access);
  const [flipped, setFlipped] = useState(false);
  const [paused, setPaused] = useState(false);
  const [scan, setScan] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const reduced = useReducedMotion();
  const ticket = preview ? makeDemoPass(type) : pass;
  const design = getDesign(ticket.access);
  const active = !preview && ticket.status === "active";
  useEffect(() => {
    if (scan) dialog.current?.showModal();
    else dialog.current?.close();
  }, [scan]);
  const Root = preview ? "div" : "main";
  return (
    <Root className="vne-pass" style={{ "--vne-accent": design.accent } as CSSProperties}>
      <header className="vne-header">
        <a href="/" aria-label="ВНЕ — главная">
          <BrandMark />
        </a>
        <span>PRIVATE EVENTS / PERSONAL ACCESS</span>
        <span className="vne-status">
          <i />
          {preview ? "ПРЕДПРОСМОТР" : active ? "ПРОПУСК АКТИВЕН" : "ПРОПУСК НЕДЕЙСТВИТЕЛЕН"}
        </span>
      </header>
      <div className="vne-layout">
        <section className="vne-intro">
          <span className="vne-kicker">ПЕРСОНАЛЬНЫЙ ПРОПУСК / {design.short}</span>
          <h1>
            Эта ночь.
            <br />
            <em>Твой доступ.</em>
          </h1>
          <p className="vne-lead">
            За пределами привычного.
            <br />В кругу своих.
          </p>
          <div className="vne-event-info">
            <span>СОБЫТИЕ</span>
            <strong>{ticket.event.title}</strong>
            <span>ДАТА</span>
            <strong>{eventDate(ticket.event)}</strong>
          </div>
          <details className="vne-pass-details">
            <summary>Полные данные пропуска</summary>
            <dl>
              <dt>Имя</dt>
              <dd>{ticket.name || ticket.telegram || "—"}</dd>
              <dt>Событие</dt>
              <dd>{ticket.event.title}</dd>
              <dt>Начало / первый шаттл</dt>
              <dd>{ticket.event.shuttleTime || "Уточняется"}</dd>
              <dt>Сбор и отправление трансфера</dt>
              <dd>{ticket.event.meetingPoint || ticket.event.venue || "Уточняется"}</dd>
              <dt>ID выпущенного билета</dt>
              <dd>{ticket.ticketCode || ticket.id}</dd>
            </dl>
          </details>
          <div className="vne-invitation-note">
            <ArrowUpRight size={22} />
            <p>
              {preview
                ? "Здесь показаны демонстрационные данные. Это не анонс события и не действующий билет."
                : "Твой пропуск готов. Информация о трансфере и QR находятся на обороте."}
            </p>
          </div>
          {preview && (
            <nav className="vne-type-picker" aria-label="Тип пропуска">
              {PASS_ACCESS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setType(id);
                    setFlipped(false);
                  }}
                  aria-pressed={type === id}
                >
                  <i style={{ background: TICKET_DESIGNS[id].accent }} />
                  {TICKET_DESIGNS[id].label}
                </button>
              ))}
            </nav>
          )}
          <span className="vne-intro-small">Ссылка персональная. Сохрани её для входа.</span>
        </section>
        <section className="vne-exhibit" aria-label="Анимированная карточка">
          <div className="vne-exhibit-top">
            <span>ВНЕ / {design.eyebrow}</span>
            <span>{ticket.sequenceLabel || "—"}</span>
          </div>
          <TicketStage
            pass={ticket}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
            paused={paused || scan || reduced}
          />
          <div className="vne-card-controls">
            <button
              type="button"
              className="vne-flip-button"
              onClick={() => setFlipped((f) => !f)}
              aria-pressed={flipped}
            >
              <ScanLine size={17} />
              {flipped ? "ЛИЦЕВАЯ СТОРОНА" : "ПОКАЗАТЬ QR"}
              <RotateCw size={16} />
            </button>
            <div className="vne-motion-controls">
              <button
                type="button"
                disabled={reduced}
                onClick={() => {
                  setPaused(false);
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() =>
                      window.dispatchEvent(
                        new CustomEvent("vne-pass-sway", { detail: { fx: 20, fy: 0 } }),
                      ),
                    ),
                  );
                }}
              >
                <MoveHorizontal size={16} />
                Качнуть
              </button>
              <button
                type="button"
                disabled={reduced}
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Включить движение" : "Остановить движение"}
              >
                {paused || reduced ? <Play size={15} /> : <Pause size={15} />}
              </button>
              {flipped && (preview || ticket.qrText) && (
                <button type="button" onClick={() => setScan(true)}>
                  Увеличить QR ↗
                </button>
              )}
            </div>
          </div>
          <p className="vne-drag-hint">Потяни карту · отпусти · почувствуй движение</p>
        </section>
      </div>
      <footer className="vne-footer">
        <span>ВНЕ / МУЗЫКА. ПРОСТРАНСТВО. ЛЮДИ.</span>
        <span>{preview ? "ОБРАЗЕЦ · НЕ ДЛЯ ВХОДА" : ticket.ticketCode || ticket.shortId}</span>
      </footer>
      <dialog
        ref={dialog}
        className="vne-scan-dialog"
        style={{
          background: passQrPalette(ticket.access).bg,
          color: passQrPalette(ticket.access).fg,
        }}
        onCancel={() => setScan(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setScan(false);
        }}
      >
        <button type="button" onClick={() => setScan(false)} aria-label="Закрыть QR">
          <X />
        </button>
        <BrandMark />
        <h2>{preview ? "Демо-пропуск" : "Покажи на входе"}</h2>
        {scan && <QrCode value={ticket.qrText} design={ticket.design} access={ticket.access} />}
        <strong>{ticket.name || ticket.telegram}</strong>
        <p>
          {design.label} · {ticket.sequenceLabel}
        </p>
        <small>
          {preview
            ? "Этот QR не даёт права входа."
            : "Сканирование сотрудником подтверждает проход."}
        </small>
      </dialog>
    </Root>
  );
}
