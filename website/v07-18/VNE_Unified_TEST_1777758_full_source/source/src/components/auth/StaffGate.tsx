import { redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageShell } from "@/components/app/PageShell";
import type { StaffDecision } from "@/lib/auth/auth-core";

/** Серверное решение guard → редирект до рендера. Остальные состояния рендерятся явно. */
export function enforceStaff(decision: StaffDecision, path: "/admin" | "/scan") {
  if (decision === "signin") throw redirect({ to: "/login", search: { redirect: path } });
  if (decision === "mfa") throw redirect({ to: "/auth/mfa", search: { redirect: path } });
  return decision;
}

export function StaffBlocked({ decision, eyebrow }: { decision: StaffDecision; eyebrow: string }) {
  const intro =
    decision === "denied"
      ? "Для этой зоны нет действующего назначения. Доступ закрыт."
      : "Не удалось проверить права. Доступ закрыт до повторной проверки.";
  return (
    <PageShell eyebrow={eyebrow} title="Доступ закрыт" intro={intro} density="compact">
      <div className="h-10" />
    </PageShell>
  );
}

export function AppearanceOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-2 border-blue bg-surface p-5" role="note">
      <p className="font-display text-xs uppercase text-blue">Только внешний вид</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
