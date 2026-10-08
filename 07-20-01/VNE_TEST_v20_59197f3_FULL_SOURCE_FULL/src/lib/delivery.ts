/** Режим внешней доставки (письма/Telegram). По умолчанию выключен: fail-closed. */
export type DeliveryMode = "disabled" | "live";

export function deliveryMode(env: Record<string, string | undefined>): DeliveryMode {
  return env["VNE_DELIVERY_MODE"]?.trim() === "live" ? "live" : "disabled";
}

/** Черновик текста согласия: только тестовая среда, юридическая готовность не заявлена. */
export const CONSENT_VERSION = "draft-2026-09";
