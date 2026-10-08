import type { PassDTO } from "@/components/tickets/types";
export const TICKET_PATHS = {
  issue: "/api/admin/issue",
  catalog: "/api/admin/catalog",
  list: "/api/admin/list",
  get: "/api/admin/get",
  history: "/api/admin/history",
  revoke: "/api/admin/revoke",
  scanCatalog: "/api/scan/catalog",
  verify: "/api/scan/verify",
  checkin: "/api/scan/checkin",
} as const;
export type TicketAction = keyof typeof TICKET_PATHS;
export type TicketEvent = {
  id: string;
  title: string;
  startsAt: string;
  timezone: string;
  capacity: number | null;
  taken: number;
  synthetic: boolean;
  entryOpensAt: string | null;
  entryClosesAt: string | null;
  qrReleaseAt: string | null;
};
export type TicketHistory = {
  id: number;
  action: string;
  outcome: string;
  detail: string | null;
  occurred_at: string;
};
export type TicketResponse = {
  pass?: PassDTO;
  passPath?: string | null;
  duplicate?: boolean;
  events?: TicketEvent[];
  items?: PassDTO[];
  history?: TicketHistory[];
  outcome?: string;
  replayed?: boolean;
};
export type TicketResult = { ok: true; data: TicketResponse } | { ok: false; error: string };
export const TICKET_ERRORS: Record<string, string> = {
  not_configured: "Сервис выдачи ещё не подключён.",
  forbidden: "Нужны действующее назначение и вход со вторым фактором.",
  unauthorized: "Войдите в служебный аккаунт со вторым фактором.",
  invalid_input: "Проверьте поля формы.",
  invalid_name: "Введите имя гостя (до 80 символов).",
  event_capacity_reached: "Все места заняты. Обновите список мероприятия.",
  event_window_required:
    "У мероприятия должны быть настроены время открытия и закрытия входа, выпуск QR и вместимость.",
  event_unavailable: "Мероприятие закрыто или отменено.",
  event_not_found: "Мероприятие не найдено.",
  invalid_valid_until: "Срок билета должен заканчиваться в пределах времени входа.",
  pass_not_found: "Билет не найден.",
  version_conflict: "Состояние изменилось. Обновите билет и повторите действие.",
  already_used: "Билет уже использован; отозвать его нельзя.",
  idempotency_conflict: "Состав операции изменился. Обновите список перед новой выдачей.",
  ticket_exists: "Для этого участия билет уже выпущен.",
  participation_inactive: "Участие или оплаченный заказ больше не действуют.",
  invalid_design: "Выбранный паттерн не поддерживается.",
  invalid_token: "Нужен QR билета ВНЕ.",
  token_key_unavailable: "Ключ билета временно недоступен. Обратитесь к администратору.",
};
export function ticketError(code: string) {
  return (
    TICKET_ERRORS[code] ??
    "Ответ сервиса не получен. Результат операции неизвестен: повторите тот же запрос или обновите список билетов."
  );
}
export function scanToken(text: string) {
  const match = /^VNE1:([A-Za-z0-9_-]{43})$/.exec(text.trim());
  return match?.[1] ?? null;
}
