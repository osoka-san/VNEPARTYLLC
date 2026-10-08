import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { qrAdmissionCommand } from "@/lib/admission/admission.functions";
import { getScannerMfaState } from "@/lib/auth/scanner-mfa.functions";
import { readScannerMfaState } from "@/lib/auth/scanner-mfa-read";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
import {
  QA_ACTORS,
  TimedQaSession,
  pageQaBudget,
  type QaSessionReason,
} from "@/lib/admission/timed-qa-core";
import "./TimedQaScanner.css";

const errorHelp: Record<string, string> = {
  canonical_UTC_required:
    "Укажите UTC полностью: YYYY-MM-DDTHH:mm:ss.sssZ, включая миллисекунды и Z.",
  invalid_run_identity: "Проверьте полный UUID запуска и выбранный профиль Scanner A / Scanner B.",
  environment_changed:
    "Запуск остановлен после изменения вкладки или сети. Проверьте состояние ниже перед продолжением.",
  calibration_not_available:
    "Для повторной калибровки сначала примите сверку репетиции. Повтор разрешён один раз.",
  verified_MFA_required:
    "Подтвердите MFA в этом профиле. Перед новой подготовкой проверьте согласованное окно и доступ.",
  session_unconfigured:
    "Серверная проверка сессии не настроена для этого TEST-сайта. Передайте отчёт координатору до открытия окна.",
  session_forbidden:
    "Сессия не распознана как разрешённый TEST-аккаунт. Войдите в нужный аккаунт сканера и проверьте сессию снова.",
  session_unavailable:
    "Сервер не смог проверить сессию. Не открывайте окно; повторите проверку позже или передайте отчёт координатору.",
  session_wrong_account:
    "Текущий аккаунт не совпадает с выбранным Scanner A / Scanner B. Проверьте профиль браузера и выбор сканера.",
  session_factor_required:
    "У аккаунта нет подтверждённого TOTP-фактора. Согласуйте настройку MFA отдельно, до открытия окна.",
  session_challenge_required:
    "Подтверждённый TOTP-фактор есть, но эта сессия ещё не AAL2. Подтвердите существующий MFA на странице /scanner/mfa, затем проверьте сессию снова.",
  freshness_expired:
    "Проверка сессии или времени устарела. Остановите запуск и согласуйте дальнейшие действия с координатором.",
  clock_step: "Системное время изменилось. Остановите запуск и сверьте время с координатором.",
  target_outside_bound:
    "Выберите согласованный UTC через 30–120 секунд, внутри окна. Если подготовка уже началась и время упущено, передайте отчёт координатору.",
  preparation_late:
    "Подготовка началась слишком поздно. Запрос не отправлен повторно; передайте отчёт координатору.",
  insufficient_preparation_time:
    "Подготовка заняла слишком много времени. До отправки недостаточно запаса; передайте отчёт координатору.",
  insufficient_identity_budget:
    "Свежести MFA не хватит на отправку и ожидание ответа. Запуск остановлен; передайте отчёт координатору.",
  insufficient_good_samples:
    "Нужны как минимум 2 качественных замера из 3. Проверьте RTT и изменение часов в диагностике ниже.",
  timer_throttled:
    "Браузер задержал таймер. Запуск остановлен без повторной отправки; держите вкладку видимой и передайте отчёт координатору.",
  late_dispatch:
    "Согласованное время отправки пропущено. Повтора нет; передайте отчёт координатору.",
  uncertain_after_dispatch:
    "Запрос уже отправлен, но результат не подтверждён. Нужна сверка координатора; повторной отправки нет.",
  preparation_failed: "Подготовка остановлена. Передайте безопасный отчёт координатору.",
  race_not_ready: "Нужны свежий учебный пропуск и полный UUID вашей операции прохода.",
  rehearsal_not_ready: "Сначала успешно проверьте MFA и время.",
  invalid_rehearsal_evidence:
    "Вставьте полный JSON сверки репетиции, полученный от координатора. Неполная сверка не разрешает проход.",
  evidence_binding_mismatch:
    "Сверка относится к другому запуску или времени. Запросите у координатора сверку этого запуска.",
  metadata_too_large:
    "Сверка слишком длинная. Допустимо не более 30 000 символов безопасных метаданных.",
  invalid_json:
    "Сверка не читается как JSON. Вставьте полный текст от координатора без оформления и пояснений.",
  outside_window: "Согласованное окно не началось или уже закрыто. Сверьте окно с координатором.",
  already_armed: "Один запрос уже подготовлен. Дождитесь результата или нажмите «Остановить».",
  invalid_response:
    "Сервер не подтвердил доступность проверки. Сверьте с координатором действующее TEST-окно, доступ и состояние API.",
  actor_or_scope_mismatch:
    "Ответ не соответствует выбранному профилю или TEST-событию. Сверьте профиль и доступ с координатором.",
  clock_quality_failed:
    "Проверка времени не уложилась в допуск. Остановитесь и передайте отчёт координатору.",
  uncertainty_exceeded:
    "Точность времени недостаточна. Согласуйте дальнейшие действия с координатором.",
  unstable_clock: "Показания времени нестабильны. Остановитесь и передайте отчёт координатору.",
  invalid_server_time: "Сервер не вернул корректное время. Нужна проверка координатором.",
  unexpected_probe: "Получен неожиданный ответ проверки времени. Передайте отчёт координатору.",
  response_timeout:
    "Ответ не получен в пределах 4 секунд. Сверьте журнал запуска; автоматического повтора нет.",
  budget_exhausted: "Лимит запросов исчерпан. Передайте безопасный отчёт координатору.",
};
function explainError(code: string) {
  if (errorHelp[code]) return errorHelp[code];
  if (/evidence|observer|backend|receipt|reconciled|blocking|lock_bounds/.test(code))
    return "Сверка не соответствует этому запуску или двум ответам. Передайте безопасный отчёт координатору для проверки.";
  if (/replay|ack/.test(code))
    return "Повтор пока недоступен. Нужны принятый результат и точное подтверждение DB-сверки этой операции.";
  return "Действие не выполнено. Проверьте заполненные поля и текущий шаг; при остановке передайте безопасный отчёт координатору.";
}
const phaseTitles: Record<string, string> = {
  idle: "Готов к подготовке",
  rehearsal_waiting: "Репетиция запланирована",
  race_waiting: "Учебный проход запланирован",
  race_prepared: "Ожидаем финальную проверку сессии",
  race_session_check: "Повторная проверка аккаунта и MFA",
  calibrating: "Свежая проверка MFA и 3 замера времени",
  verifying_ready: "Проверяем свежий учебный пропуск",
  replay_checking: "Проверяем MFA перед единственным повтором",
  replay_blocked: "Повтор остановлен до отправки",
  replay_in_flight: "Единственный повтор отправлен",
  calibrated: "Можно подготовить репетицию",
  rehearsal_armed: "Ожидаем время репетиции",
  in_flight: "Запрос отправлен",
  rehearsal_done: "Нужна сверка репетиции",
  recalibrated: "Можно проверить учебный пропуск",
  ready: "Можно подготовить проход",
  race_armed: "Ожидаем время прохода",
  result: "Ответ получен",
  replayed: "Единственный повтор завершён",
  cancelled: "Запуск остановлен",
  uncertain: "Нужна сверка отправленного запроса",
};
const readinessHelp: Record<QaSessionReason, string> = {
  ready:
    "READY: на момент проверки аккаунт совпадает, сессия AAL2 и подтверждённый TOTP-фактор есть. Передайте результат координатору до открытия окна.",
  unconfigured: errorHelp["session_unconfigured"]!,
  forbidden: errorHelp["session_forbidden"]!,
  unavailable: errorHelp["session_unavailable"]!,
  wrong_account: errorHelp["session_wrong_account"]!,
  factor_required: errorHelp["session_factor_required"]!,
  challenge_required: errorHelp["session_challenge_required"]!,
  environment_changed:
    "Вкладка, сеть или сессия изменились. Предыдущая проверка больше не действует; проверьте текущую сессию снова.",
  response_timeout:
    "Проверка сессии не завершилась за 4 секунды. Окно пока не открывайте; повторите проверку явной кнопкой.",
};

/** Explicit one-run QA panel. No request, timer, calibration or enrollment on render/mount. */
export function TimedQaScanner() {
  const command = useServerFn(qrAdmissionCommand),
    mfa = useServerFn(getScannerMfaState);
  const functions = useRef({ command, mfa });
  functions.current = { command, mfa };
  const [session] = useState(
    () =>
      new TimedQaSession(
        {
          wall: () => Date.now(),
          mono: () => performance.now(),
          visible: () => document.visibilityState !== "hidden",
          online: () => navigator.onLine,
          timeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
          interval: (fn, ms) => setInterval(fn, ms),
          clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
          mfa: () => readScannerMfaState(functions.current.mfa),
          command: (data) => functions.current.command({ data }),
        },
        pageQaBudget(typeof document === "undefined" ? {} : document),
      ),
  );
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const [runId, setRunId] = useState(""),
    [actorId, setActorId] = useState<string>(QA_ACTORS[0]),
    [windowStart, setWindowStart] = useState(""),
    [rehearsalTarget, setRehearsalTarget] = useState(""),
    [raceTarget, setRaceTarget] = useState(""),
    [operationId, setOperationId] = useState(""),
    [evidence, setEvidence] = useState(""),
    [ack, setAck] = useState(""),
    [evidenceAccepted, setEvidenceAccepted] = useState(false),
    [error, setError] = useState(""),
    [copyStatus, setCopyStatus] = useState("");
  const reportRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const changed = () => session.environmentChanged("Вкладка, сеть или сессия изменились.");
    const hidden = () => {
      if (document.visibilityState === "hidden") changed();
    };
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("freeze", changed);
    for (const event of ["pagehide", "offline", "popstate", DRAFT_SIGNOUT_EVENT])
      window.addEventListener(event, changed);
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(DRAFT_SIGNOUT_EVENT);
        channel.onmessage = changed;
      }
    } catch {
      channel = null;
    }
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("freeze", changed);
      for (const event of ["pagehide", "offline", "popstate", DRAFT_SIGNOUT_EVENT])
        window.removeEventListener(event, changed);
      channel?.close();
      session.environmentChanged("Вкладка теста закрыта.");
    };
  }, [session]);
  async function act(fn: () => void | Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (caught) {
      setError(explainError(caught instanceof Error ? caught.message : ""));
    }
  }
  function json(value: string) {
    if (value.length > 30000) throw new Error("metadata_too_large");
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error("invalid_json");
    }
  }
  function reset() {
    session.resetBeforeDispatch();
    setEvidenceAccepted(false);
    setEvidence("");
    setAck("");
    setRehearsalTarget("");
    setRaceTarget("");
    setOperationId("");
    setCopyStatus("");
  }
  const config = { runId, actorId, windowStart };
  const canReset = session.canResetBeforeDispatch();
  const stopped = ["cancelled", "uncertain", "replay_blocked"].includes(state.phase);
  const canPrepareRehearsal = state.phase === "idle" && state.sessionReadiness.phase !== "checking";
  const canPrepareRace = session.canPrepareRace();
  const readiness = state.sessionReadiness;
  const canStop = !["idle", "cancelled", "uncertain", "replayed", "replay_blocked"].includes(
    state.phase,
  );
  const safeReceipt = (receipt: typeof state.receipt) =>
    receipt && {
      operationId: receipt.operationId,
      correlationId: receipt.correlationId,
      action: receipt.action,
      outcome: receipt.outcome,
      eventId: receipt.eventId,
      participationId: receipt.participationId,
      passId: receipt.passId,
      generation: receipt.generation,
      version: receipt.version,
      actorId: receipt.actorId,
      at: receipt.at,
      simulated: receipt.simulated,
      reentryAllowed: receipt.reentryAllowed,
      replayed: receipt.replayed,
    };
  const safeReport = JSON.stringify(
    {
      phase: state.phase,
      message: state.message,
      posts: state.posts,
      runId: state.runId,
      actorId: state.actorId,
      windowStart: state.windowStart,
      target: state.target,
      dispatchAt: state.dispatchAt,
      rehearsalTarget: state.rehearsalTarget,
      rehearsalDispatchAt: state.rehearsalDispatchAt,
      preparationTimings: state.preparationTimings,
      offsetMs: state.offsetMs,
      uncertaintyMs: state.uncertaintyMs,
      plannedAction: state.plannedAction,
      operationId: state.operationId,
      countdownMs: state.countdownMs,
      preparationAt: state.preparationAt,
      clockSamples: state.clockSamples.map((sample) => ({
        attempt: sample.attempt,
        rttMs: sample.rttMs,
        wallDeltaMs: sample.wallDeltaMs,
        quality: sample.quality,
        reason: sample.reason,
        intervalLowerMs: sample.intervalLowerMs,
        intervalUpperMs: sample.intervalUpperMs,
      })),
      sessionReadiness: {
        phase: state.sessionReadiness.phase,
        reason: state.sessionReadiness.reason,
        selectedActorId: state.sessionReadiness.selectedActorId,
        userId: state.sessionReadiness.userId,
        aal2: state.sessionReadiness.aal2,
        hasVerifiedTotp: state.sessionReadiness.hasVerifiedTotp,
      },
      receipt: safeReceipt(state.receipt),
      rehearsalReceipt: safeReceipt(state.rehearsalReceipt),
    },
    null,
    2,
  );
  const statusMessage = errorHelp[state.message] ?? state.message;
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(safeReport);
      setCopyStatus("Отчёт скопирован.");
    } catch {
      reportRef.current?.focus();
      reportRef.current?.select();
      setCopyStatus("Отчёт выделен. Скопируйте его через меню браузера или Ctrl/Cmd+C.");
    }
  }
  return (
    <section className="timed-qa" aria-labelledby="timed-qa-title" data-phase={state.phase}>
      <nav className="timed-qa-nav" aria-label="Навигация сканера">
        <a href="/scan">Обычный сканер</a>
        <a href="/scanner/mfa">MFA</a>
        <a href="/member">Кабинет</a>
      </nav>
      <header className="timed-qa-header">
        <p className="timed-qa-kicker">ВНЕ / DAY07 / ТОЛЬКО SYNTHETIC TEST</p>
        <h1 id="timed-qa-title">Проверка двух сканеров</h1>
        <p>
          Два отдельных видимых профиля браузера. Проверьте сессии до открытия окна. QR-запросы
          начинайте только в новом согласованном окне с действующим доступом.
        </p>
        <p className="timed-qa-hint">
          Запланируйте каждый этап одной кнопкой за 30–120 секунд. Затем держите вкладку видимой:
          свежая проверка MFA и замеры времени начнутся автоматически перед отправкой. Не вводите
          пароли, коды MFA, JWT или настоящий QR. Учебный пропуск не проверяет защищённую выдачу QR.
        </p>
      </header>

      <section className="timed-qa-step timed-qa-session" aria-labelledby="timed-qa-session-title">
        <h2 id="timed-qa-session-title">Сессия до открытия окна</h2>
        <label>
          Этот профиль
          <select
            value={actorId}
            disabled={state.phase !== "idle"}
            onChange={(e) => {
              session.invalidateSession();
              setActorId(e.target.value);
            }}
          >
            <option value={QA_ACTORS[0]}>Scanner A</option>
            <option value={QA_ACTORS[1]}>Scanner B</option>
          </select>
          <span className="timed-qa-hint timed-qa-id">{actorId}</span>
        </label>
        <button
          type="button"
          disabled={!session.canCheckSession()}
          aria-describedby="timed-qa-session-help"
          onClick={() => void act(() => session.checkSession(actorId))}
        >
          Проверить текущую сессию
        </button>
        <p className="timed-qa-hint" id="timed-qa-session-help">
          {readiness.phase === "checking"
            ? "Проверяем текущую сессию. Держите вкладку видимой; повторный запрос пока недоступен."
            : !session.canCheckSession()
              ? "Проверка доступна до начала QR-запросов. Она не сбрасывает и не возобновляет запуск."
              : "ID запуска и время окна не нужны. Кнопка только читает текущий аккаунт, AAL и состояние MFA; QR-запросов нет."}
        </p>
        <div role="status" aria-live="polite" aria-atomic="true" data-readiness={readiness.phase}>
          <p>
            {readiness.phase === "checking"
              ? "Проверка сессии…"
              : readiness.reason
                ? readinessHelp[readiness.reason]
                : "Текущая сессия ещё не проверена."}
          </p>
          {readiness.userId && (
            <p className="timed-qa-hint timed-qa-id">Текущий аккаунт: {readiness.userId}</p>
          )}
          {readiness.reason === "challenge_required" && (
            <a href="/scanner/mfa">Подтвердить существующий MFA</a>
          )}
        </div>
        <p className="timed-qa-hint">
          READY не подтверждает роль и допуск к запуску в БД. Запланированный этап проверит сессию
          заново перед отправкой, а каждый QR-запрос пройдёт серверную проверку доступа.
        </p>
      </section>

      <div className="timed-qa-status" data-stopped={stopped || undefined}>
        <div role="status" aria-live="polite" aria-atomic="true">
          <strong>{phaseTitles[state.phase] ?? "Состояние проверки"}</strong>
          <p>{statusMessage}</p>
          <p className="timed-qa-count">QR-запросы: {state.posts}/10</p>
        </div>
        {state.target && (
          <dl className="timed-qa-plan">
            <div>
              <dt>Зафиксированный профиль</dt>
              <dd className="timed-qa-id">{state.actorId}</dd>
            </div>
            <div>
              <dt>UTC отправки</dt>
              <dd className="timed-qa-id">{state.target}</dd>
            </div>
            {state.preparationAt && (
              <div>
                <dt>Начало автоматической подготовки UTC</dt>
                <dd className="timed-qa-id">{state.preparationAt}</dd>
              </div>
            )}
          </dl>
        )}
        {state.countdownMs !== null &&
          [
            "rehearsal_waiting",
            "race_waiting",
            "race_prepared",
            "rehearsal_armed",
            "race_armed",
          ].includes(state.phase) && (
            <p className="timed-qa-countdown" role="timer" aria-live="off">
              До отправки: {Math.max(0, Math.ceil(state.countdownMs / 1000))} с
            </p>
          )}
        {["rehearsal_waiting", "race_waiting"].includes(state.phase) && (
          <p className="timed-qa-hint">
            Пока отсчёт идёт по часам устройства. Свежая сверка времени перед отправкой может
            остановить этап, если часы расходятся или подготовка опоздала.
          </p>
        )}
        <div className="timed-qa-stages" aria-label="Порядок запланированного этапа">
          <p>
            Ожидание → свежая MFA → 3 замера времени →{" "}
            {state.plannedAction === "checkin"
              ? "ожидание → повторная MFA → проверка пропуска → один проход"
              : "одна репетиция"}
          </p>
        </div>
        <div className="timed-qa-actions">
          <button
            type="button"
            className="timed-qa-secondary"
            disabled={!canStop}
            aria-describedby="timed-qa-stop-help"
            onClick={() => session.cancel("Отменено оператором")}
          >
            Остановить
          </button>
          {canReset && (
            <button
              type="button"
              aria-describedby="timed-qa-reset-help"
              onClick={() => void act(reset)}
            >
              Сбросить подготовку
            </button>
          )}
        </div>
        <p className="timed-qa-hint" id="timed-qa-stop-help">
          {canStop
            ? "Остановка отменяет ожидание и запрещает дальнейшие запросы. Отправленный запрос требует сверки."
            : stopped
              ? "Запуск уже остановлен."
              : "Остановка станет доступна после начала проверки."}
        </p>
        {canReset ? (
          <p className="timed-qa-hint" id="timed-qa-reset-help">
            Ни одного QR-запроса не отправлено. Можно явно сбросить подготовку; согласованные ID и
            окно останутся в полях. Новый запуск требует действующего доступа.
          </p>
        ) : (
          stopped && (
            <p className="timed-qa-hint">
              Сброс недоступен: запросы уже были отправлены. Передайте безопасный отчёт
              координатору; не перезапускайте тест без сверки.
            </p>
          )
        )}
      </div>
      {error && (
        <p className="timed-qa-error" role="alert">
          {error}
        </p>
      )}

      <section className="timed-qa-step" aria-labelledby="timed-qa-step-one">
        <h2 id="timed-qa-step-one">
          <span>01</span> Параметры и время
        </h2>
        <fieldset disabled={state.phase !== "idle"} aria-describedby="timed-qa-config-help">
          <legend className="timed-qa-hint">Параметры согласованного запуска</legend>
          <div className="timed-qa-fields">
            <label className="timed-qa-wide">
              ID запуска (UUID)
              <input
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </label>
            <label>
              Начало окна UTC
              <input
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
          </div>
        </fieldset>
        <p className="timed-qa-hint" id="timed-qa-config-help">
          {state.phase === "idle"
            ? "Полные ID и UTC выдаёт координатор. До начала проверки можно переключаться между вкладками, чтобы скопировать параметры."
            : "Параметры зафиксированы для этого запуска."}
        </p>
      </section>

      <section className="timed-qa-step" aria-labelledby="timed-qa-step-two">
        <h2 id="timed-qa-step-two">
          <span>02</span> Репетиция
        </h2>
        <label>
          UTC отправки репетиции
          <input
            value={rehearsalTarget}
            onChange={(e) => setRehearsalTarget(e.target.value)}
            disabled={state.phase !== "idle"}
            placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          disabled={!canPrepareRehearsal}
          aria-describedby="timed-qa-rehearsal-help"
          onClick={() => void act(() => session.prepareRehearsal(config, rehearsalTarget))}
        >
          Запланировать репетицию
        </button>
        <p className="timed-qa-hint" id="timed-qa-rehearsal-help">
          {readiness.phase === "checking"
            ? "Дождитесь результата проверки текущей сессии. Запланированный этап выполнит собственную свежую проверку MFA."
            : canPrepareRehearsal
              ? "Укажите согласованный UTC через 30–120 секунд. Кнопка зафиксирует параметры: перед этим временем выполнит свежую MFA, ровно 3 замера и одну репетицию. Дополнительное нажатие перед отправкой не нужно."
              : "Параметры уже зафиксированы. Автоматического повтора или переноса времени нет."}
        </p>
      </section>

      <section className="timed-qa-step" aria-labelledby="timed-qa-step-three">
        <h2 id="timed-qa-step-three">
          <span>03</span> Сверка репетиции
        </h2>
        <label>
          Безопасная сверка от координатора
          <textarea
            value={evidence}
            maxLength={30000}
            onChange={(e) => setEvidence(e.target.value)}
            disabled={state.phase !== "rehearsal_done" || evidenceAccepted}
            rows={5}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Вставьте JSON сверки репетиции"
          />
        </label>
        <button
          type="button"
          disabled={state.phase !== "rehearsal_done" || evidenceAccepted}
          aria-describedby="timed-qa-evidence-help"
          onClick={() =>
            void act(() => {
              session.acceptRehearsal(json(evidence));
              setEvidence("");
              setEvidenceAccepted(true);
            })
          }
        >
          Проверить структуру сверки
        </button>
        <p className="timed-qa-hint" id="timed-qa-evidence-help">
          {evidenceAccepted
            ? "Структура принята. Дождитесь подтверждения свежего учебного пропуска от координатора и запланируйте один проход на шаге 04."
            : "Доступно после ответа репетиции. Нужна сверка обоих профилей и SQL observer от координатора."}
        </p>
      </section>

      <section className="timed-qa-step" aria-labelledby="timed-qa-step-four">
        <h2 id="timed-qa-step-four">
          <span>04</span> Один учебный проход
        </h2>
        <label>
          ID моей операции прохода (UUID)
          <input
            value={operationId}
            onChange={(e) => setOperationId(e.target.value)}
            disabled={!canPrepareRace}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </label>
        <label>
          UTC отправки прохода
          <input
            value={raceTarget}
            onChange={(e) => setRaceTarget(e.target.value)}
            disabled={!canPrepareRace}
            placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          disabled={!canPrepareRace}
          aria-describedby="timed-qa-race-help"
          onClick={() => void act(() => session.prepareRace(config, raceTarget, operationId))}
        >
          Запланировать один проход
        </button>
        <p className="timed-qa-hint" id="timed-qa-race-help">
          {canPrepareRace
            ? "После внешней сверки и подготовки свежего учебного пропуска укажите разные UUID операций в двух профилях и один UTC через 30–120 секунд. Кнопка начнёт MFA и 3 замера заранее, повторно проверит тот же аккаунт и MFA перед целью, затем проверит пропуск и выполнит один проход."
            : "Доступно после принятой сверки репетиции. Сначала координатор должен подготовить свежий учебный пропуск."}
        </p>
      </section>

      <section className="timed-qa-step" aria-labelledby="timed-qa-step-five">
        <h2 id="timed-qa-step-five">
          <span>05</span> Сверка результата и повтор
        </h2>
        <label>
          Подтверждение DB-сверки от координатора
          <textarea
            value={ack}
            maxLength={30000}
            onChange={(e) => setAck(e.target.value)}
            disabled={state.phase !== "result" || state.receipt?.outcome !== "simulated_accepted"}
            rows={3}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Вставьте JSON подтверждения для единственного повтора победителя"
          />
        </label>
        <button
          type="button"
          disabled={state.phase !== "result" || state.receipt?.outcome !== "simulated_accepted"}
          aria-describedby="timed-qa-replay-help"
          onClick={() =>
            void act(() =>
              session.replayWinner(json(ack) as Parameters<TimedQaSession["replayWinner"]>[0]),
            )
          }
        >
          Повторить ту же операцию после сверки
        </button>
        <p className="timed-qa-hint" id="timed-qa-replay-help">
          Только профиль с принятым проходом и точным подтверждением DB-сверки может выполнить один
          повтор той же операции. Кнопка заново проверит MFA и отправит только сохранённую операцию,
          без дополнительных замеров. Неудачная попытка не повторяется автоматически.
        </p>
      </section>

      {state.clockSamples.length > 0 && (
        <section className="timed-qa-step" aria-labelledby="timed-qa-diagnostics-title">
          <h2 id="timed-qa-diagnostics-title">Диагностика времени</h2>
          <p className="timed-qa-hint">
            Нужны минимум 2 качественных замера из 3. Медленная сеть, скачок часов или опоздание
            могут остановить этап.
          </p>
          <ol className="timed-qa-samples">
            {state.clockSamples.map((sample) => (
              <li key={sample.attempt} data-quality={sample.quality}>
                Замер {sample.attempt}: RTT {sample.rttMs === null ? "—" : Math.round(sample.rttMs)}{" "}
                мс; изменение часов{" "}
                {sample.wallDeltaMs === null ? "—" : Math.round(sample.wallDeltaMs)} мс; качество:{" "}
                {sample.quality === "good"
                  ? "подходит"
                  : sample.quality === "slow"
                    ? "медленный"
                    : "ошибка"}
                {sample.reason && <span className="timed-qa-id"> ({sample.reason})</span>}
              </li>
            ))}
          </ol>
          {state.uncertaintyMs !== null && (
            <p className="timed-qa-hint">
              Погрешность времени: {Math.round(state.uncertaintyMs)} мс.
            </p>
          )}
        </section>
      )}

      <details className="timed-qa-report">
        <summary>Безопасный отчёт этого профиля</summary>
        <label>
          Отчёт для координатора
          <textarea ref={reportRef} readOnly value={safeReport} rows={12} spellCheck={false} />
        </label>
        <button type="button" className="timed-qa-secondary" onClick={() => void copyReport()}>
          Скопировать отчёт
        </button>
        <p className="timed-qa-hint" role="status">
          {copyStatus ||
            "Только состояние и метаданные проверки. Поле можно выделить и скопировать вручную."}
        </p>
      </details>
      <p className="timed-qa-footnote">
        Эта страница не объявляет конкурентность доказанной. Требуются два связанных PostgreSQL PID,
        один новый первичный проход, второй ответ «использован» и совпадающий повтор. Скрытый повтор
        или продление времени не выполняются.
      </p>
    </section>
  );
}
