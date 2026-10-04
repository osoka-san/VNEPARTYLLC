import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelegramLoginButton } from "@/components/auth/TelegramLoginButton";
import {
  linkTelegram,
  unlinkTelegram,
  updateTelegramUsername,
} from "@/lib/auth/telegram.functions";
import { telegramUsernameError } from "@/lib/telegram-username";

export function MemberTelegram({
  username,
  linked,
  bot,
}: {
  username: string | null;
  linked: boolean;
  bot: string | null;
}) {
  const router = useRouter();
  const save = useServerFn(updateTelegramUsername);
  const link = useServerFn(linkTelegram);
  const unlink = useServerFn(unlinkTelegram);
  const [value, setValue] = useState(username ? `@${username}` : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const done = async (r: { ok: boolean; message?: string }, ok: string) => {
    setPending(false);
    if (r.ok) {
      setMsg(ok);
      await router.invalidate();
    } else setMsg(r.message ?? "Ошибка.");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = telegramUsernameError(value);
    setErr(v);
    if (v) return;
    setPending(true);
    const r = await save({ data: { username: value } }).catch(() => ({
      ok: false,
      message: "Сервис не ответил.",
    }));
    await done(r, "Сохранено.");
  };
  return (
    <section className="mt-10 max-w-xl border-t border-border pt-8" aria-labelledby="tg-title">
      <h2 id="tg-title" className="font-display text-lg">
        Telegram
      </h2>
      {!username && (
        <p className="mt-3 border-l-2 border-orange bg-surface p-4 text-sm" role="status">
          Укажите Telegram — через него с вами свяжутся.
        </p>
      )}
      <form onSubmit={submit} noValidate className="mt-5 grid gap-2">
        <Label htmlFor="tg-username">Username</Label>
        <div className="flex flex-wrap gap-3">
          <Input
            id="tg-username"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="@vne_guest"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!err}
            aria-describedby={err ? "tg-error" : undefined}
            className="min-h-11 max-w-xs"
          />
          <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>
            Сохранить
          </Button>
        </div>
        {err && (
          <p id="tg-error" className="text-sm text-orange">
            {err}
          </p>
        )}
      </form>
      <div className="mt-6">
        {linked ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-muted-foreground">Вход через Telegram подключён.</p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const r = await unlink().catch(() => ({
                  ok: false,
                  message: "Сервис не ответил.",
                }));
                await done(r, "Telegram отвязан.");
              }}
            >
              Отвязать
            </Button>
          </div>
        ) : bot ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Привяжите Telegram, чтобы входить через него.
            </p>
            <TelegramLoginButton
              bot={bot}
              onAuth={async (auth) => {
                setPending(true);
                const r = await link({ data: { auth } }).catch(() => ({
                  ok: false,
                  message: "Сервис не ответил.",
                }));
                await done(r, "Telegram привязан.");
              }}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Вход через Telegram пока не настроен.</p>
        )}
      </div>
      <p className="mt-4 min-h-6 text-sm text-muted-foreground" role="status" aria-live="polite">
        {msg}
      </p>
    </section>
  );
}
