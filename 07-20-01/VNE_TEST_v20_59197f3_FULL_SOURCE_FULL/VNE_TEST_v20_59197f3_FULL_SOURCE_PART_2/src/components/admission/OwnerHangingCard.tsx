import { useEffect, useRef, useState } from "react";
import BrandMark from "@/components/tickets/BrandMark";
import LanyardRibbon from "@/components/tickets/LanyardRibbon";
import MetalClasp from "@/components/tickets/MetalClasp";
import { OWNER_CLICK_IMPULSE, ownerReady, canIssue, stepOwnerSpring } from "./OwnerPassModel";
import { OwnerScanQr } from "./OwnerScanQr";
import type { AdmissionPass } from "@/lib/admission/contract";
import type { OwnerState } from "./owner-controller";
export function OwnerHangingCard({
  pass,
  state,
  onShow,
}: {
  pass: AdmissionPass;
  state: OwnerState;
  onShow(): void;
}) {
  const [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(true),
    [visible, setVisible] = useState(true),
    [entered, setEntered] = useState(false);
  const [angle, setAngle] = useState(0),
    [tilt, setTilt] = useState(0);
  const spring = useRef({ angle: 0, velocity: 0 }),
    target = useRef(0),
    direction = useRef(1),
    stage = useRef<HTMLDivElement>(null);
  const flipped = state.back && !!state.secret;
  const showBack =
    flipped &&
    state.fresh &&
    !state.busy &&
    pass.status === "active" &&
    state.secret?.version === pass.version &&
    state.secret.generation === pass.generation;
  const moving = ownerReady(pass) && !paused && !reduced && visible && !flipped;
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setReduced(query.matches || document.documentElement.dataset["reduceMotion"] === "true");
    const visibility = () => setVisible(!document.hidden),
      observer = new MutationObserver(sync);
    sync();
    visibility();
    setEntered(true);
    const entrance = setTimeout(() => setEntered(false), 1600);
    query.addEventListener("change", sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduce-motion"],
    });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(entrance);
      query.removeEventListener("change", sync);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!moving) {
      spring.current = { angle: 0, velocity: 0 };
      target.current = 0;
      setAngle(0);
      setTilt(0);
      return;
    }
    let frame = 0,
      previous = 0;
    const tick = (time: number) => {
      const dt = previous ? (time - previous) / 1000 : 1 / 60;
      previous = time;
      spring.current = stepOwnerSpring(spring.current, dt);
      const width = stage.current?.clientWidth ?? 600;
      const limit = Math.min(
        0.46,
        Math.max(0.035, Math.atan(Math.max(0, (width - (width < 390 ? 245 : 280)) / 2 - 10) / 470)),
      );
      if (Math.abs(spring.current.angle) > limit) {
        spring.current.angle = Math.sign(spring.current.angle) * limit;
        spring.current.velocity *= -0.3;
      }
      setAngle((spring.current.angle * 180) / Math.PI);
      setTilt((value) => value + (target.current - value) * 0.12);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  const nudge = () => {
    if (!moving) return;
    direction.current *= -1;
    spring.current.velocity = Math.max(
      -3.5,
      Math.min(3.5, spring.current.velocity + direction.current * OWNER_CLICK_IMPULSE),
    );
  };
  const canShow =
    state.fresh && !state.busy && !state.pending && (!!state.secret || canIssue(pass));
  return (
    <figure
      className="owner-exhibit"
      data-motion={moving ? "animated" : "static"}
      data-enter={entered && !reduced ? "yes" : "no"}
      data-back={flipped ? "yes" : "no"}
    >
      <div className="owner-exhibit-label">
        <span>ВНЕ / ЛИЧНАЯ КОЛЛЕКЦИЯ</span>
        <span>01 — ПРОПУСК</span>
      </div>
      <div className="owner-stage" ref={stage}>
        <div className="owner-reveal-halo" aria-hidden="true" />
        <div className="owner-descent">
          <div
            className="owner-suspension"
            style={{ transform: flipped ? "none" : `rotate(${angle}deg)` }}
          >
            <svg className="owner-cord-extension" viewBox="0 0 320 1000" aria-hidden="true">
              <LanyardRibbon
                points={[
                  { x: 160, y: 0 },
                  { x: 160, y: 400 },
                  { x: 160, y: 1000 },
                ]}
                width={28}
                color="#d65a37"
                edgeColor="#f49b76"
                text="ВНЕ / PRIVATE EXPERIENCE"
                badgeNumber=""
              />
            </svg>
            <svg className="owner-strap" viewBox="0 0 320 140" aria-hidden="true">
              <LanyardRibbon
                points={[
                  { x: 160, y: 0 },
                  { x: 160, y: 50 },
                  { x: 160, y: 100 },
                  { x: 160, y: 140 },
                ]}
                width={28}
                color="#d65a37"
                edgeColor="#f49b76"
                text="ВНЕ / PRIVATE EXPERIENCE"
                badgeNumber="ВНЕ"
              />
            </svg>
            <div className="owner-clasp" aria-hidden="true">
              <MetalClasp width={35} height={58} />
            </div>
            <div
              className="owner-card-turn"
              style={{ transform: flipped ? "rotateY(180deg)" : `rotateY(${tilt}deg)` }}
            >
              <div className="owner-art-card owner-card-front" aria-hidden={flipped}>
                <span className="owner-card-eyelet" aria-hidden="true" />
                <span className="owner-card-head">
                  <BrandMark />
                  <span>
                    PRIVATE EVENT
                    <br />
                    TEST / GUEST
                  </span>
                </span>
                <span className="owner-card-event">{pass.eventTitle}</span>
                <span className="owner-card-caption">ПЕРСОНАЛЬНЫЙ ПРОПУСК</span>
                <span className="owner-card-art" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="owner-card-edition">
                  ПО ТУ СТОРОНУ
                  <br />
                  <em>ПОВСЕДНЕВНОГО.</em>
                </span>
                <span className="owner-card-foot">
                  <span>GUEST GENERAL</span>
                  <span>ВНЕ / 01</span>
                </span>
                <span className="owner-card-sheen" aria-hidden="true" />
              </div>
              <div className="owner-art-card owner-card-back" aria-hidden={!flipped}>
                {showBack && state.secret && (
                  <>
                    <span className="owner-card-eyelet" aria-hidden="true" />
                    <p>ВНЕ / TEST · ПЕРВИЧНЫЙ ВХОД</p>
                    <OwnerScanQr value={state.secret.value} />
                    <p>
                      Держите экран неподвижно.
                      <br />
                      Повторный вход выключен.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        {!flipped && (
          <button
            type="button"
            className="owner-hit-area"
            onPointerDown={nudge}
            onClick={(event) => {
              if (event.detail === 0) nudge();
            }}
            aria-label="Покачать карточку пропуска"
            aria-describedby="owner-motion-help"
            disabled={!moving}
            onPointerMove={(event) => {
              if (!moving || event.pointerType === "touch") return;
              const rect = event.currentTarget.getBoundingClientRect();
              target.current = Math.max(
                -6,
                Math.min(6, ((event.clientX - rect.left) / rect.width - 0.5) * 12),
              );
            }}
            onPointerLeave={() => {
              target.current = 0;
            }}
          />
        )}
        <div className="owner-plinth" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="owner-button owner-show-button"
        disabled={!canShow}
        onClick={onShow}
      >
        {flipped ? "Вернуть лицевую сторону" : state.busy ? "Выпускаем QR…" : "Показать QR код"}
      </button>
      <figcaption id="owner-motion-help">
        {showBack
          ? "QR неподвижен и готов к сканированию."
          : moving
            ? "Коснитесь карточки или пространства вокруг неё."
            : "Статичный вид пропуска."}
      </figcaption>
      {ownerReady(pass) && !reduced && !flipped && (
        <button
          className="owner-text-button"
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? "Включить движение" : "Остановить движение"}
        </button>
      )}
    </figure>
  );
}
