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

export function DemoDialog({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const updateOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={updateOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="hidden h-auto p-0 text-muted-foreground hover:bg-transparent hover:text-foreground sm:inline-flex"
        >
          Кабинет
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md border-border bg-surface text-foreground">
        <p className="font-display text-xs uppercase text-mint">ВНЕ / кабинет</p>
        <DialogTitle className="font-display text-2xl">Кабинет готовится</DialogTitle>
        <DialogDescription className="font-body leading-relaxed text-muted-foreground">
          Это демонстрационный экран. Вход и личные данные пока не используются.
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
