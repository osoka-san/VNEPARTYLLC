import type { RequestStatus } from "./site-requests";
export type MemberProfile = {
  username: string;
  displayName: string;
  version: number;
  createdAt: string;
};
export type MemberRequest = {
  id: string;
  name: string;
  email: string;
  telegram: string;
  eventKey: string;
  eventTitle: string;
  details: string;
  status: RequestStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type MemberList = {
  profile: MemberProfile;
  items: MemberRequest[];
  total: number;
  page: number;
  pageSize: number;
};
export type MemberDetail = {
  item: MemberRequest;
  history: {
    id: string;
    action: string;
    toStatus: RequestStatus;
    reply: string;
    message?: string;
    createdAt: string;
  }[];
};
export const MEMBER_STATUS_TEXT: Record<RequestStatus, string> = {
  submitted: "Заявка сохранена и ожидает рассмотрения.",
  under_review: "Команда рассматривает заявку. Новый статус появится здесь.",
  needs_info: "Для рассмотрения нужны дополнительные сведения. Добавь уточнение в карточке заявки.",
  waitlisted: "Заявка в листе ожидания. Это ещё не подтверждение участия.",
  approved: "Заявка одобрена в тестовой очереди. Это не подтверждает участие и не создаёт пропуск.",
  rejected: "Рассмотрение этой тестовой заявки завершено без одобрения.",
};
const messages: Record<string, string> = {
  AUTH_REQUIRED: "Сеанс завершён. Войди снова.",
  STORAGE_UNAVAILABLE: "Не удалось загрузить данные. Повтори попытку.",
  VERSION_CONFLICT: "Данные изменились. Обнови кабинет перед повторной попыткой.",
  REQUESTS_MODE_DISABLED:
    "Тестовый кабинет отключён. Обнови страницу, чтобы перейти к текущему кабинету.",
  NOT_FOUND: "Эта заявка недоступна в твоём кабинете.",
  PROFILE_INVALID_INPUT: "Укажи имя от 1 до 80 символов.",
  PASSWORD_INVALID_INPUT:
    "Новый пароль должен содержать от 12 до 200 символов, а повтор — совпадать с ним.",
  PASSWORD_INCORRECT: "Текущий пароль не совпадает.",
  PASSWORD_RATE_LIMITED: "Слишком много попыток. Повтори через 15 минут.",
  REPLY_INVALID_INPUT: "Уточнение должно содержать от 3 до 1000 символов.",
  REQUEST_TRANSITION_INVALID: "Сейчас уточнение не требуется. Обнови карточку заявки.",
};
export class MemberApiError extends Error {
  constructor(public code: string) {
    super(messages[code] || "Не удалось выполнить действие. Повтори попытку.");
  }
}
export async function memberRequest<T>(path = "", data?: unknown): Promise<T> {
  const response = await fetch("/api/site-member" + path, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    ...(data === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new MemberApiError(result.error);
  return result;
}
