import { Accessibility } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "vne-reduced-motion";

export function MotionPreference({ compact = false }: { compact?: boolean }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = window.localStorage.getItem(KEY) === "true";
    } catch {
      /* Storage can be disabled; the switch still works for this visit. */
    }
    setReduced(saved);
    document.documentElement.dataset["reduceMotion"] = String(saved);
  }, []);

  const toggle = () => {
    const next = !reduced;
    setReduced(next);
    try {
      window.localStorage.setItem(KEY, String(next));
    } catch {
      /* Keep the current view usable when persistence is unavailable. */
    }
    document.documentElement.dataset["reduceMotion"] = String(next);
  };

  return (
    <Button
      type="button"
      variant={reduced ? "secondary" : "outline"}
      onClick={toggle}
      aria-pressed={reduced}
      className="min-h-11 gap-2 border-border px-3 sm:px-4"
    >
      <Accessibility aria-hidden="true" />
      <span className={compact ? "hidden sm:inline" : undefined}>
        {reduced ? "Обычное движение" : "Уменьшить анимацию"}
      </span>
      {compact ? <span className="sm:hidden">Движение</span> : null}
    </Button>
  );
}
