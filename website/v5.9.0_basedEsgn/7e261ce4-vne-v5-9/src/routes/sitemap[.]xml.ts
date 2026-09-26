import { createFileRoute } from "@tanstack/react-router";
const publicPaths = ["/", "/events", "/apply", "/about", "/rules", "/faq", "/contact"];
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicPaths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
      },
    },
  },
});
