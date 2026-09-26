/**
 * Очистка ТОЛЬКО по явному manifest конкретного прогона: точные UUID пользователей, событий,
 * заявок и назначений, созданных этим run. Никаких выборок по домену email или префиксу slug.
 * Каждая ошибка учитывается; «removed» печатается только после проверки, что записей больше нет.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

export type RunManifest = {
  run: string;
  users: string[];
  events: string[];
  apps: string[];
  assignments: string[];
  invites?: string[];
  requests?: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const manifestPath = (run: string) => `/tmp/vne-synthetic/manifest-${run}.json`;

export function writeManifest(m: RunManifest) {
  mkdirSync("/tmp/vne-synthetic", { recursive: true });
  writeFileSync(manifestPath(m.run), JSON.stringify(m, null, 2));
}

export function validateManifest(m: unknown): RunManifest {
  const r = m as RunManifest;
  if (!r || typeof r.run !== "string") throw new Error("manifest: run missing");
  for (const k of ["users", "events", "apps", "assignments", "invites", "requests"] as const) {
    if (r[k] === undefined && (k === "invites" || k === "requests")) continue;
    if (!Array.isArray(r[k]) || !r[k]!.every((x) => typeof x === "string" && UUID.test(x)))
      throw new Error(`manifest: ${k} must be exact UUIDs`);
  }
  return r;
}

export async function cleanupByManifest(admin: SupabaseClient, raw: RunManifest) {
  const m = validateManifest(raw);
  const errors: string[] = [];
  const note = (step: string, e: { code?: string; message?: string } | null) => {
    if (e) errors.push(`${step}: ${e.code ?? e.message ?? "error"}`);
  };

  // Заявки: точные id из manifest + заявки на точные события этого run (события созданы им же).
  const appIds = new Set(m.apps);
  if (m.events.length) {
    const { data, error } = await admin.from("applications").select("id").in("event_id", m.events);
    note("select apps by run events", error);
    for (const a of data ?? []) appIds.add(a.id as string);
  }
  const apps = [...appIds];
  if (apps.length) {
    note(
      "delete application_events",
      (await admin.from("application_events").delete().in("application_id", apps)).error,
    );
    note("delete applications", (await admin.from("applications").delete().in("id", apps)).error);
  }
  const inv = m.invites ?? [];
  const req = m.requests ?? [];
  if (req.length)
    note(
      "unlink current_invite",
      (await admin.from("membership_requests").update({ current_invite_id: null }).in("id", req))
        .error,
    );
  if (inv.length)
    note("delete invites", (await admin.from("invites").delete().in("id", inv)).error);
  if (req.length)
    note("delete requests", (await admin.from("membership_requests").delete().in("id", req)).error);
  if (m.assignments.length)
    note(
      "delete staff_assignments",
      (await admin.from("staff_assignments").delete().in("id", m.assignments)).error,
    );
  if (m.events.length)
    note("delete events", (await admin.from("events").delete().in("id", m.events)).error);
  for (const id of m.users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && error.status !== 404) note(`delete user ${id.slice(0, 8)}`, error);
  }

  // Проверка конечного результата — только по тем же точным id.
  const left = async (table: string, col: string, ids: string[]) => {
    if (!ids.length) return 0;
    const { count, error } = await admin
      .from(table)
      .select(col, { count: "exact", head: true })
      .in(col, ids);
    note(`verify ${table}`, error);
    return error ? -1 : (count ?? 0);
  };
  const remaining = {
    applications: await left("applications", "id", apps),
    assignments: await left("staff_assignments", "id", m.assignments),
    events: await left("events", "id", m.events),
    invites: await left("invites", "id", inv),
    requests: await left("membership_requests", "id", req),
    users: 0,
  };
  for (const id of m.users) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (data?.user) remaining.users++;
    else if (error && error.status !== 404) note(`verify user ${id.slice(0, 8)}`, error);
  }
  const ok = errors.length === 0 && Object.values(remaining).every((n) => n === 0);
  console.log(
    `cleanup(manifest run=${m.run}): requested users=${m.users.length} events=${m.events.length} ` +
      `apps=${apps.length} assignments=${m.assignments.length}; remaining ${JSON.stringify(remaining)}; ` +
      (ok ? "VERIFIED removed" : `FAIL errors=${JSON.stringify(errors)}`),
  );
  return { ok, remaining, errors };
}
