import { useState } from "react";
import { canRotate, qrMessage } from "./OwnerPassModel";
import type { OwnerPassController, OwnerState } from "./owner-controller";
export function OwnerQrControls({
  state,
  controller,
}: {
  state: OwnerState;
  controller: OwnerPassController;
}) {
  const [rotation, setRotation] = useState(false),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const canReplace = !!state.pass && canRotate(state.pass);
  return (
    <>
      {state.message && (
        <p className="owner-message" role="status">
          {qrMessage(state.message)}
        </p>
      )}
      <div className="owner-actions">
        {state.pending ? (
          <button
            className="owner-button"
            type="button"
            disabled={state.busy}
            onClick={() => void controller.retry()}
          >
            Повторить ту же команду
          </button>
        ) : canReplace && !rotation ? (
          <button
            className="owner-button owner-button-secondary"
            type="button"
            disabled={state.busy || !state.fresh}
            onClick={() => setRotation(true)}
          >
            {state.secret ? "Заменить этот QR" : "Получить новый QR взамен прежнего"}
          </button>
        ) : null}
        <button
          className="owner-text-button"
          type="button"
          disabled={state.busy}
          onClick={() => void controller.refresh()}
        >
          Обновить статус
        </button>
      </div>
      {rotation && canReplace && !state.pending && (
        <form
          className="owner-rotate"
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed || reason.trim().length < 3 || state.busy || !state.fresh) return;
            void controller.rotate(reason, confirmed).then(() => {
              setRotation(false);
              setReason("");
              setConfirmed(false);
            });
          }}
        >
          <p>
            После замены прежний QR сразу перестанет действовать. Сохранённые изображения больше не
            подойдут.
          </p>
          <label>
            Причина замены
            <input
              type="text"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              autoComplete="off"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="owner-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Я понимаю, что прежний QR будет аннулирован.
          </label>
          <div className="owner-actions">
            <button
              type="submit"
              className="owner-button"
              disabled={!confirmed || reason.trim().length < 3 || state.busy || !state.fresh}
            >
              Подтвердить замену QR
            </button>
            <button
              type="button"
              className="owner-text-button"
              disabled={state.busy}
              onClick={() => {
                setRotation(false);
                setConfirmed(false);
                setReason("");
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      <p className="owner-small">
        Код хранится только в памяти этой страницы. Уход, скрытие вкладки и завершение сеанса
        очищают его. Повторный показ после утраты требует подтверждённой замены, которая отзывает
        прежний QR.
      </p>
    </>
  );
}
