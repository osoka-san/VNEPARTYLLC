import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { getAuthAvailability, signIn } from "@/lib/auth/auth.functions";
import { getTelegramAvailability, signInWithTelegram } from "@/lib/auth/telegram.functions";
import { TelegramLoginButton } from "@/components/auth/TelegramLoginButton";
import { CALLBACK_MESSAGES, type CallbackError } from "@/lib/auth/auth-core";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { pageMeta } from "@/lib/seo";

type Search = { redirect?: string | undefined; error?: string | undefined };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s["redirect"] === "string" ? safeRedirect(s["redirect"]) : undefined,
    error: typeof s["error"] === "string" ? s["error"].slice(0, 20) : undefined,
  }),
  headers: privateRouteHeaders,
  head: () => pageMeta("Вход — ВНЕ", "Вход для участников и команды ВНЕ.", true),
  loader: async () => {
    const [a, telegram] = await Promise.all([getAuthAvailability(), getTelegramAvailability()]);
    return { ...a, telegram };
  },
  component: LoginPage,
});

function LoginPage() {
  const availability = Route.useLoaderData();
  const { redirect, error } = Route.useSearch();
  const navigate = useNavigate();
  const run = useServerFn(signIn);
  const tg = useServerFn(signInWithTelegram);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    error && error in CALLBACK_MESSAGES ? CALLBACK_MESSAGES[error as CallbackError] : null,
  );
  return (
    <PageShell
      eyebrow="ВНЕ / вход"
      title="Вход"
      intro="Для участников и команды."
      density="compact"
    >
      <AuthSection>
        {!availability.configured && <UnavailableNotice />}
        <div className="mt-8">
          <AuthForm
            label="Вход"
            configured={availability.configured}
            pending={pending}
            submitLabel="Войти"
            message={message}
            onSubmit={async (f) => {
              setPending(true);
              setMessage(null);
              const r = await run({
                data: {
                  email: String(f.get("email") ?? ""),
                  password: String(f.get("password") ?? ""),
                  redirect,
                },
              }).catch(() => ({ ok: false as const, message: "Сервис входа не ответил." }));
              setPending(false);
              if (r.ok) navigate({ href: safeRedirect(r.redirect) });
              else setMessage(r.message);
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
            <div className="grid gap-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="min-h-11"
              />
            </div>
          </AuthForm>
        </div>
        {availability.configured && availability.telegram.enabled && (
          <div className="mt-8 border-t border-border pt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Или через Telegram — если он привязан к аккаунту в кабинете.
            </p>
            <TelegramLoginButton
              bot={availability.telegram.bot}
              onAuth={async (auth) => {
                setPending(true);
                setMessage(null);
                const r = await tg({ data: { auth, redirect } }).catch(() => ({
                  ok: false as const,
                  message: "Сервис входа не ответил.",
                }));
                setPending(false);
                if (r.ok) navigate({ href: safeRedirect(r.redirect) });
                else setMessage(r.message);
              }}
            />
          </div>
        )}
        <p className="mt-6 text-sm">
          <Link
            to="/auth/recover"
            className="inline-flex min-h-11 items-center text-blue underline underline-offset-4"
          >
            Восстановить доступ
          </Link>
        </p>
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Ещё нет аккаунта? Регистрация доступна после одобрения заявки.
          </p>
          <Link
            to="/apply"
            search={{ event: undefined }}
            className="mt-3 inline-flex min-h-11 items-center text-blue underline underline-offset-4"
          >
            Оставить заявку
          </Link>
        </div>
      </AuthSection>
    </PageShell>
  );
}
