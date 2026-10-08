import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FutureShell } from "@/components/app/FutureShell";
import { PageShell } from "@/components/app/PageShell";
import { UnavailableNotice, privateRouteHeaders } from "@/components/auth/AuthUi";
import { Button } from "@/components/ui/button";
import { getMemberState, signOut } from "@/lib/auth/auth.functions";
import { pageMeta } from "@/lib/seo";
import { getTelegramAvailability } from "@/lib/auth/telegram.functions";
import { MemberTelegram } from "@/components/auth/MemberTelegram";
import { MemberApplications } from "@/components/member/MemberApplications";
import { MemberOrders } from "@/components/member/MemberOrders";
import { SiteMember } from "@/components/member/SiteMember";
import { clearDraftForSignout } from "@/lib/questionnaire-draft-session";
import { MembershipIntakeStatus } from "@/components/member/MembershipIntakeStatus";
import { getMyMembershipQuestionnaires } from "@/lib/questionnaire.functions";
import { showOwnedIntakeOnly } from "@/lib/questionnaire-backend";
import { getMyCommerce } from "@/lib/orders.functions";
import { listMyApplications, listPublishedEvents } from "@/lib/applications.functions";

export const Route = createFileRoute("/member")({
  headers: privateRouteHeaders,
  head: () => pageMeta("Кабинет — ВНЕ", "Личный кабинет участника ВНЕ.", true),
  validateSearch: (s: Record<string, unknown>): { event?: string | undefined } => ({
    event:
      typeof s["event"] === "string" && /^[a-z0-9-]{1,80}$/.test(s["event"])
        ? s["event"]
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ deps }) => {
    const [s, tg, intake] = await Promise.all([
      getMemberState(),
      getTelegramAvailability(),
      getMyMembershipQuestionnaires(),
    ]);
    if (s.state === "signin")
      throw redirect({
        to: "/login",
        search: { redirect: deps.event ? `/member?event=${deps.event}` : "/member" },
      });
    const [apps, ev, com] =
      s.state === "ok"
        ? await Promise.all([listMyApplications(), listPublishedEvents(), getMyCommerce()])
        : [{ state: "ok" as const, items: [] }, { ok: true as const, events: [] }, null];
    return {
      ...s,
      intake,
      bot: tg.enabled ? tg.bot : null,
      apps: apps.items,
      appsState: apps.state,
      events: ev.events,
      eventsOk: ev.ok,
      commerce: com,
    };
  },
  component: MemberPage,
});

function MemberPage() {
  const s = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const out = useServerFn(signOut);
  const [outError, setOutError] = useState("");
  if (s.state === "preview") return <SiteMember event={search.event} />;
  if (s.state === "unconfigured")
    return (
      <>
        <div className="mx-auto max-w-[1376px] px-5 pt-28 sm:px-8 lg:px-12">
          <UnavailableNotice>
            Кабинет недоступен: тестовая среда не подключена. Вход не выполняется, данные не
            показываются.
          </UnavailableNotice>
        </div>
        <FutureShell
          eyebrow="ВНЕ / кабинет"
          title="Личное пространство готовится"
          intro="Пока это только визуальная оболочка без входа, профиля и персональных данных."
          areas={["Заявка", "Решение", "Заказ и оплата", "Участие", "Пропуск"]}
        />
      </>
    );
  if (showOwnedIntakeOnly(s.state, s.intake.ok))
    return (
      <PageShell
        eyebrow="ВНЕ / кабинет"
        title="Заявка на вступление"
        intro="Аккаунт и решение по заявке — отдельные шаги. Участие в событиях подтверждается отдельно."
        density="compact"
      >
        <div className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 lg:px-12">
          <MembershipIntakeStatus state={s.intake} />
        </div>
      </PageShell>
    );
  if (s.state === "error" || s.state === "pending")
    return (
      <PageShell
        eyebrow="ВНЕ / кабинет"
        title="Кабинет недоступен"
        intro="Не удалось проверить сессию. Попробуйте позже."
        density="compact"
      >
        <div className="h-10" />
      </PageShell>
    );
  return (
    <PageShell
      eyebrow="ВНЕ / кабинет"
      title={s.displayName ? `Здравствуйте, ${s.displayName}` : "Кабинет"}
      intro="Заявки на события и их статусы. Резерв, заказ и участие (sandbox). Пропуск — на следующем этапе."
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 lg:px-12">
        {(s.intake.ok || s.intake.reason !== "unconfigured") && (
          <div className="mb-10">
            <MembershipIntakeStatus state={s.intake} />
          </div>
        )}
        {s.appsState === "ok" ? (
          <>
            {!s.eventsOk && (
              <LoadError text="Список событий не загрузился. Подача новой заявки временно недоступна — это не значит, что событий нет." />
            )}
            <MemberApplications
              items={s.apps}
              events={s.eventsOk ? s.events : []}
              eventsUnavailable={!s.eventsOk}
              defaultName={s.displayName}
              preselectSlug={search.event}
            />
            {s.commerce && (
              <MemberOrders
                state={s.commerce.state}
                orders={s.commerce.orders}
                options={s.commerce.options}
                simulated={s.commerce.simulated}
              />
            )}
          </>
        ) : s.appsState === "signin" ? (
          <LoadError
            text="Сессия истекла. Войдите снова, чтобы увидеть заявки."
            href={
              search.event
                ? `/login?redirect=${encodeURIComponent(`/member?event=${search.event}`)}`
                : "/login?redirect=%2Fmember"
            }
            action="Войти"
          />
        ) : (
          <LoadError text="Не удалось загрузить заявки. Это ошибка связи, а не отсутствие заявок." />
        )}
        <p className="mt-10 text-sm text-muted-foreground">
          Уровень защиты сессии: {s.aal === "aal2" ? "с кодом приложения" : "пароль"}.
        </p>
        <MemberTelegram username={s.telegramUsername} linked={s.telegramLinked} bot={s.bot} />
        <Button
          variant="outline"
          className="mt-6 min-h-11"
          onClick={async () => {
            clearDraftForSignout();
            const r = await out().catch(() => ({
              ok: false as const,
              message: "Нет связи. Выход не выполнен.",
            }));
            if (r.ok) {
              // Invalidate again after the server revokes the session: another tab may
              // have refocused and reloaded during the in-flight logout request.
              clearDraftForSignout();
              navigate({ to: "/login", replace: true });
            } else setOutError("message" in r && r.message ? r.message : "Выход не выполнен.");
          }}
        >
          Выйти
        </Button>
        {outError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {outError}
          </p>
        )}
      </section>
    </PageShell>
  );
}

function LoadError({ text, href, action }: { text: string; href?: string; action?: string }) {
  const router = useRouter();
  return (
    <div role="alert" className="mb-6 border-l-2 border-accent bg-surface p-4 text-sm">
      <p>{text}</p>
      {href ? (
        <a href={href} className="mt-3 inline-flex min-h-11 items-center text-blue underline">
          {action}
        </a>
      ) : (
        <Button
          variant="outline"
          className="mt-3 min-h-11"
          onClick={() => void router.invalidate()}
        >
          Повторить
        </Button>
      )}
    </div>
  );
}
