import { useOwnerPass } from "./useOwnerPass";
import { OwnerQrControls } from "./OwnerQrControls";
import { OwnerScanQr } from "./OwnerScanQr";
import { OwnerUnavailable } from "./OwnerPassPage";
import { ownerPassHref, canIssue, eventTime } from "./OwnerPassModel";
import "./OwnerPass.css";
export { OwnerScanQr } from "./OwnerScanQr";
export function OwnerQrPage() {
  const { state, controller } = useOwnerPass(),
    pass = state.pass;
  if (!pass) return <OwnerUnavailable error={state.message} />;
  const visible =
    state.fresh &&
    !state.busy &&
    pass.status === "active" &&
    state.secret?.version === pass.version &&
    state.secret.generation === pass.generation;
  return (
    <section className="owner-qr" aria-labelledby="owner-qr-title">
      <nav className="owner-nav">
        <a href={ownerPassHref("pass", pass)}>← К карточке пропуска</a>
        <a href="/member">В кабинет</a>
      </nav>
      <p className="owner-kicker">ВНЕ / спокойный режим сканирования</p>
      <h1 id="owner-qr-title">QR для входа</h1>
      <p className="owner-lead">{pass.eventTitle}</p>
      <p className="owner-message">TEST · Только симуляция. Повторный вход выключен.</p>
      {visible && state.secret ? (
        <div className="owner-qr-frame">
          <OwnerScanQr value={state.secret.value} />
          <p className="owner-qr-caption">Держите экран неподвижно. Первичный вход.</p>
        </div>
      ) : (
        <p className="owner-small">Код скрыт до проверки статуса и вашего действия.</p>
      )}
      {canIssue(pass) && !state.pending && (
        <button
          type="button"
          className="owner-button"
          disabled={!state.fresh || state.busy}
          onClick={() => void controller.issue()}
        >
          Показать QR код
        </button>
      )}
      <OwnerQrControls state={state} controller={controller} />
      <dl className="owner-details">
        <div>
          <dt>Вход</dt>
          <dd>
            {eventTime(pass.entryOpensAt, pass.timezone)}
            <br />
            До {eventTime(pass.entryClosesAt, pass.timezone)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
