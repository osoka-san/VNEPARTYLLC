import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/app/PageShell";
import {
  AuthForm,
  AuthSection,
  UnavailableNotice,
  privateRouteHeaders,
} from "@/components/auth/AuthUi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthAvailability, updatePassword } from "@/lib/auth/auth.functions";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/auth/reset")({
  validateSearch: (search: Record<string, unknown>) => ({ invite: search["invite"] === "1" }),
  headers: privateRouteHeaders,
  head: () => pageMeta("Новый пароль — ВНЕ", "Установка нового пароля после восстановления.", true),
  loader: () => getAuthAvailability(),
  component: ResetPage,
});

function ResetPage() {
  const availability = Route.useLoaderData();
  const { invite } = Route.useSearch();
  const navigate = useNavigate();
  const run = useServerFn(updatePassword);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <PageShell
      eyebrow="ВНЕ / доступ"
      title={invite ? "Создать пароль" : "Новый пароль"}
      intro={
        invite
          ? "Завершите регистрацию по приглашению."
          : "Доступно только после перехода по ссылке восстановления."
      }
      density="compact"
    >
      <AuthSection>
        {!availability.configured && <UnavailableNotice />}
        <div className="mt-8">
          <AuthForm
            label="Новый пароль"
            configured={availability.configured}
            pending={pending}
            submitLabel="Сохранить пароль"
            message={message}
            onSubmit={async (f) => {
              setPending(true);
              const r = await run({ data: { password: String(f.get("password") ?? "") } }).catch(
                () => ({
                  ok: false as const,
                  message: "Сервис не ответил.",
                }),
              );
              setPending(false);
              if (r.ok) navigate({ to: safeRedirect(r.redirect) });
              else setMessage(r.message);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="password">Новый пароль (не менее 12 символов)</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                className="min-h-11"
              />
            </div>
          </AuthForm>
        </div>
      </AuthSection>
    </PageShell>
  );
}
