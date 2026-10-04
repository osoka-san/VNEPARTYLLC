import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Wordmark } from "@/components/vne/Wordmark";
import { chapterNavigation, primaryNavigation } from "@/content/site-content";
import { Stagger } from "@/components/motion/Primitives";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { AnimatedBackground } from "@/components/motion/AnimatedBackground";

export function AppHeader({
  transparent = false,
  onOpenChange,
}: {
  transparent?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { settings } = useMotionEnv();
  const updateOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const headerClass = transparent ? "bg-background/40" : "border-b border-border bg-background/92";

  return (
    <header className={`fixed inset-x-0 top-0 z-40 backdrop-blur-md ${headerClass}`}>
      <div className="mx-auto flex h-16 max-w-[1376px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link
          to="/"
          aria-label="ВНЕ — главная"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <Wordmark compact />
        </Link>
        <nav aria-label="Основная навигация" className="hidden items-center gap-6 text-sm md:flex">
          <AnimatedBackground
            className="flex items-center gap-1"
            activeIndex={primaryNavigation.findIndex((item) => pathname.startsWith(item.to))}
          >
            {primaryNavigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground" }}
                className="inline-flex min-h-11 items-center px-3 py-2 transition-colors duration-200 hover:text-foreground"
                activeOptions={{ exact: item.to === "/events" }}
              >
                <AnimatedText role="accent" enabled={settings.textButtons}>
                  {item.label}
                </AnimatedText>
              </Link>
            ))}
          </AnimatedBackground>
          <Button asChild className="h-11 bg-cta text-cta-foreground hover:bg-cta/90">
            <Link to="/apply" search={{ event: undefined }}>
              <AnimatedText role="accent" enabled={settings.textButtons}>
                Приглашение
              </AnimatedText>
            </Link>
          </Button>
        </nav>
        <Sheet open={open} onOpenChange={updateOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 md:hidden"
              aria-label="Открыть меню"
            >
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,25rem)] overflow-y-auto overscroll-contain border-border bg-surface text-foreground">
            <Stagger>
              <SheetTitle className="font-display text-base">
                <AnimatedText role="heading">Навигация</AnimatedText>
              </SheetTitle>
              <SheetDescription>
                <AnimatedText role="body">Страницы проекта и главы главной.</AnimatedText>
              </SheetDescription>
            </Stagger>
            <nav aria-label="Мобильная навигация" className="mt-8">
              <Stagger className="flex flex-col">
                {[{ label: "Главная", to: "/" as const }, ...primaryNavigation].map((item) => (
                  <SheetClose asChild key={item.to}>
                    <Link
                      to={item.to}
                      activeProps={{ className: "border-mint text-foreground" }}
                      inactiveProps={{ className: "border-border text-muted-foreground" }}
                      className="flex min-h-11 items-center border-b py-4 font-display text-sm"
                    >
                      <AnimatedText role="accent">{item.label}</AnimatedText>
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    to="/apply"
                    search={{ event: undefined }}
                    className="flex min-h-11 items-center border-b border-border py-4 font-display text-sm"
                  >
                    <AnimatedText role="accent">Приглашение</AnimatedText>
                  </Link>
                </SheetClose>
                <p className="mb-2 mt-8 text-xs uppercase text-muted-foreground">
                  <AnimatedText role="accent">Главы</AnimatedText>
                </p>
                {chapterNavigation.map((item) => (
                  <SheetClose asChild key={item.hash}>
                    <Link
                      to="/"
                      hash={item.hash}
                      className="flex min-h-11 items-center py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <AnimatedText role="accent">{item.label}</AnimatedText>
                    </Link>
                  </SheetClose>
                ))}
              </Stagger>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
