import { memo, type CSSProperties } from "react";
import QrCode from "./QrCode";
import BrandMark from "./BrandMark";
import { getDesign, eventDate, type TicketDesign } from "./ticket-designs";
import type { PassDTO } from "./types";
import { designQrPalette } from "@/lib/qr-studio/reference-pass-palette";

function Engraving() {
  return (
    <svg className="vne-engraving" viewBox="0 0 360 220" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth=".65">
        {Array.from({ length: 16 }, (_, i) => (
          <path
            key={i}
            d={`M${-35 + i * 13} 225 L${100 + i * 13} 25 L${200 + i * 13} 25 L${65 + i * 13} 225`}
          />
        ))}
      </g>
      <path d="M0 187H360" stroke="currentColor" strokeOpacity=".3" />
    </svg>
  );
}

function CardHeader({
  badge,
  back,
  design,
}: {
  badge: PassDTO;
  back?: boolean;
  design: TicketDesign;
}) {
  return (
    <div className="vne-card-top">
      <BrandMark />
      <div className="vne-top-meta">
        <span>{back ? "ACCESS TYPE" : "USER ID"}</span>
        <strong>{back ? design.short : badge.userId || "—"}</strong>
      </div>
    </div>
  );
}

type Props = {
  badge: PassDTO;
  isFlipped?: boolean;
  glare?: { x: number; y: number; opacity: number };
  cardWidth?: number;
  cardHeight?: number;
  /** Принимаются от HangingBadge (как в исходнике), карточка их не использует. */
  onToggleFlip?: (() => void) | undefined;
  reducedMotion?: boolean;
  onQrStatus?: ((status: "building" | "verified" | "fallback") => void) | undefined;
};

export default memo(function BadgeCard({
  badge,
  isFlipped = false,
  glare = { x: 50, y: 50, opacity: 0.1 },
  cardWidth = 360,
  cardHeight = 570,
  onQrStatus,
}: Props) {
  const design = getDesign(badge.access);
  const qrPalette = designQrPalette(badge.access, badge.design);
  const sequence = badge.sequenceLabel || "—/—";
  const style = {
    width: cardWidth,
    height: cardHeight,
    "--ticket-scale": cardWidth / 360,
    "--ticket-accent": design.accent,
    "--ticket-qr-paper": qrPalette.bg,
    "--ticket-qr-ink": qrPalette.fg,
  } as CSSProperties;
  return (
    <div
      className={`vne-card vne-ticket-${(badge.access || "GENERAL").toLowerCase()} ${isFlipped ? "vne-flipped" : ""}`}
      style={style}
      data-ticket-type={badge.access}
      data-side={isFlipped ? "back" : "front"}
    >
      <section className="vne-face vne-front" aria-hidden={isFlipped}>
        <div className="vne-card-inner">
          <span className="vne-eyelet" aria-hidden="true" />
          <CardHeader badge={badge} design={design} />
          <div className="vne-front-event">
            <span className="vne-micro">PRIVATE EVENT / ВНЕ</span>
            <h2 title={badge.event.title}>{badge.event.title}</h2>
          </div>
          <div className="vne-person">
            <span className="vne-micro">
              {badge.access === "ARTIST" ? "ИМЯ / ARTIST" : "ИМЯ / ГОСТЬ"}
            </span>
            <strong title={badge.name || badge.telegram || undefined}>
              {badge.name || badge.telegram}
            </strong>
          </div>
          <div className="vne-role-art">
            <Engraving />
            <div className="vne-role-type">
              <span>{design.eyebrow}</span>
              {badge.access === "GENERAL" ? (
                <strong>
                  GUEST
                  <br />
                  <em>GENERAL</em>
                </strong>
              ) : badge.access === "SECURITY" ? (
                <strong>
                  SECURITY
                  <br />
                  <em>STAFF</em>
                </strong>
              ) : (
                <strong className="vne-role-large">{design.short}</strong>
              )}
            </div>
            <span className="vne-card-edition">
              {badge.access === "VIP" ? "VNE / PRIVATE EDITION" : `VNE / ${design.serial}`}
            </span>
          </div>
          <div className="vne-front-strip">
            <div>
              <span>ТИП ПРОПУСКА</span>
              <strong>{design.label}</strong>
            </div>
            <div>
              <span>ДАТА СОБЫТИЯ</span>
              <strong>{eventDate(badge.event)}</strong>
            </div>
          </div>
        </div>
        <div
          className="vne-glare"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%,rgba(255,255,255,${Math.min(glare.opacity, 0.2)}),transparent 65%)`,
          }}
        />
      </section>
      <section className="vne-face vne-back" aria-hidden={!isFlipped}>
        <div className="vne-card-inner">
          <span className="vne-eyelet" aria-hidden="true" />
          <CardHeader badge={badge} design={design} back />
          <div className="vne-qr-block">
            <QrCode
              value={badge.qrText}
              design={badge.design}
              access={badge.access}
              onStatus={onQrStatus}
            />
            <span>{badge.demo ? "ОБРАЗЕЦ · НЕ ДЛЯ ВХОДА" : "ПРЕДЪЯВИТЕ НА ВХОДЕ"}</span>
          </div>
          <dl className="vne-transfer">
            <div>
              <dt>
                <b>01</b> НАЧАЛО / ПЕРВЫЙ ШАТТЛ
              </dt>
              <dd>
                {badge.event.shuttleTime || "Уточняется"} <small>· {eventDate(badge.event)}</small>
              </dd>
            </div>
            <div>
              <dt>
                <b>02</b> СБОР И ОТПРАВЛЕНИЕ ТРАНСФЕРА
              </dt>
              <dd title={badge.event.meetingPoint || badge.event.venue || "Уточняется"}>
                {badge.event.meetingPoint || badge.event.venue || "Уточняется"}
              </dd>
            </div>
            <div className="vne-ticket-identity">
              <dt>
                <b>03</b> ID ВЫПУЩЕННОГО БИЛЕТА
              </dt>
              <dd title={badge.ticketCode || badge.id}>{badge.ticketCode || badge.id}</dd>
            </div>
          </dl>
          <div className="vne-serial-block">
            <span>
              ИНДИВИДУАЛЬНЫЙ
              <br />
              ПРОПУСК / СЕРИЯ
            </span>
            <strong>
              {sequence.split("/")[0]}
              <i>/{sequence.split("/")[1] || "—"}</i>
            </strong>
          </div>
        </div>
      </section>
    </div>
  );
});
