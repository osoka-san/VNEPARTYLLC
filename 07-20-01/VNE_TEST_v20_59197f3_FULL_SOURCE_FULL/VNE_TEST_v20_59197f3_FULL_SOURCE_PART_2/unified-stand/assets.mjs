// Exact emitted-file dispatch only. Never let missing/static HTML fall back to application SSR.
const TYPES = {
  js: ["text/javascript", "application/javascript"],
  css: ["text/css"],
  svg: ["image/svg+xml"],
  png: ["image/png"],
  webp: ["image/webp"],
  avif: ["image/avif"],
  woff: ["font/woff", "application/font-woff", "application/x-font-woff"],
  woff2: ["font/woff2", "application/font-woff2"],
  ttf: ["font/ttf", "application/x-font-ttf"],
  otf: ["font/otf", "application/x-font-opentype"],
};
function discard(response) {
  try {
    void response.body?.cancel().catch(() => {});
  } catch {
    /* No body is retained. */
  }
}
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export async function serveUnifiedAsset(request, env) {
  const head = request.method === "HEAD";
  const fail = (status) =>
    new Response(head ? null : "Static asset unavailable", {
      status,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  if (!["GET", "HEAD"].includes(request.method)) return fail(405);
  if (typeof env?.ASSETS?.fetch !== "function") return fail(503);
  let response;
  try {
    response = await env.ASSETS.fetch(request);
  } catch {
    return fail(503);
  }
  const extension = new URL(request.url).pathname.split(".").at(-1);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (
    response.status !== 200 ||
    response.headers.has("location") ||
    !TYPES[extension]?.includes(type)
  ) {
    discard(response);
    return fail(404);
  }
  const safe = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) safe.set(name, value);
  safe.delete("set-cookie");
  if (head) discard(response);
  return new Response(head ? null : response.body, { status: 200, headers: safe });
}
