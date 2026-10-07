/**
 * Fail-closed конфигурация доступа (день 04).
 * Бэкенд считается включённым, только если заданы ВСЕ переменные и среда разрешена.
 * Чистая функция: принимает объект окружения, ничего не читает сама и не ходит в сеть.
 */
export type AuthEnvName = "development" | "staging";

export type AuthConfig =
  | { enabled: true; env: AuthEnvName; url: string; publishableKey: string; siteUrl: string }
  | { enabled: false; reason: AuthDisabledReason };

export type AuthDisabledReason =
  | "not_configured"
  | "env_not_allowed"
  | "invalid_url"
  | "insecure_url"
  | "blocked_project"
  | "invalid_site_url";

/**
 * Проекты, назначение которых как тестовых не подтверждено владельцем.
 * xrocuwlofxhxoxajukne снят 25.09.2026: владелец назначил его тестовой средой.
 */
export const BLOCKED_PROJECT_REFS: string[] = [];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Адрес предпросмотра для ссылок из писем, если VNE_SITE_URL не задан (бэкенд Lovable Cloud). */
export const CLOUD_DEFAULT_SITE_URL =
  "https://id-preview--7e261ce4-c261-40b6-b169-b9806a6e37d7.lovable.app";

export function readAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  // Явный набор VNE_* имеет приоритет. Если VNE_SUPABASE_URL не задан, используется
  // подключённый бэкенд Lovable Cloud (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY), среда staging.
  const explicit = Boolean(env["VNE_SUPABASE_URL"]?.trim());
  const cloud =
    !explicit && Boolean(env["SUPABASE_URL"]?.trim() && env["SUPABASE_PUBLISHABLE_KEY"]?.trim());
  const envName = env["VNE_AUTH_ENV"]?.trim() || (cloud ? "staging" : undefined);
  const url = (
    explicit ? env["VNE_SUPABASE_URL"] : cloud ? env["SUPABASE_URL"] : undefined
  )?.trim();
  const key = (
    explicit
      ? env["VNE_SUPABASE_PUBLISHABLE_KEY"]
      : cloud
        ? env["SUPABASE_PUBLISHABLE_KEY"]
        : undefined
  )?.trim();
  const site = env["VNE_SITE_URL"]?.trim() || (cloud ? CLOUD_DEFAULT_SITE_URL : undefined);
  if (!envName || !url || !key || !site) return { enabled: false, reason: "not_configured" };
  if (envName !== "development" && envName !== "staging")
    return { enabled: false, reason: "env_not_allowed" };
  let parsed: URL;
  let siteParsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { enabled: false, reason: "invalid_url" };
  }
  try {
    siteParsed = new URL(site);
  } catch {
    return { enabled: false, reason: "invalid_site_url" };
  }
  const local = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && envName === "development"))
    return { enabled: false, reason: "insecure_url" };
  if (BLOCKED_PROJECT_REFS.some((ref) => parsed.hostname.startsWith(`${ref}.`)))
    return { enabled: false, reason: "blocked_project" };
  if (siteParsed.protocol !== "https:" && !LOCAL_HOSTS.has(siteParsed.hostname))
    return { enabled: false, reason: "invalid_site_url" };
  // Секретные ключи в этот клиент не допускаются: только publishable/anon.
  if (key.startsWith("sb_secret_")) return { enabled: false, reason: "not_configured" };
  return {
    enabled: true,
    env: envName,
    url: parsed.origin,
    publishableKey: key,
    siteUrl: siteParsed.origin,
  };
}

export const DISABLED_MESSAGE =
  "Вход временно недоступен: тестовая среда ещё не подключена. Данные не отправляются.";
