import { useQuery } from "@tanstack/react-query";
export type SiteAccount = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  permissions: string[];
  disabled: boolean;
  version: number;
  createdAt: string;
  lastLoginAt: string | null;
};
export type SiteSession = { actor: SiteAccount; permissionLabels: Record<string, string> };
const messages: Record<string, string> = {
  QUESTIONNAIRE_INVALID_INPUT:
    "Заполните все вопросы и возраст. На текстовый вопрос — от 1 до 3 ответов, каждый до пяти слов и 120 символов. Шкалы и возраст — целые числа от 1 до 100.",
  AUTH_REQUIRED: "Сеанс завершён. Войдите снова.",
  PERMISSION_DENIED: "Для этого действия нужны дополнительные права.",
  OWNER_PROTECTED: "Собственную запись и запись владельца нельзя менять в этом разделе.",
  VERSION_CONFLICT: "Запись уже изменена. Обновите список и откройте её снова.",
  USERNAME_EXISTS: "Этот логин уже занят.",
  INVALID_INPUT: "Проверьте поля. Пароль должен содержать не менее 12 символов.",
  STORAGE_UNAVAILABLE: "Данные временно недоступны. Повторите попытку.",
  REQUEST_INVALID_INPUT: "Проверьте имя, email, Telegram и выбранное событие.",
  REQUEST_NOTE_REQUIRED: "Добавьте комментарий к решению — не менее 3 символов.",
  REQUEST_TRANSITION_INVALID: "Действие недоступно для текущего статуса. Обновите карточку.",
  REQUEST_RATE_LIMITED: "За час можно добавить до 30 тестовых заявок. Повторите позже.",
  REQUESTS_MODE_DISABLED: "Тестовая очередь отключена: подключён основной сервис заявок.",
  CONSENT_REQUIRED: "Подтвердите согласие на обработку данных.",
};
export async function siteAdminRequest<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch("/api/site-admin/" + path, {
    method: payload === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok)
    throw new Error(
      messages[String(data.error)] ?? "Не удалось выполнить действие. Повторите попытку.",
    );
  return data as T;
}
export function useSiteAccess(enabled = true) {
  const query = useQuery({
    queryKey: ["site-admin-session"],
    queryFn: () => siteAdminRequest<SiteSession>("session"),
    staleTime: 30_000,
    retry: false,
    enabled,
  });
  return {
    ...query,
    actor: query.data?.actor,
    can: (permission: string) => query.data?.actor.permissions.includes(permission) === true,
  };
}
export function logAdminActivity(action: "view.section" | "view.unavailable", target: string) {
  void siteAdminRequest("activity", { action, target }).catch(() => {});
}
export type ContentDraft = {
  id: string;
  kind: "page" | "event";
  title: string;
  body: string;
  status: "draft" | "review" | "archived";
  version: number;
  updated_at: string;
};
