import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  TICKET_PATHS,
  type TicketAction,
  type TicketResult,
  type TicketResponse,
} from "./workspace-contract";

function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
async function staffToken(area: "admin" | "scan") {
  const { createRequestClient } = await import("@/lib/auth/supabase.server");
  const ctx = createRequestClient(getRequest());
  if (!ctx) return null;
  try {
    const { data, error } = await ctx.supabase.auth.getClaims();
    if (error || !data?.claims?.sub || data.claims.aal !== "aal2") return null;
    const role = await ctx.supabase.rpc("my_staff_access", { _area: area });
    if (role.error || role.data !== true) return null;
    if (area === "admin") {
      const capability = await ctx.supabase.rpc("staff_can", { _cap: "events_manage" });
      if (capability.error || capability.data !== true) return null;
    }
    const session = await ctx.supabase.auth.getSession();
    return session.error ? null : (session.data.session?.access_token ?? null);
  } finally {
    if (ctx.pending.length) {
      const { serializeCookieHeader } = await import("@supabase/ssr");
      setResponseHeader(
        "Set-Cookie",
        ctx.pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
      );
    }
  }
}
export const getTicketServiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  privateResponse();
  const { readPassConfig } = await import("./pass-proxy.server");
  const config = readPassConfig(process.env);
  return { issueEnabled: Boolean(config?.adminKey && (await staffToken("admin"))) };
});
export const ticketAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<TicketResult> => {
    privateResponse();
    const { isSameOrigin } = await import("@/lib/auth/auth-core");
    const request = getRequest();
    if (!isSameOrigin(request.headers.get("origin"), request.url))
      return { ok: false, error: "forbidden" };
    if (!data || typeof data !== "object") return { ok: false, error: "invalid_input" };
    const input = data as { action?: unknown; body?: unknown; operationId?: unknown };
    if (
      typeof input.action !== "string" ||
      !Object.hasOwn(TICKET_PATHS, input.action) ||
      !input.body ||
      typeof input.body !== "object" ||
      JSON.stringify(input.body).length > 16000
    )
      return { ok: false, error: "invalid_input" };
    const action = input.action as TicketAction;
    const jwt = await staffToken(
      ["scanCatalog", "verify", "checkin"].includes(action) ? "scan" : "admin",
    );
    if (!jwt) return { ok: false, error: "forbidden" };
    const { readPassConfig } = await import("./pass-proxy.server");
    const { sanitizePass, passPathFromServiceUrl, UUID_RE } = await import("./contract");
    const config = readPassConfig(process.env);
    if (!config?.adminKey) return { ok: false, error: "not_configured" };
    if (
      action === "issue" &&
      (typeof input.operationId !== "string" || !UUID_RE.test(input.operationId))
    )
      return { ok: false, error: "invalid_input" };
    try {
      const response = await fetch(config.base + TICKET_PATHS[action], {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.adminKey}`,
          "X-VNE-User-JWT": jwt,
          ...(action === "issue" ? { "Idempotency-Key": String(input.operationId) } : {}),
        },
        body: JSON.stringify(input.body),
      });
      const raw = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const { TICKET_ERRORS } = await import("./workspace-contract");
        const code = typeof raw["error"] === "string" ? raw["error"] : "";
        return {
          ok: false,
          error: Object.hasOwn(TICKET_ERRORS, code) ? code : "service_unavailable",
        };
      }
      const result: TicketResponse = {};
      if (raw["pass"]) {
        const pass = sanitizePass(raw["pass"]);
        if (!pass) return { ok: false, error: "service_unavailable" };
        result.pass = pass;
        result.passPath = passPathFromServiceUrl(raw["url"]);
      }
      if (action === "catalog" || action === "scanCatalog")
        result.events = (Array.isArray(raw["events"]) ? raw["events"] : []) as NonNullable<
          TicketResponse["events"]
        >;
      if (action === "list")
        result.items = (Array.isArray(raw["items"]) ? raw["items"] : [])
          .map(sanitizePass)
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (action === "history")
        result.history = (Array.isArray(raw["items"]) ? raw["items"] : []) as NonNullable<
          TicketResponse["history"]
        >;
      if (typeof raw["outcome"] === "string") result.outcome = raw["outcome"];
      result.duplicate = raw["duplicate"] === true;
      result.replayed = raw["replayed"] === true;
      return { ok: true, data: result };
    } catch {
      return { ok: false, error: "service_unavailable" };
    }
  });
