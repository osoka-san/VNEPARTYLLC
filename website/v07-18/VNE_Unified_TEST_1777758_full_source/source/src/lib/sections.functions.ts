import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { SITE_SECTIONS, isSectionKey } from "./sections";

export type SectionDto = {
  key: string;
  area: string;
  title: string;
  body: string;
  status: "draft" | "published" | "default";
  updatedAt: string | null;
};

async function staffActor() {
  const { staffActor: run } = await import("./staff-actor.server");
  return run();
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

/** Публичное чтение только опубликованных блоков (RLS: status = 'published'). */
export const getPublishedSections = createServerFn({ method: "GET" })
  .inputValidator((d: { keys: string[] }) => ({ keys: d.keys.filter(isSectionKey).slice(0, 20) }))
  .handler(async ({ data }) => {
    const out: Record<string, { title: string; body: string }> = {};
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key || !data.keys.length) return out;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
              h.delete("Authorization");
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      });
      const { data: rows } = await sb
        .from("site_sections")
        .select("key, title, body")
        .eq("status", "published")
        .in("key", data.keys);
      for (const r of rows ?? []) out[r.key] = { title: r.title, body: r.body };
    } catch {
      // Сбой чтения → тексты по умолчанию.
    }
    return out;
  });
