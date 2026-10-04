import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Button } from "@/components/ui/button";
import { getMediaOverrides } from "@/lib/media.functions";
import { applyMediaOverrides } from "@/lib/media-library";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PageTransition } from "@/components/motion/PageTransition";
import { UtilityDock } from "@/components/app/UtilityDock";
import { InView } from "@/components/motion/InView";
import { ApplyDraftProvider } from "@/components/app/ApplyDraft";

const QUIET_ROUTES = new Set(["/privacy", "/consent", "/terms", "/refunds", "/cookies"]);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <InView subtle className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Такой страницы не существует или она была перенесена.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
        </div>
      </InView>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <InView subtle className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Страница не загрузилась
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Произошла ошибка на нашей стороне. Попробуйте обновить страницу или вернуться на главную.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Попробовать снова
          </Button>
          <Button asChild variant="outline">
            <Link to="/">На главную</Link>
          </Button>
        </div>
      </InView>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    const overrides = await getMediaOverrides().catch(() => ({}));
    applyMediaOverrides(overrides);
    return { mediaOverrides: overrides };
  },
  staleTime: 60_000,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ВНЕ" },
      { name: "description", content: "ВНЕ — закрытые музыкальные события." },
      { name: "author", content: "ВНЕ" },
      { property: "og:title", content: "ВНЕ" },
      { property: "og:description", content: "Закрытые музыкальные события." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: "/fonts/fonts.css" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Замены изображений из админки применяются до рендера страниц (идемпотентно).
  applyMediaOverrides(Route.useLoaderData()?.mediaOverrides);
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true });
    });
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
          <ApplyDraftProvider>
            <PageTransition routeKey={pathname} quiet={QUIET_ROUTES.has(pathname)}>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
            </PageTransition>
          </ApplyDraftProvider>
        </div>
        <UtilityDock />
      </MotionProvider>
    </QueryClientProvider>
  );
}
