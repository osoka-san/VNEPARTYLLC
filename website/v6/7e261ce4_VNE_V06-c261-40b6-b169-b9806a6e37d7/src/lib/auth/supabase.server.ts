/**
 * Request-scoped SSR-клиент. Создаётся на каждый запрос, без модульного синглтона.
 * Возвращает null, если конфигурация не разрешена: сеть не используется.
 */
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { readAuthConfig, type AuthConfig } from "./config";

export type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

export function getAuthConfig(): AuthConfig {
  return readAuthConfig(process.env as Record<string, string | undefined>);
}

export function createRequestClient(request: Request) {
  const config = getAuthConfig();
  if (!config.enabled) return null;
  const pending: CookieToSet[] = [];
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookies) {
        for (const c of cookies) pending.push(c as CookieToSet);
      },
    },
    cookieOptions: { sameSite: "lax", secure: config.siteUrl.startsWith("https:"), path: "/" },
  });
  return { supabase, config, pending };
}

/** Заголовки приватного ответа: без кэширования и индексации, все Set-Cookie сохранены. */
export function privateHeaders(pending: CookieToSet[], base?: HeadersInit): Headers {
  const h = new Headers(base);
  h.set("Cache-Control", "private, no-store");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Vary", "Cookie");
  for (const c of pending)
    h.append("Set-Cookie", serializeCookieHeader(c.name, c.value, c.options));
  return h;
}
