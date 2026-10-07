import { Link, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Wordmark } from "@/components/vne/Wordmark";
import { chapterNavigation, primaryNavigation } from "@/content/site-content";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { navbarVariables } from "@/lib/navbar-settings";
import "./navigation.css";

const menuLinks = [...primaryNavigation, { label: "Приглашение", to: "/apply" }] as const;
const secondaryLinks = [
  { label: "Главная", to: "/" },
  { label: "Правила", to: "/rules" },
  { label: "FAQ", to: "/faq" },
  { label: "Связь", to: "/contact" },
] as const;

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousPath = useRef(pathname);
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
  const updateOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      if (open) updateOpen(false);
    }
  }, [pathname, open, updateOpen]);
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
        <Dialog.Overlay className="vne-menu-overlay" data-motion={motion} />
        <Dialog.Content className="vne-menu-panel" data-motion={motion} style={variables}>
          <Dialog.Title className="sr-only">Навигация ВНЕ</Dialog.Title>
          <Dialog.Description className="sr-only">
            Страницы проекта и главы главной. Escape закрывает меню.
          </Dialog.Description>
          <div className="vne-menu-top">
            <Dialog.Close asChild>
              <Link to="/" aria-label="ВНЕ — главная" className="vne-menu-brand">
                <Wordmark compact />
              </Link>
            </Dialog.Close>
            <span className="vne-menu-caption">За пределами привычного</span>
            <Dialog.Close className="vne-menu-close" aria-label="Закрыть меню">
              <span>Закрыть</span>
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="vne-menu-body">
            <nav aria-label="Все страницы" className="vne-menu-primary">
              <p className="vne-menu-eyebrow">
                ВНЕ / Навигация <ArrowDownRight size={18} aria-hidden="true" />
              </p>
              {menuLinks.map((item, index) => (
                <Dialog.Close asChild key={item.to}>
                  <Link
                    to={item.to}
                    {...(item.to === "/apply" ? { search: { event: undefined } } : {})}
                    className="vne-menu-link"
                    aria-current={isCurrent(item.to) ? "page" : undefined}
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
                </Dialog.Close>
              ))}
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
                    <Dialog.Close asChild key={item.hash}>
                      <Link to="/" hash={item.hash}>
                        {item.label}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </Link>
                    </Dialog.Close>
                  ))}
                </nav>
              )}
            </div>
          </div>
          <div className="vne-menu-bottom">
            <p>Закрытые музыкальные события</p>
            <nav aria-label="О проекте и помощь">
              {secondaryLinks.map((item) => (
                <Dialog.Close asChild key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                </Dialog.Close>
              ))}
            </nav>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
