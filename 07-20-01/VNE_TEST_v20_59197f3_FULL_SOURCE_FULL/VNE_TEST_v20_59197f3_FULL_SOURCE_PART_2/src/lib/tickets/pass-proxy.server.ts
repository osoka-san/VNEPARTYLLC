/**
 * Серверный прокси к отдельному модулю выдачи (vne-pass-kit). Fail-closed:
 * без валидной конфигурации сеть не используется. Ключи и токены не попадают в ответы и логи.
 */
import {
  ADMIN_PATHS,
  PASS_ID_RE,
  READ_PATH,
  UUID_RE,
  VIEW_TOKEN_RE,
  passPathFromServiceUrl,
  sanitizePass,
  validateManualIssue,
  validateServiceUrl,
  type ServicePath,
} from "./contract";
import type { PassDTO } from "@/components/tickets/types";

export type PassConfig = { base: string; adminKey: string | null };
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function readPassConfig(env: Record<string, string | undefined>): PassConfig | null {
  const development = env["NODE_ENV"] === "development";
  const base = validateServiceUrl(env["VNE_PASS_SERVICE_URL"], development);
  if (!base) return null;
  const key = env["VNE_PASS_ADMIN_KEY"];
  return { base, adminKey: key && key.length >= 32 ? key : null };
}

const ERROR_CODES = new Set([
  "pass_not_found",
  "event_capacity_reached",
  "event_capacity_conflict",
  "event_details_conflict",
  "name_or_telegram_required",
  "invalid_telegram",
  "idempotency_conflict",
  "rate_limited",
  "unauthorized",
]);

export async function callService(
  cfg: PassConfig,
  path: ServicePath,
  body: unknown,
  opts: { admin: boolean; idempotencyKey?: string; fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  if (opts.admin && !cfg.adminKey) return { ok: false, error: "not_configured" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.admin && cfg.adminKey) headers["Authorization"] = `Bearer ${cfg.adminKey}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${cfg.base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    const data = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    if (!res.ok) {
      const code = typeof data["error"] === "string" ? data["error"] : "";
      // Код сервиса отдаём только из allowlist; «unauthorized» модуля = ошибка конфигурации сайта.
      if (code === "unauthorized") return { ok: false, error: "service_misconfigured" };
      return { ok: false, error: ERROR_CODES.has(code) ? code : "service_error" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "service_unavailable" };
  }
}

export type AdminDeps = {
  originOk: boolean;
  staffOk: () => Promise<boolean>;
  config: PassConfig | null;
  fetchImpl?: FetchLike;
};

export type IssuedDTO = {
  pass: PassDTO;
  passPath: string | null;
  duplicate: boolean;
  delivery: { channel: string; state: string }[];
};
export type AdminResult = { ok: true; result: IssuedDTO } | { ok: false; error: string };

function toIssued(data: Record<string, unknown>): IssuedDTO | null {
  const pass = sanitizePass(data["pass"]);
  if (!pass) return null;
  const delivery = Array.isArray(data["delivery"])
    ? (data["delivery"] as Record<string, unknown>[]).map((d) => ({
        channel: String(d["channel"] ?? ""),
        state: String(d["state"] ?? ""),
      }))
    : [];
  return {
    pass,
    passPath: passPathFromServiceUrl(data["url"]),
    duplicate: data["duplicate"] === true,
    delivery,
  };
}

export type AdminAction =
  | { kind: "issue"; input: unknown }
  | { kind: "get"; input: unknown }
  | { kind: "revoke"; input: unknown };

/** Порядок: Origin → вход (валидация) → актуальный staff/MFA guard → конфиг → вызов. */
export async function handleAdminAction(
  action: AdminAction,
  deps: AdminDeps,
): Promise<AdminResult> {
  if (!deps.originOk) return { ok: false, error: "forbidden" };
  const input = action.input as Record<string, unknown> | null;
  let path: ServicePath;
  let body: unknown;
  let idem: string | undefined;
  if (action.kind !== "issue" && action.kind !== "get" && action.kind !== "revoke")
    return { ok: false, error: "invalid_action" };
  if (action.kind === "issue") {
    const key = input?.["idempotencyKey"];
    if (typeof key !== "string" || !UUID_RE.test(key)) return { ok: false, error: "invalid_input" };
    const v = validateManualIssue(input?.["payload"]);
    if (!v.ok) return v;
    path = ADMIN_PATHS.issue;
    body = v.value;
    idem = key;
  } else {
    const id = input?.["id"];
    if (typeof id !== "string" || !PASS_ID_RE.test(id))
      return { ok: false, error: "invalid_input" };
    if (action.kind === "get") {
      path = ADMIN_PATHS.get;
      body = { id };
    } else {
      const reason = input?.["reason"];
      if (typeof reason !== "string" || reason.trim().length < 1 || reason.length > 200)
        return { ok: false, error: "invalid_input" };
      path = ADMIN_PATHS.revoke;
      body = { id, reason: reason.trim() };
    }
  }
  if (!(await deps.staffOk())) return { ok: false, error: "unauthorized" };
  if (!deps.config?.adminKey) return { ok: false, error: "not_configured" };
  const r = await callService(deps.config, path, body, {
    admin: true,
    ...(idem ? { idempotencyKey: idem } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  if (!r.ok) return r;
  if (action.kind === "revoke") {
    // Ответ revoke — только статус; перечитываем карточку.
    const again = await callService(
      deps.config,
      ADMIN_PATHS.get,
      { id: (body as { id: string }).id },
      { admin: true, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
    );
    if (!again.ok) return again;
    const issued = toIssued(again.data);
    return issued ? { ok: true, result: issued } : { ok: false, error: "service_error" };
  }
  const issued = toIssued(r.data);
  return issued ? { ok: true, result: issued } : { ok: false, error: "service_error" };
}

export type ReadResult =
  | { state: "ok"; pass: PassDTO }
  | { state: "invalid" | "not_found" | "unconfigured" | "unavailable" };

/** Чтение по токену предъявителя: без admin key, без погашения. */
export async function handleReadPass(
  input: unknown,
  deps: { originOk: boolean; config: PassConfig | null; fetchImpl?: FetchLike },
): Promise<ReadResult> {
  if (!deps.originOk) return { state: "unavailable" };
  const token = (input as Record<string, unknown> | null)?.["token"];
  if (typeof token !== "string" || !VIEW_TOKEN_RE.test(token)) return { state: "invalid" };
  if (!deps.config) return { state: "unconfigured" };
  const r = await callService(
    deps.config,
    READ_PATH,
    { token },
    { admin: false, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
  );
  if (!r.ok) return { state: r.error === "pass_not_found" ? "not_found" : "unavailable" };
  const pass = sanitizePass(r.data["pass"] ?? r.data);
  return pass ? { state: "ok", pass } : { state: "unavailable" };
}

type TicketStaffClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims?: { sub?: string; aal?: string } } | null;
      error?: unknown;
    }>;
  };
  rpc: (
    name: "my_staff_access" | "staff_can",
    args: Record<string, string>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Проверяется заново для каждого действия; общий доступ в admin не даёт права выдачи. */
export async function checkTicketStaffAccess(client: TicketStaffClient | null): Promise<boolean> {
  if (!client) return false;
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims?.sub || data.claims.aal !== "aal2") return false;
    const access = await client.rpc("my_staff_access", { _area: "admin" });
    if (access.error || access.data !== true) return false;
    const capability = await client.rpc("staff_can", { _cap: "events_manage" });
    return !capability.error && capability.data === true;
  } catch {
    return false;
  }
}

/** Актуальные aal2, staff-сессия и право events_manage; обновлённые cookie сохраняются. */
export async function staffAdminOk(request: Request): Promise<boolean> {
  const { createRequestClient } = await import("@/lib/auth/supabase.server");
  const ctx = createRequestClient(request);
  if (!ctx) return false;
  try {
    return await checkTicketStaffAccess(ctx.supabase);
  } catch {
    return false;
  } finally {
    if (ctx.pending.length) {
      const { serializeCookieHeader } = await import("@supabase/ssr");
      const { setResponseHeader } = await import("@tanstack/react-start/server");
      setResponseHeader(
        "Set-Cookie",
        ctx.pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
      );
    }
  }
}
