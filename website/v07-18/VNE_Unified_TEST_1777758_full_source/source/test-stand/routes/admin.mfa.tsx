import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  getAdminMfaState,
  beginAdminMfaEnrollment,
  completeAdminMfaChallenge,
} from "@/lib/auth/admin-mfa.functions";
import { MfaPrivacyFence, subscribeMfaPrivacy } from "@/lib/auth/admin-mfa-lifecycle";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
export const Route = createFileRoute("/admin/mfa")({ component: AdminMfa });
const failures: Record<string, string> = {
  unconfigured: "Настройка ещё не включена на TEST.",
  forbidden: "Войдите в назначенный аккаунт ADMIN_TEST.",
  existing_factor:
    "У аккаунта уже есть подтверждённый фактор. Этот экран его не заменяет; используйте существующий TOTP.",
  factor_required: "Сначала начните настройку или выберите код только что добавленного приложения.",
  invalid: "Введите шестизначный код.",
  code_invalid: "Код не принят. Проверьте время в приложении и повторите.",
  unavailable: "Сервис временно недоступен. Настройка не подтверждена.",
};
function AdminMfa() {
  const read = useServerFn(getAdminMfaState),
    begin = useServerFn(beginAdminMfaEnrollment),
    verify = useServerFn(completeAdminMfaChallenge);
  const [state, setState] = useState<{
    aal2: boolean;
    hasVerifiedTotp: boolean;
    hasOtherVerifiedFactor: boolean;
    pendingFactorId: string | null;
  } | null>(null);
  const fence = useRef(new MfaPrivacyFence()).current,
    busyRef = useRef(false);
  const [factorId, setFactorId] = useState<string | null>(null),
    [enrollment, setEnrollment] = useState<{ qr: string; secret: string } | null>(null),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    const current = fence.ticket();
    void read()
      .then((r) => {
        if (!alive || !fence.accepts(current, document.hidden)) return;
        if (r.ok) {
          setState(r);
          setFactorId(r.pendingFactorId);
        } else setMessage(failures[r.reason] ?? failures["unavailable"]!);
      })
      .catch(
        () =>
          alive && fence.accepts(current, document.hidden) && setMessage(failures["unavailable"]!),
      );
    return () => {
      alive = false;
    };
  }, [read, fence]);
  useEffect(
    () =>
      subscribeMfaPrivacy(
        fence,
        (signout) => {
          setEnrollment(null);
          setCode("");
          if (signout) {
            setFactorId(null);
            setState(null);
            setMessage("Сеанс завершён. Войдите заново и обновите эту страницу перед настройкой.");
          }
        },
        window,
        document,
        typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DRAFT_SIGNOUT_EVENT),
      ),
    [fence],
  );
  return (
    <section className="max-w-xl">
      <h1 className="mb-5 text-3xl">Защита входа ADMIN_TEST</h1>
      <p className="mb-5">
        Настройку выполняет сам владелец аккаунта. QR и ключ появятся только здесь после вашего
        нажатия. Не отправляйте их в чат и не делитесь снимком экрана.
      </p>
      <p className="mb-5 text-sm">
        Настройка MFA не выдаёт роли, служебный допуск, приглашение или билет. При подтверждении
        нового фактора Supabase может завершить другие сеансы этого аккаунта.
      </p>
      <p className="mb-5 text-sm">
        <a href="/admin/mfa" className="underline">
          Повторить проверку сеанса
        </a>
      </p>
      {message && (
        <p role="status" className="my-5 border border-border p-4">
          {message}
        </p>
      )}
      {state?.aal2 ? (
        <p className="my-5 border border-mint p-4">
          Текущий вход подтверждён на уровне aal2. Права админки настраиваются отдельно.
        </p>
      ) : (
        <>
          {state && !state.hasVerifiedTotp && !state.hasOtherVerifiedFactor && !enrollment && (
            <button
              className="border border-mint px-5 py-3"
              disabled={busy}
              onClick={async () => {
                if (busyRef.current) return;
                const current = fence.next();
                if (current === null) return;
                busyRef.current = true;
                setBusy(true);
                setMessage("");
                try {
                  const r = await begin({ data: {} });
                  if (!fence.accepts(current, document.hidden)) return;
                  if (r.ok) {
                    setFactorId(r.factorId);
                    setEnrollment({ qr: r.qr, secret: r.secret });
                  } else setMessage(failures[r.reason] ?? failures["unavailable"]!);
                } catch {
                  if (fence.accepts(current, document.hidden)) setMessage(failures["unavailable"]!);
                } finally {
                  busyRef.current = false;
                  setBusy(false);
                }
              }}
            >
              Самостоятельно подключить приложение-аутентификатор
            </button>
          )}
          {enrollment && (
            <div className="my-6 border border-border p-5">
              <p>Отсканируйте QR своим приложением-аутентификатором.</p>
              <img
                src={enrollment.qr}
                className="my-4 size-52 bg-white p-2"
                alt="Личный QR для приложения-аутентификатора"
              />
              <details>
                <summary>Ключ для ручного ввода</summary>
                <p className="mt-3 break-all font-mono">{enrollment.secret}</p>
              </details>
            </div>
          )}
          {state && !state.hasOtherVerifiedFactor && (state.hasVerifiedTotp || factorId) && (
            <form
              className="mt-7"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busyRef.current) return;
                const current = fence.next();
                if (current === null) return;
                busyRef.current = true;
                setBusy(true);
                setMessage("");
                try {
                  const r = await verify({
                    data: { factorId: state.hasVerifiedTotp ? null : factorId, code },
                  });
                  if (!fence.accepts(current, document.hidden)) return;
                  setCode("");
                  if (r.ok) {
                    setEnrollment(null);
                    const fresh = await read();
                    if (!fence.accepts(current, document.hidden)) return;
                    if (fresh.ok) {
                      setState(fresh);
                      setMessage(
                        fresh.aal2
                          ? "MFA подтверждена для текущего сеанса."
                          : "Код принят. Обновите состояние сеанса.",
                      );
                    }
                  } else setMessage(failures[r.reason] ?? failures["unavailable"]!);
                } catch {
                  if (fence.accepts(current, document.hidden)) setMessage(failures["unavailable"]!);
                } finally {
                  busyRef.current = false;
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="totp">Код из вашего приложения</label>
              <input
                id="totp"
                className="my-3 block w-full border border-border bg-surface p-3"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="border border-mint px-5 py-3" disabled={busy}>
                Подтвердить код
              </button>
            </form>
          )}
          {state?.hasOtherVerifiedFactor && (
            <p>
              У аккаунта уже есть другой подтверждённый фактор. Его изменение на этом экране не
              разрешено.
            </p>
          )}
        </>
      )}
    </section>
  );
}
