import { ENGINE_VERSION, parsePattern, type Pattern } from "./pattern";
export type SavedPattern = {
  id: string;
  version: number;
  pattern: Pattern;
  engineVersion: string;
  archived: boolean;
  createdAt: string;
};
export type SaveRequest = {
  id: string;
  expectedVersion: number;
  operationId: string;
  pattern: Pattern;
  archived: boolean;
  engineVersion: typeof ENGINE_VERSION;
};
const MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "У вас режим просмотра. Сохранение и архивирование доступны пользователям с правом изменения QR.",
  AUTH_REQUIRED: "Сеанс завершён. Войдите на сайт снова; текущие настройки остаются в редакторе.",
  STAFF_GUARD_REQUIRED:
    "Библиотека закрыта до подключения прав команды. Генератор и экспорт файлов доступны.",
  STORAGE_UNAVAILABLE:
    "Хранилище временно недоступно. Настройки остаются в редакторе. Повторите сохранение позже.",
  VERSION_CONFLICT:
    "Паттерн уже изменён в другой вкладке. Откройте актуальную версию из библиотеки или сохраните свой вариант как копию.",
  OPERATION_REUSED: "Не удалось подтвердить сохранение. Обновите библиотеку перед новой попыткой.",
  INVALID_INPUT: "Проверьте название и настройки паттерна.",
  ORIGIN_REJECTED: "Запрос отклонён. Откройте студию на основном адресе сайта.",
  BODY_TOO_LARGE: "Настройки слишком большого размера.",
};
export class LibraryError extends Error {
  constructor(public code: string) {
    super(
      MESSAGES[code] ?? "Не удалось связаться с библиотекой. Ваши настройки остались в редакторе.",
    );
  }
}
function record(value: unknown): SavedPattern {
  if (!value || typeof value !== "object") throw new LibraryError("INVALID_RESPONSE");
  const r = value as Record<string, unknown>;
  if (
    typeof r["id"] !== "string" ||
    !Number.isSafeInteger(r["version"]) ||
    typeof r["engineVersion"] !== "string" ||
    typeof r["archived"] !== "boolean" ||
    typeof r["createdAt"] !== "string"
  )
    throw new LibraryError("INVALID_RESPONSE");
  return {
    id: r["id"],
    version: Number(r["version"]),
    engineVersion: r["engineVersion"],
    archived: r["archived"],
    createdAt: r["createdAt"],
    pattern: parsePattern(r["pattern"]),
  };
}
async function request(query = "", payload?: SaveRequest) {
  let response: Response;
  try {
    response = await fetch(`/api/qr-studio/patterns${query}`, {
      method: payload ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      ...(payload
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
        : {}),
    });
  } catch {
    throw new LibraryError("NETWORK_ERROR");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new LibraryError("INVALID_RESPONSE");
  }
  if (!response.ok || data.ok !== true)
    throw new LibraryError(typeof data.error === "string" ? data.error : "INVALID_RESPONSE");
  return data;
}
export async function listPatterns(page = 0, archived = false, q = "") {
  const data = await request(
    `?${new URLSearchParams({ page: String(page), archived: archived ? "1" : "0", q })}`,
  );
  if (!Array.isArray(data.items)) throw new LibraryError("INVALID_RESPONSE");
  return { items: data.items.map(record), hasMore: !!data.hasMore };
}
export async function patternHistory(id: string) {
  const data = await request(`?${new URLSearchParams({ id })}`);
  if (!Array.isArray(data.items)) throw new LibraryError("INVALID_RESPONSE");
  return data.items.map(record);
}
export async function savePattern(payload: SaveRequest) {
  return record((await request("", payload)).item);
}
