/**
 * Проверка адреса возврата после входа: только известные внутренние маршруты.
 * Внешние URL, protocol-relative (//), обратные слэши и неизвестные пути → запасной маршрут.
 */
const ALLOWED_PREFIXES = [
  "/member",
  "/admin",
  "/scan",
  "/events",
  "/apply",
  "/auth/reset",
] as const;

export function safeRedirect(raw: unknown, fallback = "/member"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex -- намеренно отсекаем управляющие символы
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "https://vne.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://vne.invalid") return fallback;
  // The self-service TEST scanner setup is an exact endpoint, never a new prefix.
  const ok =
    raw === "/scanner/mfa" ||
    ALLOWED_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
  return ok ? `${url.pathname}${url.search}${url.hash}` : fallback;
}
