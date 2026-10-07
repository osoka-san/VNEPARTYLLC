import { validateServiceUrl, VIEW_TOKEN_RE, sanitizePass } from "../../src/lib/tickets/contract";
function readPassConfig(env: Record<string, string>) {
  const base = validateServiceUrl(env.VNE_PASS_SERVICE_URL, false);
  return base
    ? {
        base,
        adminKey:
          env.VNE_PASS_ADMIN_KEY && env.VNE_PASS_ADMIN_KEY.length >= 32
            ? env.VNE_PASS_ADMIN_KEY
            : null,
      }
    : null;
}
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
type Worker = {
  fetch(request: Request, env: Record<string, string>, ctx: unknown): Promise<Response>;
};
export default function withPublicPass(privateWorker: Worker, appWorker: Worker): Worker {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url),
        config = readPassConfig(env);
      const enabled = env.VNE_TICKETS_PUBLIC_PASS === "1" && Boolean(config?.adminKey);
      if (url.pathname === "/api/tickets/read") {
        if (request.method !== "POST")
          return Response.json({ state: "unavailable" }, { status: 405, headers });
        if (!enabled) return Response.json({ state: "unconfigured" }, { status: 503, headers });
        if (
          request.headers.get("origin") !== url.origin ||
          request.headers.get("sec-fetch-site") === "cross-site"
        )
          return Response.json({ state: "unavailable" }, { status: 403, headers });
        if (!request.headers.get("content-type")?.startsWith("application/json"))
          return Response.json({ state: "invalid" }, { status: 400, headers });
        const reader = request.body?.getReader();
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        if (!reader) return Response.json({ state: "invalid" }, { status: 400, headers });
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.length;
            if (bytes > 1024) {
              await reader.cancel();
              return Response.json({ state: "invalid" }, { status: 413, headers });
            }
            chunks.push(part.value);
          }
          const all = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) {
            all.set(chunk, offset);
            offset += chunk.length;
          }
          const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
          if (typeof input?.token !== "string" || !VIEW_TOKEN_RE.test(input.token))
            return Response.json({ state: "invalid" }, { status: 400, headers });
          const upstream = await fetch(config!.base + "/api/pass/read", {
            method: "POST",
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: input.token }),
          });
          const raw = (await upstream.json()) as Record<string, unknown>,
            pass = upstream.ok ? sanitizePass(raw["pass"]) : null;
          const result = pass
            ? { state: "ok", pass }
            : { state: upstream.status === 404 ? "not_found" : "unavailable" };
          return Response.json(result, {
            status:
              result.state === "ok"
                ? 200
                : result.state === "not_found"
                  ? 404
                  : result.state === "invalid"
                    ? 400
                    : 503,
            headers,
          });
        } catch {
          return Response.json({ state: "unavailable" }, { status: 503, headers });
        }
      }
      if (enabled && url.pathname === "/pass" && ["GET", "HEAD"].includes(request.method)) {
        const response = await appWorker.fetch(request, env, ctx);
        const h = new Headers(response.headers);
        for (const [k, v] of Object.entries(headers)) h.set(k, v);
        return new Response(response.body, { status: response.status, headers: h });
      }
      return privateWorker.fetch(request, env, ctx);
    },
  };
}
