import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/vne/Wordmark";
import { InView } from "@/components/motion/InView";
import { useCookieNotice } from "./CookieNotice";

const groups = [
  ["События", "/events"],
  ["О проекте", "/about"],
  ["Правила", "/rules"],
  ["FAQ", "/faq"],
  ["Контакт", "/contact"],
  ["Конфиденциальность", "/privacy"],
  ["Согласие", "/consent"],
  ["Условия", "/terms"],
  ["Возвраты", "/refunds"],
  ["Cookie", "/cookies"],
] as const;

export function AppFooter() {
  const { openNotice } = useCookieNotice();
  return (
    <footer
      id="site-links"
      className="border-t border-border bg-background px-5 py-12 sm:px-8 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-[1fr_2fr]">
        <InView subtle>
          <Wordmark compact />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Закрытые музыкальные события. Даты и условия публикуются только после подтверждения.
          </p>
          <button
            type="button"
            onClick={openNotice}
            className="mt-4 min-h-11 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
          >
            Настройки cookies
          </button>
        </InView>
        <nav
          aria-label="Навигация в подвале"
          className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3"
        >
          <div className="contents">
            {groups.map(([label, to]) => (
              <Link
                key={to}
                to={to}
                className="text-muted-foreground underline-offset-4 transition-[color,text-decoration-color] duration-200 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </footer>
  );
}
