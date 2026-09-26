import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/vne/Wordmark";
import { InView } from "@/components/motion/InView";

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
  return (
    <footer className="border-t border-border bg-background px-5 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-[1fr_2fr]">
        <InView subtle>
          <Wordmark compact />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Закрытые музыкальные события. Даты и условия публикуются только после подтверждения.
          </p>
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
