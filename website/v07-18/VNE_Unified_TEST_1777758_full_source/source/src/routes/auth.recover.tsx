import { Link, createFileRoute } from "@tanstack/react-router";
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
import { getAuthAvailability, requestRecovery } from "@/lib/auth/auth.functions";
import { MSG } from "@/lib/auth/auth-core";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/auth/recover")({
  headers: privateRouteHeaders,
  head: () =>
    pageMeta("Восстановление доступа — ВНЕ", "Запрос ссылки для восстановления доступа.", true),
  loader: () => getAuthAvailability(),
  component: RecoverPage,
});

function RecoverPage() {
  const availability = Route.useLoaderData();
  const run = useServerFn(requestRecovery);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <PageShell
      eyebrow="ВНЕ / доступ"
      title="Восстановление доступа"
      intro="Ссылка придёт на email, если он зарегистрирован."
      density="compact"
    >
      <AuthSection>
        {!availability.configured && <UnavailableNotice />}
        <div className="mt-8">
          <AuthForm
            label="Восстановление доступа"
            configured={availability.configured}
            pending={pending}
            submitLabel="Отправить ссылку"
            message={message}
            onSubmit={async (f) => {
              setPending(true);
              const r = await run({ data: { email: String(f.get("email") ?? "") } }).catch(() => ({
                ok: false as const,
                message: MSG.network,
              }));
              setPending(false);
              setMessage(r.ok ? MSG.recovery : r.message);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="min-h-11"
              />
            </div>
          </AuthForm>
        </div>
        <Link
          to="/login"
          className="mt-6 inline-flex min-h-11 items-center text-sm text-blue underline underline-offset-4"
        >
          Ко входу
        </Link>
      </AuthSection>
    </PageShell>
  );
}
