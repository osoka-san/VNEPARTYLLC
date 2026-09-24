import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { vneContent } from "@/content/vne-content";

export function InvitationDialog({
  compact = false,
  onOpenChange,
}: {
  compact?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const updateOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  return (
    <Dialog open={open} onOpenChange={updateOpen}>
      <DialogTrigger asChild>
        <Button
          className={
            compact
              ? "h-9 bg-cta px-4 text-xs text-cta-foreground hover:bg-cta/90"
              : "h-12 bg-cta px-6 text-sm text-cta-foreground hover:bg-cta/90"
          }
        >
          {vneContent.primaryCta}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md border-border bg-surface text-foreground">
        <p className="font-display text-xs uppercase text-mint">ВНЕ / доступ</p>
        <DialogTitle className="font-display text-2xl">{vneContent.dialogTitle}</DialogTitle>
        <DialogDescription className="font-body leading-relaxed text-muted-foreground">
          {vneContent.dialogBody}
        </DialogDescription>
        <DialogClose asChild>
          <Button
            variant="outline"
            className="mt-4 border-border bg-transparent text-foreground hover:bg-muted"
          >
            Понятно
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
