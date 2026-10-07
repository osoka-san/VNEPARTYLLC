import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { MEDIA_SLOTS, isValidChoice, type MediaOverrides } from "./media-library";

async function staffActor() {
  const { staffActor: run } = await import("./staff-actor.server");
  return run();
}

/** Публичное чтение замен изображений (не содержит личных данных). */
export const getMediaOverrides = createServerFn({ method: "GET" }).handler(async () => {
  const out: MediaOverrides = {};
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return out;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).from("site_media").select("slot, value");
    for (const r of (data ?? []) as { slot: string; value: MediaOverrides[string] }[])
      out[r.slot] = r.value;
  } catch {
    // Сбой чтения → утверждённый набор.
  }
  return out;
});

/** Сохранить выбор слота. Пустой part-объект = вернуть утверждённое изображение. */
export const saveMediaSlot = createServerFn({ method: "POST" })
  .inputValidator((d: { slot: unknown; value: unknown }) => d)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const slot = MEDIA_SLOTS.find((s) => s.key === data.slot);
    if (!slot || !data.value || typeof data.value !== "object")
      return { ok: false as const, message: "Неизвестный раздел." };
    const parts = slot.kind === "gallery" ? ["desktop", "mobile"] : ["image"];
    const value: Record<string, unknown> = {};
    for (const [part, choice] of Object.entries(data.value as Record<string, unknown>)) {
      if (!parts.includes(part)) return { ok: false as const, message: "Неверные данные." };
      if (choice == null) continue;
      if (!isValidChoice(slot, part, choice))
        return { ok: false as const, message: "Изображение недоступно." };
      value[part] = choice;
    }
    const actor = await staffActor();
    if (!actor) return { ok: false as const, message: "Доступ закрыт." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (supabaseAdmin as any).from("site_media");
    const { error } = Object.keys(value).length
      ? await t.upsert({
          slot: slot.key,
          value,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        })
      : await t.delete().eq("slot", slot.key);
    if (error) return { ok: false as const, message: "Не удалось сохранить." };
    return { ok: true as const, message: "Сохранено и опубликовано." };
  });

const TYPES: Record<string, string> = {
  "image/avif": "avif",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Загрузка своего файла (AVIF/WebP/JPEG/PNG до 8 МБ) в закрытое хранилище. */
export const uploadMediaFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("bad input");
    const f = d.get("file");
    if (!(f instanceof File)) throw new Error("bad input");
    return f;
  })
  .handler(async ({ data: file }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const ext = TYPES[file.type];
    if (!ext) return { ok: false as const, message: "Нужен файл AVIF, WebP, JPEG или PNG." };
    if (file.size > 8 * 1024 * 1024) return { ok: false as const, message: "Файл больше 8 МБ." };
    const actor = await staffActor();
    if (!actor) return { ok: false as const, message: "Доступ закрыт." };
    const path = `uploads/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("site-media")
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (error) return { ok: false as const, message: "Не удалось загрузить файл." };
    return { ok: true as const, path };
  });
