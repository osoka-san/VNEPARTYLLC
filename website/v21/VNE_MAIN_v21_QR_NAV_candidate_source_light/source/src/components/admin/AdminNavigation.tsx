import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { activeAdminSection, isAdminPath } from "@/lib/admin-navigation";
import "./admin-navigation.css";
import { UnavailableDialog } from "./UnavailableSection";
import { useSiteAccess, logAdminActivity } from "@/lib/site-admin";
const LINKS = [
  { key: "overview", label: "Обзор", to: "/admin", section: "overview" },
  { key: "accounts", label: "Учётные записи", to: "/admin", section: "accounts" },
  { key: "motion", label: "Анимация", to: "/admin", section: "motion" },
  { key: "tickets", label: "Билеты", to: "/admin/tickets" },
  { key: "qr-studio", label: "QR-студия", to: "/admin/qr-studio" },
  { key: "events", label: "Мероприятия", to: "/admin/events" },
  { key: "applications", label: "Заявки", to: "/admin/applications" },
  { key: "orders", label: "Заказы", to: "/admin/orders" },
  { key: "requests", label: "Членство", to: "/admin", section: "requests" },
  { key: "team", label: "Команда", to: "/admin", section: "team" },
  { key: "content", label: "Контент", to: "/admin", section: "content" },
  { key: "operations", label: "Операции", to: "/admin", section: "operations" },
] as const;
export function AdminNavigation() {
  const location = useRouterState({ select: (s) => s.location });
  const bar = useRef<HTMLElement>(null);
  const enabled = isAdminPath(location.pathname);
  const access = useSiteAccess(enabled);
  const [unavailable, setUnavailable] = useState<{ key: string; label: string } | null>(null);
  const unfinished = new Set(["orders", "team"]);
  const active = activeAdminSection(
    location.pathname,
    (location.search as Record<string, unknown>)["section"],
  );
  useEffect(() => {
    if (!enabled || !bar.current) return;
    const el = bar.current;
    const update = () =>
      document.documentElement.style.setProperty(
        "--vne-admin-nav-height",
        `${el.getBoundingClientRect().height}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--vne-admin-nav-height");
    };
  }, [enabled]);
  useEffect(() => {
    if (enabled && access.actor) logAdminActivity("view.section", active);
  }, [enabled, active, access.actor?.id]);
  if (!enabled) return null;
  return (
    <header className="vne-admin-navigation" ref={bar}>
      <div className="vne-admin-navigation-title">
        <Link to="/" className="vne-admin-back">
          <ArrowUpRight size={17} aria-hidden="true" />
          На сайт
        </Link>
        <span>
          {access.actor
            ? `${access.actor.displayName} · ${access.actor.role === "owner" ? "Администратор" : access.actor.role === "reviewer" ? "Просмотр" : "Персональный доступ"}`
            : "Управление"}
        </span>
      </div>
      <nav aria-label="Разделы админки">
        <ul>
          {LINKS.map((item) => (
            <li key={item.key}>
              {unfinished.has(item.key) ? (
                <button
                  type="button"
                  className="is-unavailable"
                  onClick={() => {
                    setUnavailable(item);
                    logAdminActivity("view.unavailable", item.key);
                  }}
                  aria-label={`${item.label} — раздел ещё не заполнен`}
                >
                  <span>{item.label}</span>
                  <span className="vne-nav-dot" aria-hidden="true" />
                </button>
              ) : (
                <Link
                  to={item.to}
                  {...("section" in item ? { search: { section: item.section } } : {})}
                  aria-current={active === item.key ? "page" : undefined}
                  className={active === item.key ? "is-active" : ""}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <UnavailableDialog item={unavailable} onClose={() => setUnavailable(null)} />
    </header>
  );
}
