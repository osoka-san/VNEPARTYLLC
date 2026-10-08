import { useSiteLoading } from "@/components/loading/SiteLoading";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import PassView from "@/components/tickets/PassView";
import BrandMark from "@/components/tickets/BrandMark";
import { sanitizePass } from "@/lib/tickets/contract";
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
  const [view, setView] = useState<View>({ kind: "loading" });
  useSiteLoading(view.kind === "loading", "Открываем пропуск");
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let controller: AbortController | null = null;
    const load = async () => {
      const current = ++generation;
      controller?.abort();
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
      const token = window.location.hash.slice(1);
      if (!token) return setView({ kind: "no-token" });
      setView({ kind: "loading" });
      try {
        const response = await fetch("/api/tickets/read", {
          method: "POST",
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal,
        });
        const raw = await response.json();
        const pass = sanitizePass(raw.pass);
        const r = { state: response.ok && pass ? "ok" : raw.state, pass: pass! };
        if (!alive || current !== generation) return;
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
        if (alive && current === generation)
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
      controller?.abort();
      window.removeEventListener("hashchange", load);
    };
  }, []);

  if (view.kind === "ok")
    return (
      <>
        {!view.pass.qrText && view.pass.qrReleaseAt && (
          <p className="tw-notice" role="status">
            QR станет доступен {new Date(view.pass.qrReleaseAt).toLocaleString("ru-RU")}. Обновите
            страницу в это время.
          </p>
        )}
        <PassView pass={view.pass} />
      </>
    );
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
