import type { AdmissionCommandInput, AdmissionPass } from "../../lib/admission/contract";
export const canIssue = (p: AdmissionPass) => p.status === "not_issued" && !p.passId;
export const canRotate = (p: AdmissionPass) => p.status === "active" && !!p.passId;
export const ownerReady = (p: AdmissionPass) =>
  ["active", "not_issued", "before_release"].includes(p.status);
export function ownerPassHref(
  page: "pass" | "qr",
  pass: Pick<AdmissionPass, "eventId" | "participationId">,
): string {
  return `/member/${page}?${new URLSearchParams({ event: pass.eventId, participation: pass.participationId })}`;
}
export function eventTime(value: string | null, timezone: string): string {
  if (!value) return "Время уточняется";
  try {
    return (
      new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(value)) + ` (${timezone})`
    );
  } catch {
    return "Время уточняется";
  }
}
export function qrMessage(status: string): string {
  return (
    (
      {
        invalid: "Проверьте данные команды.",
        forbidden: "Для действия нужны ваша сессия, действующий допуск и необходимые полномочия.",
        unconfigured: "Допуск TEST ещё не включён. Выдача и проход недоступны.",
        unavailable: "Не удалось подтвердить состояние. Код скрыт. Повторите проверку.",
        conflict: "Номер команды уже использован с другими данными.",
        not_found: "Пропуск не найден.",
        before_release: "QR ещё не выдаётся. Время указано ниже.",
        before_reveal: "Адрес пока закрыт.",
        address_unconfigured: "Адрес ещё не указан.",
        not_issued: "Участие подтверждено. Выпуск QR доступен по вашему действию.",
        active: "Пропуск действует. Для показа нужен код из этой открытой страницы.",
        issued: "QR выпущен. Сохраняется только в памяти этой страницы.",
        rotated: "QR заменён. Прежний код больше не действует.",
        used: "Первичный проход уже зарегистрирован. Повторный вход выключен.",
        revoked: "Пропуск отозван.",
        expired: "Окно прохода завершилось.",
        too_early: "Время входа ещё не наступило.",
        event_unavailable: "Событие недоступно.",
        participation_inactive: "Участие или тестовый заказ не действуют.",
        approval_required: "Нужна одобренная заявка на событие.",
        member_revoked: "Допуск участника отозван.",
        window_required: "Временные окна ещё не настроены.",
        legacy_disabled: "Этот формат пропуска отключён.",
        test_only: "Доступно только синтетическое участие.",
        rate_limited: "Слишком много проверок. Подождите минуту.",
        replaced: "Этот QR заменён и больше не действует.",
        version_conflict: "Пропуск изменился. Обновите статус.",
        already_issued: "Пропуск уже выпущен. Для нового кода нужна подтверждённая замена.",
        invalid_token: "Неверный формат QR. Старый VNE1 не поддерживается.",
        ready: "Пропуск готов к проверке входа.",
        simulated_accepted: "Тестовый первичный проход зарегистрирован.",
        lost_reply:
          "Ответ потерян. Повторите ту же команду с сохранённым номером. Новый выпуск автоматически не запускается.",
        secret_lost:
          "Код уже был выпущен, но повторно не возвращается. Для нового кода подтвердите замену прежнего.",
        hidden: "Код очищен при уходе со страницы. Обновите статус.",
        loading: "Проверяем защищённый статус…",
      } as Record<string, string>
    )[status] ?? "Действие недоступно. Обновите статус."
  );
}
export function ownerStateTitle(status: string): string {
  return (
    (
      {
        active: "Ваш пропуск",
        not_issued: "Ваш пропуск",
        before_release: "Пропуск скоро откроется",
        used: "Вы уже прошли",
        revoked: "Пропуск отозван",
        expired: "Событие завершилось",
      } as Record<string, string>
    )[status] ?? "Пропуск недоступен"
  );
}
export type OwnerMutation = Extract<
  AdmissionCommandInput,
  { action: "issue" | "rotate" | "revoke" }
>;
export function ownerMutation(
  pass: AdmissionPass,
  action: "issue" | "rotate",
  operationId: string,
  reason: string,
): OwnerMutation {
  return {
    action,
    eventId: pass.eventId,
    participationId: pass.participationId,
    operationId,
    expectedVersion: pass.version,
    reason: reason.trim(),
  };
}
// Wide, bounded pendulum; the accepted later motion supersedes the earlier 0.67 impulse.
export const OWNER_CLICK_IMPULSE = 2.8;
export const OWNER_ANGLE_LIMIT = 0.46;
export type OwnerSpring = { angle: number; velocity: number };
export function stepOwnerSpring(state: OwnerSpring, dt: number): OwnerSpring {
  const step = Math.min(Math.max(dt, 0), 0.025);
  let velocity = Math.max(
    -3.5,
    Math.min(3.5, state.velocity + (-12 * state.angle - 2.5 * state.velocity) * step),
  );
  let angle = state.angle + velocity * step;
  if (Math.abs(angle) > OWNER_ANGLE_LIMIT) {
    angle = Math.sign(angle) * OWNER_ANGLE_LIMIT;
    if (Math.sign(velocity) === Math.sign(angle)) velocity *= -0.25;
  }
  return { angle, velocity };
}
