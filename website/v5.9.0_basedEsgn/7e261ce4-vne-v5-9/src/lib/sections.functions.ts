import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { SITE_SECTIONS, isSectionKey } from "./sections";

export type SectionDto = {
  key: string;
  area: string;
  title: string;
  body: string;
  status: "draft" | "published" | "default";
  updatedAt: string | null;
};

async function flushCookies(
  pending: { name: string; value: string; options: Record<string, unknown> }[],
) {
  if (!pending.length) return;
  const { serializeCookieHeader } = await import("@supabase/ssr");
  setResponseHeader(
    "Set-Cookie",
    pending.map((c) => serializeCookieHeader(c.name, c.value, c.options)),
  );
}

async function staffActor() {
  const { createRequestClient } = await import("./auth/supabase.server");
  const ctx = createRequestClient(getRequest());
  if (!ctx) return null;
  const { data: u } = await ctx.supabase.auth.getUser();
  const { data: c } = await ctx.supabase.auth.getClaims();
  if (!u.user || (c?.claims as { aal?: string } | undefined)?.aal !== "aal2") {
    await flushCookies(ctx.pending);
    return null;
  }
  // Возможность content (owner/admin/editor), не общий /admin guard.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ok } = await (ctx.supabase as any).rpc("staff_can", { _cap: "content" });
  await flushCookies(ctx.pending);
  return ok === true ? u.user.id : null;
}

export const listSections = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await staffActor();
  if (!actor) return { ok: false as const, sections: [] as SectionDto[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("site_sections")
    .select("key, title, body, status, updated_at");
  const rows = new Map((data ?? []).map((r) => [r.key, r]));
  return {
    ok: true as const,
    sections: SITE_SECTIONS.map((s): SectionDto => {
      const r = rows.get(s.key);
      return r
        ? {
            key: s.key,
            area: s.area,
            title: r.title,
            body: r.body,
            status: r.status as "draft" | "published",
            updatedAt: r.updated_at,
          }
        : {
            key: s.key,
            area: s.area,
            title: s.title,
            body: s.body,
            status: "default",
            updatedAt: null,
          };
    }),
  };
});

export const saveSection = createServerFn({ method: "POST" })
  .inputValidator((d: { key: unknown; title: unknown; body: unknown; publish: unknown }) => d)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const body = typeof data.body === "string" ? data.body.trim() : "";
    if (!isSectionKey(data.key) || !title || title.length > 120 || body.length > 4000)
      return { ok: false as const, message: "Проверьте заголовок (до 120) и текст (до 4000)." };
    const actor = await staffActor();
    if (!actor) return { ok: false as const, message: "Доступ закрыт." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("save_site_section", {
      _key: data.key,
      _title: title,
      _body: body,
      _status: data.publish === true ? "published" : "draft",
      _actor: actor,
    });
    if (error) return { ok: false as const, message: "Не удалось сохранить." };
    return {
      ok: true as const,
      message: data.publish === true ? "Опубликовано." : "Черновик сохранён.",
    };
  });
