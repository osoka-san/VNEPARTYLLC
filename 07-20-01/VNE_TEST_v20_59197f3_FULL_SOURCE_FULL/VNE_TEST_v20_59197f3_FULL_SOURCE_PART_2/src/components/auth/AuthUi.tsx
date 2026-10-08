import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useHydrated } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";

export const privateRouteHeaders = () => ({
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
});

export function UnavailableNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="border-l-2 border-orange bg-surface p-5" role="status">
      <p className="font-display text-xs uppercase text-orange">Вход недоступен</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {children ??
          "Тестовая среда ещё не подключена. Формы заблокированы, данные не отправляются, сессия не создаётся."}
      </p>
    </div>
  );
}

/**
 * Форма, которая не работает без JS и без разрешённой конфигурации:
 * method=post (пароль/email никогда не уходят в URL), fieldset disabled до гидратации.
 */
export function AuthForm({
  configured,
  onSubmit,
  pending,
  submitLabel,
  message,
  children,
  label,
}: {
  configured: boolean;
  onSubmit: (form: FormData) => void;
  pending: boolean;
  submitLabel: string;
  message: string | null;
  children: ReactNode;
  label: string;
}) {
  const hydrated = useHydrated();
  const enabled = hydrated && configured && !pending;
  useSiteLoading(pending, "Проверяем данные");
  const handle = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!enabled) return;
    onSubmit(new FormData(e.currentTarget));
  };
  return (
    <form method="post" action="/login#no-submit" onSubmit={handle} aria-label={label} noValidate>
      <noscript>
        <p className="mb-5 text-sm text-orange">
          Для входа нужен JavaScript. Без него данные не отправляются.
        </p>
      </noscript>
      <fieldset disabled={!enabled} className="grid gap-5 disabled:opacity-60">
        {children}
        <Button type="submit" className="min-h-11 w-full sm:w-auto">
          {pending ? "Проверяем…" : submitLabel}
        </Button>
      </fieldset>
      <p className="mt-5 min-h-6 text-sm text-muted-foreground" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

export function AuthSection({ children }: { children: ReactNode }) {
  return <section className="mx-auto max-w-xl px-5 py-10 sm:px-8 sm:py-14">{children}</section>;
}
