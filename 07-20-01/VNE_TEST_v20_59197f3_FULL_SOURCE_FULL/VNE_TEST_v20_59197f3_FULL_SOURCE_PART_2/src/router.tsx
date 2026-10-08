import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ErrorState } from "./components/app/States";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: () => (
      <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground">
        <div className="max-w-xl">
          <ErrorState body="Не удалось загрузить страницу. Попробуйте повторить переход." />
        </div>
      </main>
    ),
  });

  return router;
};
