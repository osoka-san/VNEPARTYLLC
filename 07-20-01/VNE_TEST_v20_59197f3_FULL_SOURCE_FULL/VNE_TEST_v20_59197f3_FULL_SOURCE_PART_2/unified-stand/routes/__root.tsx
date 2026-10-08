import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { defaultLoadingSettings, loadingVariables } from "@/lib/loading-settings";
import { ApplyDraftProvider } from "@/components/app/ApplyDraft";
import { CookieNoticeProvider } from "@/components/app/CookieNotice";
import { UtilityDock } from "@/components/app/UtilityDock";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PageTransition } from "@/components/motion/PageTransition";
import { SiteLoadingProvider } from "@/components/loading/SiteLoading";
import { ClientTelemetry } from "@/components/diagnostics/ClientTelemetry";
import { StatusScene } from "@/components/diagnostics/StatusScene";
import { recordBrowserEvent } from "@/components/diagnostics/telemetry";
import { PRESENTATION_PATHS, UNIFIED_LABEL } from "@/unified/config.mjs";
import { requireUnifiedSession } from "@/unified/session-gate";
import appCss from "../styles.css?url";
const quiet = new Set(["/privacy", "/consent", "/terms", "/refunds", "/cookies"]);
function NotFound() {
  useEffect(() => {
    recordBrowserEvent("route_missing", "fallback");
  }, []);
  return <StatusScene code={404} />;
}
function ErrorView({ reset }: { reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    recordBrowserEvent("render_failed", "fallback");
  }, []);
  return (
    <StatusScene
      code={500}
      onRetry={() => {
        void router.invalidate();
        reset();
      }}
    />
  );
}
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: requireUnifiedSession,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: UNIFIED_LABEL },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "/fonts/fonts.css" },
      { rel: "stylesheet", href: "/loading/wormhole.css?v=4" },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/subsets-v1/Onest-Variable-core.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/subsets-v1/Unbounded-Variable-core.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: ({ children }: { children: ReactNode }) => (
    <html lang="ru" style={loadingVariables(defaultLoadingSettings) as CSSProperties}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});
function Root() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const presentation = PRESENTATION_PATHS.includes(pathname);
  const diagnostics = pathname === "/admin/diagnostics";
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return (
    <QueryClientProvider client={queryClient}>
      <SiteLoadingProvider>
        <MotionProvider localOnly>
          <CookieNoticeProvider>
            <ApplyDraftProvider>
              <ClientTelemetry />
              <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
                {presentation || diagnostics ? (
                  <PageTransition routeKey={pathname} quiet={quiet.has(pathname)}>
                    <Outlet />
                  </PageTransition>
                ) : (
                  <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl px-5 py-10">
                    <p className="text-sm text-orange">
                      {UNIFIED_LABEL} · только вымышленные данные
                    </p>
                    <nav
                      aria-label="Тестовый стенд"
                      className="my-6 flex flex-wrap gap-x-6 gap-y-3"
                    >
                      <a href="/">Главная</a>
                      <a href="/login">Вход / выход</a>
                      <a href="/apply">Анкета</a>
                      <a href="/member">Мой статус и пропуск</a>
                      <a href="/scan">TEST-сканер</a>
                      <a href="/admin">TEST-допуск</a>
                      <a href="/admin/mfa">MFA ADMIN_TEST</a>
                      <a href="/admin/violations">Нарушения</a>
                      <a href="/admin/intakes">Ревью анкет</a>
                      <a href="/scanner/mfa">MFA сканеров</a>
                      <a href="/admin/diagnostics">Диагностика</a>
                    </nav>
                    <Outlet />
                  </main>
                )}
              </div>
              {presentation && (
                <aside
                  className="fixed bottom-[4.5rem] left-2 z-30 rounded bg-background/95 px-3 py-2 text-[10px] text-muted-foreground"
                  aria-label="Режим TEST"
                >
                  {UNIFIED_LABEL} · закрытый TEST-вход
                </aside>
              )}
              <UtilityDock />
            </ApplyDraftProvider>
          </CookieNoticeProvider>
        </MotionProvider>
      </SiteLoadingProvider>
    </QueryClientProvider>
  );
}
