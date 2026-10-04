import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABEL, STATUS_TEXT, canEditName, canTransition } from "@/lib/applications";
import { getMyApplication, guestAction, renameMyApplication } from "@/lib/applications.functions";
import { Input } from "@/components/ui/input";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/member_/applications/$id")({
  headers: privateRouteHeaders,
  head: () => pageMeta("Заявка — ВНЕ", "Статус заявки участника ВНЕ.", true),
  loader: async ({ params }) => {
    const r = await getMyApplication({ data: { id: params.id } });
    if (r.state === "signin") throw redirect({ to: "/login", search: { redirect: "/member" } });
    return r;
  },
  component: ApplicationPage,
});

function ApplicationPage() {
  const r = Route.useLoaderData();
  const router = useRouter();
  const act = useServerFn(guestAction);
  const rename = useServerFn(renameMyApplication);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (r.state !== "ok")
    return (
      <PageShell
        eyebrow="ВНЕ / кабинет"
        title="Заявка не найдена"
        intro="Её нет среди ваших заявок."
        density="compact"
      >
        <div className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 lg:px-12">
          <Link to="/member" className="text-blue underline">
            В кабинет
          </Link>
        </div>
      </PageShell>
    );
  const a = r.item;
  async function run(action: "withdraw" | "reply", reply?: string) {
    setPending(true);
    setMsg("");
    try {
      const res = await act({ data: { id: a.id, action, version: a.version, reply } });
      if (res.ok) await router.invalidate();
      setMsg(res.ok ? "Сохранено." : res.message);
    } catch {
      setMsg("Нет связи. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }
  async function saveName(name: string) {
    setPending(true);
    setMsg("");
    try {
      const res = await rename({ data: { id: a.id, name, version: a.version } });
      if (res.ok) await router.invalidate();
      setMsg(res.ok ? "Имя обращения сохранено." : res.message);
    } catch {
      setMsg("Нет связи. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }
  return (
    <PageShell
      eyebrow="ВНЕ / заявка"
      title={a.eventTitle}
      intro={STATUS_TEXT[a.status]}
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] space-y-8 px-5 py-10 sm:px-8 lg:px-12">
        <p className="font-display text-sm uppercase text-mint">{STATUS_LABEL[a.status]}</p>
        {a.publicMessage && (
          <div className="border-l-2 border-blue bg-surface p-4 text-sm">
            <p className="text-muted-foreground">Текущий вопрос команды</p>
            <p className="mt-2">{a.publicMessage}</p>
          </div>
        )}
        {canTransition(a.status, "reply") && (
          <form
            method="post"
            aria-disabled={!hydrated}
            className="grid max-w-xl gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!hydrated) return;
              void run("reply", String(new FormData(e.currentTarget).get("reply") ?? ""));
            }}
          >
            <label className="grid gap-1 text-sm">
              Ваш ответ
              <Textarea name="reply" required maxLength={1000} rows={4} disabled={!hydrated} />
            </label>
            <Button type="submit" disabled={!hydrated || pending} className="min-h-11 w-fit">
              Отправить ответ
            </Button>
          </form>
        )}
        {canEditName(a.status) && (
          <form
            method="post"
            className="grid max-w-xl gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!hydrated) return;
              void saveName(String(new FormData(e.currentTarget).get("name") ?? ""));
            }}
          >
            <label className="grid gap-1 text-sm">
              Имя обращения
              <Input
                name="name"
                required
                maxLength={80}
                defaultValue={a.displayName ?? ""}
                disabled={!hydrated}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Можно изменить только имя, пока решение не принято. Событие и статус не меняются.
            </p>
            <Button
              type="submit"
              variant="outline"
              disabled={!hydrated || pending}
              className="min-h-11 w-fit"
            >
              Сохранить имя
            </Button>
          </form>
        )}
        <section aria-labelledby="hist">
          <h2 id="hist" className="font-display text-lg">
            Хронология
          </h2>
          <ol className="mt-3 space-y-4 text-sm">
            {r.history.map((h, i) => (
              <li key={i} className="grid gap-1 border-l border-border pl-4">
                <div className="flex flex-wrap gap-3">
                  <time className="text-muted-foreground" dateTime={h.at}>
                    {new Date(h.at).toLocaleString("ru-RU")}
                  </time>
                  <span>{STATUS_LABEL[h.status]}</span>
                </div>
                {h.question && (
                  <p>
                    <span className="text-blue">Вопрос команды: </span>
                    {h.question}
                  </p>
                )}
                {h.answer && (
                  <p>
                    <span className="text-mint">Ваш ответ: </span>
                    {h.answer}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {a.status === "needs_info" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Прежние ответы остаются в хронологии; на текущий вопрос нужен новый ответ.
            </p>
          )}
        </section>
        {canTransition(a.status, "withdraw") && (
          <Button
            variant="outline"
            disabled={pending}
            className="min-h-11"
            onClick={() => {
              if (window.confirm("Отозвать заявку? Действие нельзя отменить."))
                void run("withdraw");
            }}
          >
            Отозвать заявку
          </Button>
        )}
        <p aria-live="polite" className="text-sm">
          {msg}
        </p>
        <Link to="/member" className="text-blue underline">
          В кабинет
        </Link>
      </section>
    </PageShell>
  );
}
