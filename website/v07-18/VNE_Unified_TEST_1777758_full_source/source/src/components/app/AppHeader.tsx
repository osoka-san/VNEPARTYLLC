import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownRight, ArrowUpRight, Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Wordmark } from "@/components/vne/Wordmark";
import { chapterNavigation, primaryNavigation, publicEvents } from "@/content/site-content";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { navbarVariables } from "@/lib/navbar-settings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import "./navigation.css";

const menuLinks = [...primaryNavigation, { label: "Приглашение", to: "/apply" }] as const;
const secondaryLinks = [
  { label: "Главная", to: "/" },
  { label: "Правила", to: "/rules" },
  { label: "FAQ", to: "/faq" },
  { label: "Связь", to: "/contact" },
] as const;

function focusNavigationLandmark(hash: string) {
  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(hash.replace(/^#/, "")));
  } catch {
    // Invalid fragments still fall back to the page landmark.
  }
  target ??= document.querySelector<HTMLElement>("#main-content");
  if (target) {
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
}

export function AppHeader({
  transparent = false,
  preview = false,
  onOpenChange,
}: {
  transparent?: boolean;
  preview?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [leavingHref, setLeavingHref] = useState<string | null>(null);
  const [departurePhase, setDeparturePhase] = useState<"idle" | "selecting" | "collapsing">("idle");
  const router = useRouter();
  const locationHref = useRouterState({ select: (state) => state.location.href });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousLocation = useRef(locationHref);
  const previousPath = useRef(pathname);
  const panel = useRef<HTMLDivElement>(null);
  const closeFocusHash = useRef<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigating = useRef(false);
  const { reduced, settings } = useMotionEnv();
  const motion = !reduced && settings.menuMotion;
  const config = settings.navbar;
  const variables = navbarVariables(config) as CSSProperties;
  const visibleLinks = primaryNavigation.filter((item) =>
    item.to === "/events"
      ? config.showEvents
      : item.to === "/about"
        ? config.showAbout
        : config.showMember,
  );
  const cancelNavigation = useCallback(() => {
    if (navigationTimer.current !== null) clearTimeout(navigationTimer.current);
    navigationTimer.current = null;
    if (collapseTimer.current !== null) clearTimeout(collapseTimer.current);
    collapseTimer.current = null;
    setLeavingHref(null);
    setDeparturePhase("idle");
  }, []);
  const updateOpen = useCallback(
    (next: boolean) => {
      cancelNavigation();
      if (next) {
        navigating.current = false;
        closeFocusHash.current = null;
        setEventsOpen(pathname === "/events" || pathname.startsWith("/events/"));
      }
      setOpen(next);
      onOpenChange?.(next);
    },
    [cancelNavigation, onOpenChange, pathname],
  );
  useEffect(() => {
    if (previousLocation.current !== locationHref) {
      const samePage = previousPath.current === pathname;
      previousLocation.current = locationHref;
      previousPath.current = pathname;
      if (open) {
        navigating.current = true;
        closeFocusHash.current = samePage ? (locationHref.split("#")[1] ?? "") : null;
        updateOpen(false);
      }
    }
  }, [locationHref, pathname, open, updateOpen]);
  // Back/forward or another navigation cancels a queued menu click before it can win the race.
  useEffect(
    () => router.subscribe("onBeforeNavigate", cancelNavigation),
    [router, cancelNavigation],
  );
  useEffect(
    () => () => {
      if (navigationTimer.current !== null) clearTimeout(navigationTimer.current);
      if (collapseTimer.current !== null) clearTimeout(collapseTimer.current);
    },
    [],
  );
  const navigateFromMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    // Keep ordinary anchor behavior for new tabs, downloads and modified clicks.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.currentTarget.target === "_blank" ||
      event.currentTarget.hasAttribute("download")
    )
      return;
    const anchor = event.currentTarget;
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    event.preventDefault();
    if (navigationTimer.current !== null || navigating.current) return;
    const href = destination.pathname + destination.search + destination.hash;
    const depart = () => {
      navigationTimer.current = null;
      navigating.current = true;
      updateOpen(false);
      void router
        .navigate({ href })
        .then(() => {
          // The root owns focus on route changes. Same-page links need the same accessible handoff.
          if (destination.pathname === pathname) {
            focusNavigationLandmark(destination.hash);
          }
        })
        .catch(() => {
          navigating.current = false;
          // Restore an operable menu when a navigation is rejected by the router.
          updateOpen(true);
        });
    };
    if (!motion) {
      depart();
      return;
    }
    setLeavingHref(anchor.getAttribute("href"));
    // Selection → panel collapse → route. Bounded timers never depend on animationend.
    setDeparturePhase("selecting");
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      setDeparturePhase("collapsing");
    }, 70);
    navigationTimer.current = setTimeout(depart, 240);
  };
  const isCurrent = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <Dialog.Root open={open} onOpenChange={updateOpen}>
      <header
        className="vne-navbar"
        data-transparent={transparent}
        data-motion={motion}
        data-preview={preview}
        style={variables}
      >
        <div className="vne-navbar-inner">
          <Link to="/" aria-label="ВНЕ — главная" className="vne-navbar-brand">
            <Wordmark compact />
          </Link>
          <nav aria-label="Основная навигация" className="vne-navbar-links">
            {visibleLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="vne-navbar-link"
                aria-current={isCurrent(item.to) ? "page" : undefined}
              >
                <span className="vne-nav-roll">
                  <span>{item.label}</span>
                  <span aria-hidden="true">{item.label}</span>
                </span>
              </Link>
            ))}
          </nav>
          <div className="vne-navbar-actions">
            {config.showInvite && (
              <Link to="/apply" search={{ event: undefined }} className="vne-navbar-invite">
                {config.inviteLabel} <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
            <Dialog.Trigger className="vne-menu-trigger" aria-label="Открыть меню">
              <span>Меню</span>
              <span className="vne-menu-mark" aria-hidden="true">
                <i />
                <i />
              </span>
            </Dialog.Trigger>
          </div>
        </div>
      </header>
      <Dialog.Portal>
        <Dialog.Overlay
          className="vne-menu-overlay"
          data-motion={motion}
          data-phase={departurePhase}
          data-navigation={navigating.current}
        />
        <Dialog.Content
          ref={panel}
          className="vne-menu-panel"
          data-motion={motion}
          data-phase={departurePhase}
          data-navigation={navigating.current}
          style={variables}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeButton.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (navigating.current) event.preventDefault();
            const hash = closeFocusHash.current;
            closeFocusHash.current = null;
            if (
              hash !== null &&
              (!document.activeElement ||
                document.activeElement === document.body ||
                panel.current?.contains(document.activeElement))
            ) {
              focusNavigationLandmark(hash);
            }
          }}
        >
          <Dialog.Title className="sr-only">Навигация ВНЕ</Dialog.Title>
          <Dialog.Description className="sr-only">
            Страницы проекта и главы главной. Escape закрывает меню.
          </Dialog.Description>
          <div className="vne-menu-top">
            <Link
              to="/"
              aria-label="ВНЕ — главная"
              className="vne-menu-brand"
              onClick={navigateFromMenu}
            >
              <Wordmark compact />
            </Link>
            <span className="vne-menu-caption">За пределами привычного</span>
            <Dialog.Close ref={closeButton} className="vne-menu-close" aria-label="Закрыть меню">
              <span>Закрыть</span>
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="vne-menu-body">
            <nav aria-label="Все страницы" className="vne-menu-primary">
              <p className="vne-menu-eyebrow">
                ВНЕ / Навигация <ArrowDownRight size={18} aria-hidden="true" />
              </p>
              {menuLinks.map((item, index) =>
                item.to === "/events" ? (
                  <Collapsible
                    key={item.to}
                    open={eventsOpen}
                    onOpenChange={setEventsOpen}
                    className="vne-menu-group"
                    style={{ "--menu-index": index } as CSSProperties}
                  >
                    <CollapsibleTrigger
                      className="vne-menu-link vne-menu-events-trigger"
                      data-current={isCurrent(item.to)}
                    >
                      <span className="vne-menu-number" aria-hidden="true">
                        01
                      </span>
                      <span className="vne-menu-label">{item.label}</span>
                      <Plus className="vne-menu-expand" aria-hidden="true" />
                    </CollapsibleTrigger>
                    <CollapsibleContent
                      className="vne-menu-events"
                      inert={!eventsOpen}
                      aria-hidden={!eventsOpen}
                    >
                      <div className="vne-menu-events-inner">
                        <div className="vne-menu-event-grid">
                          {publicEvents.map((event) => (
                            <Link
                              key={event.slug}
                              to="/events/$slug"
                              params={{ slug: event.slug }}
                              className="vne-menu-event"
                              onClick={navigateFromMenu}
                              data-selected={leavingHref === `/events/${event.slug}`}
                              aria-current={
                                pathname === `/events/${event.slug}` ? "page" : undefined
                              }
                            >
                              <span className="vne-menu-event-copy">
                                <span className="vne-menu-event-title">{event.title}</span>
                                <span className="vne-menu-event-status">
                                  {event.status === "demo" ? "Демо / не анонс" : event.kicker}
                                </span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <Link
                    key={item.to}
                    to={item.to}
                    {...(item.to === "/apply" ? { search: { event: undefined } } : {})}
                    className="vne-menu-link"
                    onClick={navigateFromMenu}
                    aria-current={isCurrent(item.to) ? "page" : undefined}
                    data-selected={leavingHref === item.to}
                    style={{ "--menu-index": index } as CSSProperties}
                  >
                    <span className="vne-menu-number" aria-hidden="true">
                      0{index + 1}
                    </span>
                    <span className="vne-menu-label">
                      {item.to === "/apply" ? config.inviteLabel : item.label}
                    </span>
                    <ArrowUpRight className="vne-menu-arrow" aria-hidden="true" />
                  </Link>
                ),
              )}
            </nav>
            <div className="vne-menu-aside">
              <p className="vne-menu-aside-heading">
                Меньше шума.
                <br />
                Больше присутствия.
              </p>
              {config.showChapters && (
                <nav aria-label="Главы главной" className="vne-menu-chapters">
                  <p className="vne-menu-eyebrow">Начать с главной</p>
                  {chapterNavigation.map((item) => (
                    <Link key={item.hash} to="/" hash={item.hash} onClick={navigateFromMenu}>
                      {item.label}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </div>
          <div className="vne-menu-bottom">
            <p>Закрытые музыкальные события</p>
            <nav aria-label="О проекте и помощь">
              {secondaryLinks.map((item) => (
                <Link key={item.to} to={item.to} onClick={navigateFromMenu}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
