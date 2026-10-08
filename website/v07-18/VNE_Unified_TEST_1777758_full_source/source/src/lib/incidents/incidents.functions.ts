import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { runIncidentAction, type Action, type IncidentPort } from "./incident-server";

/** Default-off TEST-only route. No D1 actor, service key, role assignment or automatic fallback. */
export const incidentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("X-Robots-Tag", "noindex, nofollow");
    setResponseHeader("Vary", "Cookie");
    const request = getRequest();
    const { getAuthConfig, createRequestClient } = await import("../auth/supabase.server");
    const config = getAuthConfig();
    let pending: { name: string; value: string; options: Record<string, unknown> }[] = [];
    const input =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    if (Object.keys(input).some((key) => key !== "action" && key !== "payload"))
      return { ok: false as const, reason: "invalid" as const };
    try {
      const result = await runIncidentAction({
        configuration: {
          enabled: config.enabled,
          mode: process.env["VNE_INCIDENTS_MODE"] ?? "disabled",
          projectUrl: config.enabled ? config.url : "",
        },
        action: input["action"] as Action,
        payload: input["payload"],
        requestUrl: request.url,
        origin: request.headers.get("origin"),
        method: request.method,
        openPort: async (): Promise<IncidentPort> => {
          const context = createRequestClient(request);
          if (!context) throw new Error("unconfigured");
          pending = context.pending;
          return {
            async verifyIdentity() {
              const { data: userResult, error } = await context.supabase.auth.getUser();
              if (error || !userResult.user || userResult.user.is_anonymous !== false) return null;
              const { data: claimResult, error: claimError } =
                await context.supabase.auth.getClaims();
              const claims = claimResult?.claims as { sub?: string; aal?: string } | undefined;
              if (claimError || !claims?.sub) return null;
              return {
                userId: userResult.user.id,
                claimsSubject: claims.sub,
                aal: claims.aal ?? "",
                anonymous: false,
              };
            },
            async rpc(name, args) {
              const client = context.supabase as unknown as {
                rpc: (
                  n: string,
                  a: Record<string, unknown>,
                ) => Promise<{ data: unknown; error: { code?: string } | null }>;
              };
              return client.rpc(name, args);
            },
          };
        },
      });
      return result.ok ? { ok: true as const, dataJson: JSON.stringify(result.data) } : result;
    } finally {
      if (pending.length) {
        const { serializeCookieHeader } = await import("@supabase/ssr");
        setResponseHeader(
          "Set-Cookie",
          [...new Map(pending.map((cookie) => [cookie.name, cookie])).values()].map((cookie) =>
            serializeCookieHeader(cookie.name, cookie.value, cookie.options),
          ),
        );
      }
    }
  });
