import { createFileRoute } from "@tanstack/react-router";
import { isUploadPath } from "@/lib/media-library";

const TYPES: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
};

// Отдаёт загруженные из админки изображения из закрытого хранилища. Имена файлов уникальны,
// поэтому кешируются навсегда.
export const Route = createFileRoute("/api/public/site-media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!isUploadPath(path)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("site-media").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(data, {
          headers: {
            "Content-Type": TYPES[path.split(".").pop()!]!,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
