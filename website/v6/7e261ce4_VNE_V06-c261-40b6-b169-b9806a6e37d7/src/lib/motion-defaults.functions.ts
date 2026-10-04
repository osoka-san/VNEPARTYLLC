import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  MOTION_SCHEMA_VERSION,
  defaultMotionSettings,
  parseImportedSettings,
  type MotionSettings,
} from "./motion-settings";

async function contentEditor() {
  setResponseHeader("Cache-Control", "private, no-store");
  const { createRequestClient } = await import("./auth/supabase.server");
  const ctx = createRequestClient(getRequest());
  if (!ctx) return null;
  const { data: userData } = await ctx.supabase.auth.getUser();
  const { data: claimsData } = await ctx.supabase.auth.getClaims();
  const claims = claimsData?.claims as { aal?: string } | undefined;
  let allowed = false;
  if (userData.user && claims?.aal === "aal2") {
    const { data } = await ctx.supabase.rpc("staff_can", { _cap: "content" });
    allowed = data === true;
  }
  if (ctx.pending.length) {
    const { serializeCookieHeader } = await import("@supabase/ssr");
    setResponseHeader(
      "Set-Cookie",
      ctx.pending.map((cookie) => serializeCookieHeader(cookie.name, cookie.value, cookie.options)),
    );
  }
  return allowed && userData.user ? userData.user.id : null;
}

export const saveMotionDefault = createServerFn({ method: "POST" })
  .inputValidator((data: { settings: MotionSettings }) => {
    const parsed = parseImportedSettings(
      JSON.stringify({ schemaVersion: MOTION_SCHEMA_VERSION, ...data?.settings }),
      defaultMotionSettings,
    );
    if (!parsed.ok) throw new Error("invalid motion settings");
    return parsed.settings;
  })
  .handler(async ({ data }) => {
    const actor = await contentEditor();
    if (!actor) return { ok: false as const, message: "Нужны право редактора и вход с MFA." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("motion_defaults").upsert({
      key: "site",
      schema_version: MOTION_SCHEMA_VERSION,
      settings: data,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    });
    return error
      ? { ok: false as const, message: "Не удалось обновить общий default." }
      : { ok: true as const, message: "Общий default обновлён." };
  });
