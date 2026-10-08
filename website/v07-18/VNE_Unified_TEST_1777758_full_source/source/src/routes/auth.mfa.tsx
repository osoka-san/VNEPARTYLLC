import { useSiteLoading } from "@/components/loading/SiteLoading";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enrollTotp, getAuthAvailability, verifyTotp } from "@/lib/auth/auth.functions";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/auth/mfa")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect:
      typeof s["redirect"] === "string" ? safeRedirect(s["redirect"], "/member") : undefined,
  }),
  headers: privateRouteHeaders,
  head: () => pageMeta("Второй фактор — ВНЕ", "Подключение и подтверждение кода приложения.", true),
  loader: () => getAuthAvailability(),
  component: MfaPage,
});

function MfaPage() {
  const availability = Route.useLoaderData();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const enroll = useServerFn(enrollTotp);
  const verify = useServerFn(verifyTotp);
  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  useSiteLoading(pending, "Проверяем доступ");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <PageShell
      eyebrow="ВНЕ / команда"
      title="Второй фактор"
      intro="Для зон команды нужен код из приложения-аутентификатора."
      density="compact"
    >
      <AuthSection>
        {!availability.configured && <UnavailableNotice />}
        {availability.configured && !enrollment && (
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const r = await enroll().catch(() => ({
                ok: false as const,
                message: "Сервис не ответил.",
              }));
              setPending(false);
              if (r.ok) setEnrollment({ factorId: r.factorId, qr: r.qr, secret: r.secret });
              else setMessage(r.message);
            }}
          >
            Подключить новое приложение
          </Button>
        )}
        {enrollment && (
          <div className="mt-6 border border-border bg-surface p-5">
            <img
              src={enrollment.qr}
              alt="QR-код для приложения-аутентификатора"
              className="size-48 bg-foreground p-2"
            />
            <p className="mt-4 break-all text-xs text-muted-foreground">
              Ключ для ручного ввода:{" "}
              <span className="font-mono text-foreground">{enrollment.secret}</span>
            </p>
          </div>
        )}
        <div className="mt-8">
          <AuthForm
            label="Код подтверждения"
            configured={availability.configured}
            pending={pending}
            submitLabel="Подтвердить"
            message={message}
            onSubmit={async (f) => {
              setPending(true);
              const r = await verify({
                data: {
                  factorId: enrollment?.factorId,
                  code: String(f.get("code") ?? ""),
                  redirect,
                },
              }).catch(() => ({ ok: false as const, message: "Код не принят." }));
              setPending(false);
              if (r.ok) navigate({ to: safeRedirect(r.redirect) });
              else setMessage(r.message);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="code">Шестизначный код</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                className="min-h-11"
              />
            </div>
          </AuthForm>
        </div>
      </AuthSection>
    </PageShell>
  );
}
