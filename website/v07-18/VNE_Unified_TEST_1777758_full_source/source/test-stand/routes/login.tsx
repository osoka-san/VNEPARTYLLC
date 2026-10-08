import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAuthAvailability, signIn, signOut } from "@/lib/auth/auth.functions";
import { clearDraftForSignout } from "@/lib/questionnaire-draft-session";
import { AuthForm } from "@/components/auth/AuthUi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export const Route = createFileRoute("/login")({
  loader: () => getAuthAvailability(),
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    search["next"] === "/admin/mfa" ||
    search["next"] === "/scanner/mfa" ||
    search["next"] === "/admin/violations" ||
    search["next"] === "/admin/intakes"
      ? { next: search["next"] }
      : {},
  component: Login,
});
function Login() {
  const availability = Route.useLoaderData(),
    run = useServerFn(signIn),
    out = useServerFn(signOut);
  const { next } = Route.useSearch();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  return (
    <section className="max-w-lg">
      <h1 className="mb-6 text-3xl">Вход в TEST</h1>
      <p className="mb-6 text-sm">
        Используйте только выданный тестовый аккаунт. Регистрация закрыта.
      </p>
      {(next === "/admin/mfa" ||
        next === "/scanner/mfa" ||
        next === "/admin/violations" ||
        next === "/admin/intakes") && (
        <div className="mb-6 border border-border p-4">
          <p>
            {next === "/scanner/mfa"
              ? "Для этой настройки войдите в назначенный TEST-аккаунт сканера."
              : "Для этого раздела войдите как ADMIN_TEST."}{" "}
            Если в этом браузере открыт другой аккаунт, сначала завершите его сеанс.
          </p>
          <button
            className="mt-3 underline"
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setMessage(null);
              clearDraftForSignout();
              try {
                const result = await out({ data: {} });
                if (result.ok) {
                  clearDraftForSignout();
                  setMessage("Сеанс завершён. Теперь войдите в нужный аккаунт ниже.");
                } else setMessage(result.message);
              } catch {
                setMessage(
                  "Выход не подтверждён. Если вы уже вышли, войдите в нужный аккаунт ниже.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            Завершить текущий сеанс
          </button>
        </div>
      )}
      <AuthForm
        label="Вход в TEST"
        configured={availability.configured}
        pending={pending}
        submitLabel="Войти"
        message={message}
        onSubmit={async (form) => {
          setPending(true);
          setMessage(null);
          try {
            const result = await run({
              data: {
                email: String(form.get("email") ?? ""),
                password: String(form.get("password") ?? ""),
                redirect:
                  next ??
                  (String(form.get("email") ?? "")
                    .trim()
                    .toUpperCase() === "ADMIN_TEST"
                    ? "/admin/mfa"
                    : "/apply"),
              },
            });
            if (result.ok) window.location.assign(result.redirect || "/apply");
            else setMessage(result.message);
          } catch {
            setMessage("Не удалось войти. Повторите попытку.");
          } finally {
            setPending(false);
          }
        }}
      >
        <Label htmlFor="email">Email или логин ADMIN_TEST</Label>
        <Input id="email" name="email" type="text" autoComplete="username" required />
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </AuthForm>
    </section>
  );
}
