/**
 * Команда: назначение и отзыв ролей. Все решения принимает БД
 * (staff_session_ok + aal2 + has_role owner/admin); сервер лишь передаёт вызов
 * от имени пользователя. Роли живут только в staff_assignments.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { GRANTABLE_ROLES, type GrantableRole, validateGrantInput } from "./team";

export type TeamMemberDto = {
  id: string;
  email: string;
  role: string;
  eventId: string | null;
  eventTitle: string | null;
  validUntil: string | null;
  createdAt: string;
};

async function staffClient() {
  setResponseHeader("Cache-Control", "private, no-store");
  const { createRequestClient } = await import("./auth/supabase.server");
  const ctx = createRequestClient(getRequest());
  if (!ctx) return null;
  const { data: u } = await ctx.supabase.auth.getUser();
  const { data: c } = await ctx.supabase.auth.getClaims();
  let ok = false;
  if (u.user && (c?.claims as { aal?: string } | undefined)?.aal === "aal2") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (ctx.supabase as any).rpc("staff_can", { _cap: "team" });
    ok = data === true;
  }
  if (ctx.pending.length) {
    const { serializeCookieHeader } = await import("@supabase/ssr");
    setResponseHeader(
      "Set-Cookie",
      ctx.pending.map((p) => serializeCookieHeader(p.name, p.value, p.options)),
    );
  }
  return ok ? ctx : null;
}

export type TeamEventDto = { id: string; title: string };

export const listTeam = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await staffClient();
  const none = { ok: false as const, members: [] as TeamMemberDto[], events: [] as TeamEventDto[] };
  if (!ctx) return none;
  // RLS «admins read all» пропускает только owner/admin с живой MFA-сессией.
  const { data, error } = await ctx.supabase
    .from("staff_assignments")
    .select("id, user_id, role, created_at, event_id, valid_until")
    .is("revoked_at", null)
    .order("created_at");
  if (error || !data) return none;
  const { data: evs } = await ctx.supabase
    .from("events")
    .select("id, title")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);
  const events: TeamEventDto[] = (evs ?? []).map((e) => ({ id: e.id, title: e.title }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const members: TeamMemberDto[] = [];
  for (const row of data) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    members.push({
      id: row.id,
      email: u.user?.email ?? "—",
      role: row.role,
      eventId: row.event_id,
      eventTitle: row.event_id
        ? (events.find((e) => e.id === row.event_id)?.title ?? "событие недоступно")
        : null,
      validUntil: row.valid_until,
      createdAt: row.created_at,
    });
  }
  return { ok: true as const, members, events };
});

export const grantRole = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; role: string; eventId?: string; validUntil?: string }) =>
    validateGrantInput(d),
  )
  .handler(async ({ data }) => {
    if (!data.ok) return { ok: false as const, message: data.message };
    const ctx = await staffClient();
    if (!ctx) return { ok: false as const, message: "Нужна действующая сессия с MFA." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (ctx.supabase as any).rpc("grant_staff_assignment", {
      _email: data.email,
      _role: data.role as GrantableRole,
      _event: data.eventId,
      _valid_until: data.validUntil,
    });
    if (!error) return { ok: true as const, message: "Роль назначена." };
    if (error.code === "22023")
      return {
        ok: false as const,
        message: "Для роли события нужен конкретный опубликованный ивент и срок в будущем.",
      };
    if (error.code === "P0002")
      return { ok: false as const, message: "Сначала пригласите этого человека через заявку." };
    return { ok: false as const, message: "Недостаточно прав для этой роли." };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "").slice(0, 40) }))
  .handler(async ({ data }) => {
    const ctx = await staffClient();
    if (!ctx) return { ok: false as const, message: "Нужна действующая сессия с MFA." };
    const { error } = await ctx.supabase.rpc("revoke_staff_assignment", { _assignment: data.id });
    return error
      ? { ok: false as const, message: "Роль нельзя отозвать." }
      : { ok: true as const, message: "Роль отозвана." };
  });

export { GRANTABLE_ROLES };
