import { sanitizeLoadingSettings, loadingVariables } from "../../src/lib/loading-settings";

/** Public visual settings only; identity, permissions and other settings stay server-side. */
export function loadingBootstrapMarkup(input: unknown) {
  const settings = sanitizeLoadingSettings(input);
  const declarations = Object.entries(loadingVariables(settings))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return `<style id="vne-loading-presentation">:root{${declarations}}</style><script type="application/json" id="vne-loading-defaults">${JSON.stringify(settings)}</script>`;
}

export default function withLoadingPresentation(worker: {
  fetch(request: Request, env: any, ctx: any): Promise<Response>;
}) {
  return {
    async fetch(request: Request, env: any, ctx: any) {
      const response = await worker.fetch(request, env, ctx);
      if (request.method === "HEAD" || !response.headers.get("content-type")?.includes("text/html"))
        return response;
      let config: unknown;
      try {
        const row = await env.DB?.prepare(
          "SELECT settings FROM site_preview_defaults WHERE key = 'site'",
        ).first();
        config = row?.settings ? JSON.parse(row.settings).loading : undefined;
      } catch {
        /* An optional presentation setting must not break login or the public pass. */
      }
      const html = await response.text();
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      headers.set("Cache-Control", "private, no-store");
      return new Response(html.replace("</head>", loadingBootstrapMarkup(config) + "</head>"), {
        status: response.status,
        headers,
      });
    },
  };
}
