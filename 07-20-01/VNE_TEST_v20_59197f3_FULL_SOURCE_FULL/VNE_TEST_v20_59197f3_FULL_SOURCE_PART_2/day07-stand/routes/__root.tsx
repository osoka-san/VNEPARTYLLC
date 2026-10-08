import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApplyDraftProvider } from "@/components/app/ApplyDraft";
import appCss from "../styles.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ВНЕ · TEST" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/fonts/fonts.css" },
    ],
  }),
  shellComponent: ({ children }: { children: ReactNode }) => (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  component: () => (
    <ApplyDraftProvider>
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-sm text-orange">ВНЕ · закрытый TEST · только вымышленные данные</p>
        <nav aria-label="Тестовый стенд" className="my-6 flex flex-wrap gap-6">
          <a href="/login">Вход</a>
          <a href="/apply">Анкета</a>
          <a href="/member">Мой статус и пропуск</a>
          <a href="/scan">TEST-сканер</a>
          <a href="/admin">TEST-допуск</a>
          <a href="/admin/mfa">MFA для ADMIN_TEST</a>
          <a href="/admin/violations">Нарушения</a>
          <a href="/admin/intakes">Ревью анкет</a>
          <a href="/scanner/mfa">MFA для TEST-сканеров</a>
        </nav>
        <Outlet />
      </main>
    </ApplyDraftProvider>
  ),
  notFoundComponent: () => <p>Страница недоступна.</p>,
  errorComponent: () => <p role="alert">Не удалось загрузить страницу. Обновите её.</p>,
});
