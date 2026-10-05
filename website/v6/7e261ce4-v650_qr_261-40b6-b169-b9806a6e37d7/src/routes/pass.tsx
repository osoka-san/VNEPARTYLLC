import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import PassView from "@/components/tickets/PassView";
import BrandMark from "@/components/tickets/BrandMark";
import { readPass } from "@/lib/tickets/tickets.functions";
import type { PassDTO } from "@/components/tickets/types";
import { pageMeta } from "@/lib/seo";
import "@/styles/tickets/base.css";
import "@/styles/tickets/pass.css";

// Токен живёт только во фрагменте (#): не уходит на сервер при загрузке, в логи и Referer.
export const Route = createFileRoute("/pass")({
  headers: () => ({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  }),
  head: () => ({
    ...pageMeta(
      "Персональный пропуск — ВНЕ",
      "Персональная карточка пропуска ВНЕ по личной ссылке.",
      true,
    ),
    meta: [
      ...pageMeta(
        "Персональный пропуск — ВНЕ",
        "Персональная карточка пропуска ВНЕ по личной ссылке.",
        true,
      ).meta,
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PassPage,
});

type View =
  | { kind: "loading" }
  | { kind: "no-token" }
  | { kind: "ok"; pass: PassDTO }
  | { kind: "message"; title: string; body: string };

const STATUS_TEXT: Record<Exclude<PassDTO["status"], "active">, { title: string; body: string }> = {
  revoked: {
    title: "Пропуск отозван",
    body: "Эта карточка больше не даёт права входа. Если это ошибка, свяжитесь с организаторами.",
  },
  expired: { title: "Срок пропуска истёк", body: "Карточка недействительна для входа." },
  used: {
    title: "Пропуск уже использован",
    body: "Проход по этой карточке уже подтверждён. Повторный вход по ней невозможен.",
  },
};

function PassPage() {
  const read = useServerFn(readPass);
  const [view, setView] = useState<View>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const token = window.location.hash.slice(1);
      if (!token) return setView({ kind: "no-token" });
      setView({ kind: "loading" });
      try {
        const r = await read({ data: { token } });
        if (!alive) return;
        if (r.state === "ok") {
          if (r.pass.status === "active") setView({ kind: "ok", pass: r.pass });
          else setView({ kind: "message", ...STATUS_TEXT[r.pass.status] });
        } else if (r.state === "invalid" || r.state === "not_found")
          setView({
            kind: "message",
            title: "Пропуск не найден",
            body: "Проверьте персональную ссылку целиком, включая часть после «#».",
          });
        else if (r.state === "unconfigured")
          setView({
            kind: "message",
            title: "Пропуски пока недоступны",
            body: "Сервис пропусков не подключён. Эта страница не подтверждает вход.",
          });
        else
          setView({
            kind: "message",
            title: "Не удалось проверить пропуск",
            body: "Проверьте связь и обновите страницу. Ошибка связи не означает допуск.",
          });
      } catch {
        if (alive)
          setView({
            kind: "message",
            title: "Не удалось проверить пропуск",
            body: "Проверьте связь и обновите страницу. Ошибка связи не означает допуск.",
          });
      }
    };
    void load();
    window.addEventListener("hashchange", load);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", load);
    };
  }, [read]);

  if (view.kind === "ok") return <PassView pass={view.pass} />;
  const msg =
    view.kind === "loading"
      ? { title: "Проверяем пропуск…", body: "Это займёт несколько секунд." }
      : view.kind === "no-token"
        ? {
            title: "Нужна персональная ссылка",
            body: "Карточка открывается только по личной ссылке из приглашения. Без неё здесь ничего не показывается.",
          }
        : view;
  return (
    <main className="vne-pass">
      <header className="vne-header">
        <a href="/" aria-label="ВНЕ — главная">
          <BrandMark />
        </a>
        <span>PRIVATE EVENTS / PERSONAL ACCESS</span>
        <span className="vne-status">
          {view.kind === "loading" ? "ПРОВЕРКА" : "НЕТ ДЕЙСТВУЮЩЕГО ПРОПУСКА"}
        </span>
      </header>
      <div className="vne-pass-state">
        <div className="max-w-xl" role={view.kind === "loading" ? "status" : "alert"}>
          <h1 className="font-display text-2xl">{msg.title}</h1>
          <p className="mt-4 text-muted-foreground">{msg.body}</p>
        </div>
      </div>
    </main>
  );
}
