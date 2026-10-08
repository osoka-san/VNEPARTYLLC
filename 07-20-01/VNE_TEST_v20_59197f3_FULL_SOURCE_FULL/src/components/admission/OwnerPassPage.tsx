import { OwnerHangingCard } from "./OwnerHangingCard";
import { useOwnerPass } from "./useOwnerPass";
import { OwnerQrControls } from "./OwnerQrControls";
import { ownerPassHref, ownerStateTitle, ownerReady, qrMessage, eventTime } from "./OwnerPassModel";
import "./OwnerPass.css";
export function OwnerPassPage() {
  const { state, controller } = useOwnerPass(),
    pass = state.pass;
  if (!pass) return <OwnerUnavailable error={state.message} />;
  return (
    <section className="owner-pass" aria-labelledby="owner-pass-title">
      <nav className="owner-nav" aria-label="Навигация пропуска">
        <a href="/member">← В личный кабинет</a>
        <span className="owner-test">TEST · СИМУЛЯЦИЯ ОПЛАТЫ И ПРОХОДА</span>
      </nav>
      <div className="owner-layout">
        <div className="owner-copy">
          <p className="owner-kicker">ВНЕ / персональный пропуск</p>
          <h1 id="owner-pass-title">
            {ownerStateTitle(pass.status)}
            {ownerReady(pass) && <span>Внутри события.</span>}
          </h1>
          <p className="owner-lead">{qrMessage(pass.status)}</p>
          <dl className="owner-details">
            <div>
              <dt>Событие</dt>
              <dd>{pass.eventTitle}</dd>
            </div>
            <div>
              <dt>Вход</dt>
              <dd>
                {eventTime(pass.entryOpensAt, pass.timezone)}
                <br />
                До {eventTime(pass.entryClosesAt, pass.timezone)}
              </dd>
            </div>
            <div>
              <dt>Выдача QR</dt>
              <dd>{eventTime(pass.qrReleaseAt, pass.timezone)}</dd>
            </div>
          </dl>
          <p className="owner-small">
            Движение карточки и открытие страницы не выпускают пропуск и не отмечают проход. Первый
            QR выпускается только кнопкой под карточкой.
          </p>
          <OwnerQrControls state={state} controller={controller} />
          <a className="owner-text-button" href={ownerPassHref("qr", pass)}>
            Открыть отдельную страницу QR ↗
          </a>
          <dl className="owner-details">
            <div>
              <dt>Адрес</dt>
              <dd>
                {state.address ?? `Открывается ${eventTime(pass.addressRevealAt, pass.timezone)}`}
              </dd>
            </div>
          </dl>
          {!state.address && (
            <button
              type="button"
              className="owner-text-button"
              disabled={!state.fresh || state.busy}
              onClick={() => void controller.revealAddress()}
            >
              Проверить доступность адреса
            </button>
          )}
        </div>
        <OwnerHangingCard pass={pass} state={state} onShow={() => controller.showOrFlip()} />
      </div>
    </section>
  );
}
export function OwnerUnavailable({ error }: { error: string }) {
  return (
    <section className="owner-qr">
      <nav className="owner-nav">
        <a href="/member">← В личный кабинет</a>
        <span className="owner-test">ВНЕ / TEST</span>
      </nav>
      <h1>{error === "loading" ? "Проверяем пропуск" : "Пропуск недоступен"}</h1>
      <p className="owner-message" role="status">
        {qrMessage(error)}
      </p>
      <p className="owner-small">
        Для доступа нужна ваша действующая сессия и подтверждённое участие. Ссылка сама по себе не
        даёт право входа.
      </p>
      <a className="owner-button owner-button-secondary" href="/member">
        Проверить статус в кабинете
      </a>
    </section>
  );
}
