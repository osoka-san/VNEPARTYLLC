import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useHydrated, useRouterState } from "@tanstack/react-router";
import { createSiteLoading } from "@/lib/site-loading";
import { loadingVariables, type LoadingSettings } from "@/lib/loading-settings";

const LoadingContext = createContext<ReturnType<typeof createSiteLoading> | null>(null);
const idleRelease = () => {};
const idleBegin = () => idleRelease;

export function useLoadingPresentation(
  settings: LoadingSettings,
  ready: boolean,
  reduced: boolean,
) {
  const controller = useContext(LoadingContext);
  useEffect(() => {
    if (!ready) return;
    controller?.configure(settings);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(loadingVariables(settings, reduced)))
      root.style.setProperty(key, value);
  }, [controller, settings, ready, reduced]);
}

/** Use for explicit async work that is not owned by the router/query cache. */
export function useBeginSiteLoading() {
  return useContext(LoadingContext)?.begin ?? idleBegin;
}

export function useSiteLoading(active: boolean, label = "Загружаем данные") {
  const begin = useBeginSiteLoading();
  useEffect(() => {
    if (active) return begin(label);
    return undefined;
  }, [active, begin, label]);
}

/** Track imperative actions, releasing on rejection and on the caller's unmount. */
export function useSiteLoadingAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
  label: string,
) {
  const begin = useBeginSiteLoading();
  const releases = useRef(new Set<() => void>());
  useEffect(() => {
    const current = releases.current;
    return () => {
      current.forEach((release) => release());
      current.clear();
    };
  }, []);
  return useCallback(
    async (...args: Args) => {
      const release = begin(label);
      releases.current.add(release);
      try {
        return await action(...args);
      } finally {
        release();
        releases.current.delete(release);
      }
    },
    [action, begin, label],
  );
}

/** Adapted from elijahgummer's MIT-licensed Wormhole on Uiverse. */
export function Wormhole({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`vne-wormhole${compact ? " vne-wormhole--compact" : ""}`} aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => (
        <i key={index} style={{ "--ring-index": index } as CSSProperties} />
      ))}
    </span>
  );
}

/** The original homepage Flow SVG, tinted by the shared loader palette. */
export function LoadingWordmark() {
  return <span className="vne-loading-brand" role="img" aria-label="ВНЕ" />;
}

/** beUI Percent visual adapted to the site's task controller, without demo looping. */
export function LoadingPercent({ progress }: { progress: number }) {
  return (
    <span
      className="vne-loading-percent"
      role="progressbar"
      aria-label="Оценка прогресса загрузки"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={progress === 100 ? "Ожидание завершено" : `Приблизительно ${progress}%`}
      style={{ "--loading-progress": progress / 100 } as CSSProperties}
    >
      <span className="vne-loading-percent-value" aria-hidden="true">
        {progress}%
      </span>
      <span className="vne-loading-percent-track" aria-hidden="true">
        <span className="vne-loading-percent-fill" />
      </span>
    </span>
  );
}

function LoadingSurface() {
  const hydrated = useHydrated();
  const controller = useContext(LoadingContext)!;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const routing = useRouterState({ select: (state) => state.isLoading });
  const fetching = useIsFetching({
    // Preloads and silent refreshes with usable cached data do not obscure the page.
    predicate: (query) => query.isActive() && query.state.data === undefined,
  });
  const mutating = useIsMutating();
  useSiteLoading(routing, "Открываем страницу");
  useSiteLoading(fetching > 0, "Загружаем данные");
  useSiteLoading(mutating > 0, "Сохраняем изменения");
  return (
    <>
      <noscript>
        <style>{"[data-site-loading]{display:none!important}"}</style>
      </noscript>
      <div
        className="vne-loading-glass"
        data-site-loading
        data-state={state.visible ? "visible" : "hidden"}
        data-bootstrap={hydrated ? undefined : "true"}
        aria-hidden={!state.visible}
      >
        <div className="vne-loading-center">
          <LoadingWordmark />
          <Wormhole />
          <LoadingPercent progress={state.progress} />
          <span className="vne-loading-label" role="status" aria-live="polite" aria-atomic="true">
            {state.label}
          </span>
          {state.slow && <span className="vne-loading-slow">Это занимает чуть больше времени</span>}
        </div>
        {state.visible && state.slow && (
          <button className="vne-loading-continue" type="button" onClick={controller.dismiss}>
            Продолжить просмотр
          </button>
        )}
      </div>
    </>
  );
}

export function SiteLoadingProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createSiteLoading());
  useEffect(() => {
    const unmount = controller.mount();
    // Client effects register image/portal work before removing the SSR bootstrap.
    controller.ready();
    let release: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      release?.();
      clearTimeout(timer);
    };
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (
        event.defaultPrevented ||
        !(form instanceof HTMLFormElement) ||
        new URL(form.action, window.location.href).pathname !== "/admin-logout"
      )
        return;
      clear();
      release = controller.begin("Завершаем сеанс");
      timer = setTimeout(clear, 12_000);
    };
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", clear);
    return () => {
      clear();
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", clear);
      unmount();
    };
  }, [controller]);
  return (
    <LoadingContext.Provider value={controller}>
      {children}
      <LoadingSurface />
    </LoadingContext.Provider>
  );
}
