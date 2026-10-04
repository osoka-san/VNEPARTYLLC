import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABEL, STATUS_TEXT, nextStep } from "@/lib/applications";
import { submitApplication, type GuestApplication } from "@/lib/applications.functions";

const NEXT: Record<ReturnType<typeof nextStep>, string> = {
  apply: "Следующий шаг: отправить заявку на событие.",
  wait: "Следующий шаг: дождаться решения команды.",
  reply: "Следующий шаг: ответить на уточнение команды.",
  none: "Активных шагов нет.",
};

export function MemberApplications({
  items,
  events,
  defaultName,
  preselectSlug,
  eventsUnavailable = false,
}: {
  eventsUnavailable?: boolean;
  items: GuestApplication[];
  events: { id: string; title: string; slug: string }[];
  defaultName: string | null;
  preselectSlug?: string | undefined;
}) {
  const router = useRouter();
  const send = useServerFn(submitApplication);
  const [hydrated, setHydrated] = useState(false);
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setHydrated(true);
    setKey(crypto.randomUUID());
  }, []);
  // Сравниваем по id: события с одинаковым названием не скрывают друг друга.
  const applied = new Set(items.map((i) => i.eventId));
  const open = events.filter((e) => !applied.has(e.id));
  const pre = preselectSlug ? events.find((e) => e.slug === preselectSlug) : undefined;
  const preNote = !preselectSlug
    ? ""
    : !pre
      ? "Выбранное событие сейчас не принимает заявки."
      : applied.has(pre.id)
        ? "На выбранное событие заявка уже есть — статус ниже."
        : "";
  // Ключ идемпотентности привязан к набору данных: смена события/имени → новый ключ.
  const renew = () => setKey(crypto.randomUUID());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    setPending(true);
    setMsg("");
    try {
      const r = await send({
        data: {
          eventId: f.get("event"),
          displayName: f.get("name"),
          ageConfirmed: f.get("age") === "on",
          consent: f.get("consent") === "on",
          idempotencyKey: key, // тот же ключ при повторе → та же заявка
        },
      });
      if (r.ok) {
        setKey(crypto.randomUUID());
        await router.invalidate();
        setMsg(
          r.outcome === "existing"
            ? `На это событие заявка уже есть — ничего не изменено. Имя в заявке: «${r.displayName ?? "—"}».`
            : "Заявка сохранена.",
        );
      } else setMsg(r.message);
    } catch {
      setMsg("Нет связи. Повторите — дубликат не появится.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 space-y-10">
      <p className="border-l-2 border-mint pl-4 text-sm" role="status">
        {NEXT[nextStep(items.map((i) => i.status))]}
      </p>

      <section aria-labelledby="my-apps">
        <h2 id="my-apps" className="font-display text-lg">
          Мои заявки
        </h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Заявок пока нет.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border border-border">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  to="/member/applications/$id"
                  params={{ id: a.id }}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 bg-surface p-4 hover:bg-background focus-visible:outline-2"
                >
                  <span>{a.eventTitle}</span>
                  <span className="text-sm text-mint">{STATUS_LABEL[a.status]}</span>
                  <span className="w-full text-xs text-muted-foreground">
                    {STATUS_TEXT[a.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-app">
        <h2 id="new-app" className="font-display text-lg">
          Заявка на событие
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {eventsUnavailable
              ? "События не загрузились — см. сообщение выше."
              : "Сейчас нет открытых событий для заявки."}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid max-w-xl gap-4">
            {preNote && <p className="text-sm text-muted-foreground">{preNote}</p>}
            <label className="grid gap-1 text-sm">
              Событие
              <select
                name="event"
                required
                onChange={renew}
                defaultValue={pre && !applied.has(pre.id) ? pre.id : undefined}
                className="min-h-11 border border-border bg-surface px-3"
              >
                {open.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Как к вам обращаться
              <Input
                name="name"
                required
                maxLength={80}
                onChange={renew}
                defaultValue={defaultName ?? ""}
                className="min-h-11"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Для связи используется email вашего аккаунта.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="age" required className="mt-1 size-4" />
              Мне исполнилось 18 лет (самоотметка, не проверка документа).
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="consent" required className="mt-1 size-4" />
              <span>
                Согласен с{" "}
                <a href="/rules" className="text-blue underline">
                  правилами
                </a>{" "}
                и{" "}
                <Link to="/consent" className="text-blue underline">
                  обработкой данных
                </Link>{" "}
                (черновик тестовой среды).
              </span>
            </label>
            <Button type="submit" disabled={!hydrated || pending} className="min-h-11 w-fit">
              {pending ? "Отправляем…" : "Отправить заявку"}
            </Button>
            <p aria-live="polite" className="text-sm">
              {msg}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
