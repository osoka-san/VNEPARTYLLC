import { PageShell } from "./PageShell";
import { StatusBadge } from "./EventCard";
import { InView } from "@/components/motion/InView";

export function FutureShell({
  eyebrow,
  title,
  intro,
  areas,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  areas: string[];
}) {
  return (
    <PageShell eyebrow={eyebrow} title={title} intro={intro} density="compact">
      <InView subtle className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <section>
          <StatusBadge>Демонстрационная оболочка</StatusBadge>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Страница не защищена и не выполняет рабочих операций. Реальные данные, роли и действия
            появятся на отдельном этапе.
          </p>
          <div className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area, index) => (
              <div className="min-h-36 bg-surface p-5" key={area}>
                <p className="font-display text-xs text-mint">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-4 font-display text-lg">{area}</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Состояние готовится. Действия недоступны.
                </p>
              </div>
            ))}
          </div>
        </section>
      </InView>
    </PageShell>
  );
}
