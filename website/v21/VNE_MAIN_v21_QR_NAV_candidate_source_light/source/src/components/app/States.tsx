import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InView } from "@/components/motion/InView";

export function EmptyState() {
  return (
    <InView subtle className="border border-border bg-surface p-8 sm:p-12">
      <CalendarX className="text-blue" aria-hidden="true" />
      <h2 className="mt-6 font-display text-2xl">Новая дата будет объявлена</h2>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Пока можно оставить общий интерес к проекту. Это не гарантирует приглашение или доступ.
      </p>
      <Button asChild className="mt-7 bg-cta text-cta-foreground">
        <Link to="/apply" search={{ event: undefined }}>
          Общий интерес
        </Link>
      </Button>
    </InView>
  );
}

export function ErrorState({
  title = "Страница временно недоступна",
  body = "Данные не найдены или ещё не опубликованы.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <InView subtle className="border border-border bg-surface p-8">
      <AlertTriangle className="text-orange" aria-hidden="true" />
      <h2 className="mt-5 font-display text-2xl">{title}</h2>
      <p className="mt-3 text-muted-foreground">{body}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/events">К событиям</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">На главную</Link>
        </Button>
      </div>
    </InView>
  );
}
