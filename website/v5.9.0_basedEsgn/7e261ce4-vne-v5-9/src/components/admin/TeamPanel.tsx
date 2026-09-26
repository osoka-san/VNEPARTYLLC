import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  grantRole,
  listTeam,
  revokeRole,
  type TeamEventDto,
  type TeamMemberDto,
} from "@/lib/team.functions";
import { EVENT_ROLES, GRANTABLE_ROLES, ROLE_LABEL, type GrantableRole } from "@/lib/team";

export function TeamPanel() {
  const load = useServerFn(listTeam);
  const grant = useServerFn(grantRole);
  const revoke = useServerFn(revokeRole);
  const [members, setMembers] = useState<TeamMemberDto[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("moderator");
  const [events, setEvents] = useState<TeamEventDto[]>([]);
  const [eventId, setEventId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const eventRole = EVENT_ROLES.includes(role as GrantableRole);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await load().catch(() => ({ ok: false as const, members: [], events: [] }));
    setForbidden(!r.ok);
    setMembers(r.members);
    setEvents(r.events);
  }, [load]);
  useEffect(() => void refresh(), [refresh]);

  const run = async (p: Promise<{ message: string }>) => {
    setBusy(true);
    setMessage(null);
    const r = await p.catch(() => ({ message: "Сервис не ответил." }));
    setMessage(r.message);
    setBusy(false);
    await refresh();
  };

  return (
    <div>
      <p className="font-display text-xs uppercase text-mint">Права доступа</p>
      <h2 className="mt-2 font-display text-xl">Команда</h2>
      {forbidden ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Раздел доступен владельцу и администраторам с подтверждённой MFA.
        </p>
      ) : (
        <>
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                grant({
                  data: {
                    email,
                    role,
                    eventId: eventRole ? eventId : "",
                    validUntil: validUntil ? new Date(validUntil).toISOString() : "",
                  },
                }),
              );
            }}
          >
            <label className="grid gap-1 text-sm">
              Email приглашённого
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 rounded-md border border-border bg-input px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Роль
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="min-h-11 rounded-md border border-border bg-input px-3"
              >
                {GRANTABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Событие
              <select
                value={eventRole ? eventId : ""}
                onChange={(e) => setEventId(e.target.value)}
                disabled={!eventRole}
                required={eventRole}
                className="min-h-11 rounded-md border border-border bg-input px-3 disabled:opacity-50"
              >
                <option value="">{eventRole ? "Выберите событие" : "Весь сайт"}</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {eventRole ? "Действует до (обязательно)" : "Действует до"}
              <input
                type="datetime-local"
                required={eventRole}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="min-h-11 rounded-md border border-border bg-input px-3"
              />
            </label>
            <Button type="submit" disabled={busy} className="min-h-11 self-end">
              Назначить
            </Button>
          </form>
          <p role="status" className="mt-3 min-h-6 text-sm text-muted-foreground">
            {message}
          </p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm">
                  {m.email} ·{" "}
                  <span className="text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.eventTitle ? `Событие: ${m.eventTitle}` : "Весь сайт"} ·{" "}
                    {m.validUntil
                      ? `до ${new Date(m.validUntil).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`
                      : "бессрочно"}
                  </span>
                </span>
                {m.role !== "owner" && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void run(revoke({ data: { id: m.id } }))}
                  >
                    Отозвать
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
