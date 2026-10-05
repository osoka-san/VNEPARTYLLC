import { Link, useRouterState } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionPreference } from "./MotionPreference";

/** Постоянные служебные действия вне анимируемой области страниц. */
export function UtilityDock() {
  const onAdmin = useRouterState({ select: (state) => state.location.pathname === "/admin" });

  return (
    <nav
      aria-label="Служебные действия"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-end gap-2">
        <MotionPreference compact />
        <Button
          asChild
          variant={onAdmin ? "secondary" : "outline"}
          className="min-h-11 gap-2 border-border px-4"
        >
          <Link to="/admin" aria-current={onAdmin ? "page" : undefined}>
            <Settings aria-hidden="true" />
            Админ
          </Link>
        </Button>
      </div>
    </nav>
  );
}
