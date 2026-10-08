import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PageShell } from "@/components/app/PageShell";
import { faqItems, getPublicEvent } from "@/content/site-content";
import { pageMeta } from "@/lib/seo";
import { InView } from "@/components/motion/InView";
import { useMotionEnv } from "@/components/motion/MotionProvider";
const parseSearch = (search: Record<string, unknown>) => ({
  event: typeof search["event"] === "string" ? search["event"] : undefined,
});
export const Route = createFileRoute("/faq")({
  validateSearch: parseSearch,
  head: () =>
    pageMeta(
      "Вопросы и ответы — ВНЕ",
      "Ответы о заявке, участии, оплате, адресе, QR и поддержке ВНЕ.",
    ),
  component: FaqPage,
});
function FaqPage() {
  const { event } = Route.useSearch();
  const selected = getPublicEvent(event);
  const [open, setOpen] = useState<string[]>([]);
  useMotionEnv();
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (faqItems.some((item) => item.id === id))
      setOpen((current) => (current.includes(id) ? current : [...current, id]));
  }, []);
  return (
    <PageShell
      eyebrow="ВНЕ / FAQ"
      scrambleEyebrow="faq.page.eyebrow"
      title="Вопросы без обещаний"
      intro="Здесь разделены текущие факты, демонстрационные состояния и функции будущих этапов."
      density="compact"
    >
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <Accordion type="multiple" value={open} onValueChange={setOpen}>
          {faqItems.map((item) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              id={item.id}
              className={`scroll-mt-24 border-border transition-colors ${open.includes(item.id) ? "bg-surface" : ""}`}
            >
              <AccordionTrigger className="py-6 font-display text-left text-base no-underline hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-6 leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <InView subtle>
          <Link
            to="/apply"
            search={{ event: selected?.slug }}
            className="mt-10 inline-flex text-blue underline underline-offset-4"
          >
            Вернуться к форме{selected ? `: ${selected.title}` : ""}
          </Link>
        </InView>
      </section>
    </PageShell>
  );
}
