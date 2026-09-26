import { Wordmark } from "./Wordmark";
import { InvitationDialog } from "./InvitationDialog";
import { DemoDialog } from "./DemoDialog";

export function SiteHeader({
  onDialogOpenChange,
}: {
  onDialogOpenChange: (open: boolean) => void;
}) {
  return (
    <header className="pointer-events-auto fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
      <a
        href="#threshold"
        aria-label="ВНЕ — начало"
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <Wordmark compact />
      </a>
      <nav
        aria-label="Основная навигация"
        className="flex items-center gap-5 font-body text-xs text-muted-foreground sm:gap-7"
      >
        <a href="#night" className="hidden transition-colors hover:text-foreground sm:inline">
          Ближайшая ночь
        </a>
        <DemoDialog onOpenChange={onDialogOpenChange} />
        <InvitationDialog compact onOpenChange={onDialogOpenChange} />
      </nav>
    </header>
  );
}
