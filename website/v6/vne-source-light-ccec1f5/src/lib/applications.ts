/** Заявка на событие (после входа). Не путать с membership request (до аккаунта). */
export type AppStatus =
  | "submitted"
  | "under_review"
  | "needs_info"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

export type ModerationAction = "take" | "request_info" | "approve" | "reject" | "waitlist";
export type GuestAction = "withdraw" | "reply";

/** Таблица переходов — зеркало private.moderate_application / guest_application_action. */
export const TRANSITIONS: Record<
  ModerationAction | GuestAction,
  { from: AppStatus[]; to: AppStatus; by: "staff" | "guest" }
> = {
  take: { from: ["submitted"], to: "under_review", by: "staff" },
  request_info: { from: ["submitted", "under_review"], to: "needs_info", by: "staff" },
  approve: { from: ["submitted", "under_review", "waitlisted"], to: "approved", by: "staff" },
  reject: {
    from: ["submitted", "under_review", "needs_info", "waitlisted"],
    to: "rejected",
    by: "staff",
  },
  waitlist: { from: ["submitted", "under_review"], to: "waitlisted", by: "staff" },
  withdraw: {
    from: ["submitted", "under_review", "needs_info", "waitlisted"],
    to: "withdrawn",
    by: "guest",
  },
  reply: { from: ["needs_info"], to: "under_review", by: "guest" },
};

export function canTransition(status: AppStatus, action: keyof typeof TRANSITIONS): boolean {
  return TRANSITIONS[action].from.includes(status);
}

export const STATUS_LABEL: Record<AppStatus, string> = {
  submitted: "Отправлена",
  under_review: "На рассмотрении",
  needs_info: "Требуется уточнение",
  approved: "Одобрена",
  rejected: "Отказано",
  waitlisted: "Лист ожидания",
  withdrawn: "Отозвана",
};

/** Тексты для гостя: без обещания места, оплаты или входа и без вымышленных причин. */
export const STATUS_TEXT: Record<AppStatus, string> = {
  submitted: "Заявка получена и ждёт рассмотрения командой.",
  under_review: "Команда рассматривает заявку. Решение появится здесь.",
  needs_info:
    "Команда просит уточнение. Ответьте ниже — после ответа заявка вернётся на рассмотрение.",
  approved:
    "Заявка одобрена. Это ещё не оплата и не пропуск: следующие шаги появятся здесь отдельно.",
  rejected: "По этой заявке принято отрицательное решение.",
  waitlisted: "Заявка в листе ожидания. Если решение изменится, статус обновится здесь.",
  withdrawn: "Вы отозвали заявку.",
};

export type NextStep = "apply" | "wait" | "reply" | "none";
export function nextStep(statuses: AppStatus[]): NextStep {
  if (statuses.includes("needs_info")) return "reply";
  if (statuses.some((s) => s === "submitted" || s === "under_review" || s === "waitlisted"))
    return "wait";
  if (statuses.length === 0) return "apply";
  return "none";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateApplicationInput(d: {
  eventId: unknown;
  displayName: unknown;
  ageConfirmed: unknown;
  consent: unknown;
  idempotencyKey: unknown;
}):
  | { ok: true; eventId: string; displayName: string; idempotencyKey: string }
  | { ok: false; message: string } {
  const name = typeof d.displayName === "string" ? d.displayName.trim() : "";
  if (typeof d.eventId !== "string" || !UUID.test(d.eventId))
    return { ok: false, message: "Выберите событие." };
  if (!name || name.length > 80) return { ok: false, message: "Укажите имя до 80 символов." };
  if (d.ageConfirmed !== true) return { ok: false, message: "Подтвердите возраст." };
  if (d.consent !== true) return { ok: false, message: "Подтвердите согласие с условиями." };
  if (typeof d.idempotencyKey !== "string" || !UUID.test(d.idempotencyKey))
    return { ok: false, message: "Обновите страницу." };
  return { ok: true, eventId: d.eventId, displayName: name, idempotencyKey: d.idempotencyKey };
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export const MOD_ACTIONS: ModerationAction[] = [
  "take",
  "request_info",
  "approve",
  "reject",
  "waitlist",
];
export const ACTION_LABEL: Record<ModerationAction, string> = {
  take: "Взять на рассмотрение",
  request_info: "Запросить уточнение",
  approve: "Одобрить",
  reject: "Отказать",
  waitlist: "В лист ожидания",
};

/** Ошибки RPC → безопасный текст. */
export function rpcMessage(code: string | undefined): string {
  if (code === "PT409" || code === "40001")
    return "Карточку уже изменили. Обновите её и проверьте свежий статус.";
  if (code === "PT422")
    return "Этот запрос уже использовался с другими данными. Обновите страницу и отправьте заново.";
  if (code === "42501") return "Доступ закрыт.";
  if (code === "22023") return "Это действие недоступно для текущего статуса.";
  if (code === "P0001") return "Слишком много запросов. Попробуйте позже.";
  return "Не удалось выполнить действие. Попробуйте позже.";
}

/** Статусы, в которых владелец может изменить имя обращения (зеркало guest_update_display_name). */
export const NAME_EDITABLE: readonly AppStatus[] = [
  "submitted",
  "under_review",
  "needs_info",
  "waitlisted",
];
export const canEditName = (s: AppStatus) => NAME_EDITABLE.includes(s);
