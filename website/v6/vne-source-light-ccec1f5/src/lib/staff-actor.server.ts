import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

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

export async function staffActor() {
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
