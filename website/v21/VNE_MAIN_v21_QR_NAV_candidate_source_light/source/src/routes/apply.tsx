import { useSiteLoading } from "@/components/loading/SiteLoading";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/app/PageShell";
import { getPublicEvent, publicEvents } from "@/content/site-content";
import { telegramUsernameError } from "@/lib/telegram-username";
import { submitMembershipRequest } from "@/lib/membership.functions";
import { siteAdminRequest } from "@/lib/site-admin";
import { pageMeta } from "@/lib/seo";
import { InView } from "@/components/motion/InView";
import { useApplyDraft } from "@/components/app/ApplyDraft";
import { Questionnaire, QuestionnaireModeToggle } from "@/components/app/Questionnaire";
import { serializeQuestionnaire, validateQuestionnaire } from "@/lib/questionnaire";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const parseSearch = (search: Record<string, unknown>) => ({
  event: typeof search["event"] === "string" ? search["event"] : undefined,
});
// 03.8-03: the URL is the single source of truth; only known public slugs propagate.
const normalizeEvent = (slug?: string) => getPublicEvent(slug)?.slug;
export const Route = createFileRoute("/apply")({
  validateSearch: parseSearch,
  head: () => pageMeta("Заявка — ВНЕ", "Заявка на участие в закрытом сообществе ВНЕ."),
  component: ApplyPage,
});
function ApplyPage() {
  const { event: eventSlug } = Route.useSearch();
  const selected = getPublicEvent(eventSlug);
  const navigate = useNavigate({ from: "/apply" });
  const draft = useApplyDraft();
  const send = useServerFn(submitMembershipRequest);
  const onEventChange = (value: string) => {
    void navigate({
      search: { event: normalizeEvent(value) },
      replace: true,
      resetScroll: false,
    });
  };
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const telegramRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [errors, setErrors] = useState<{ name?: string; contact?: string; telegram?: string }>({});
  const [message, setMessage] = useState("");
  const [showRequiredErrors, setShowRequiredErrors] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const submission = useRef({ signature: "", id: "" });
  useSiteLoading(pending, "Отправляем заявку");
  const checkField = (field: "name" | "contact" | "telegram") => {
    const v = field === "name" ? draft.name : field === "contact" ? draft.contact : draft.telegram;
    if (!v.trim()) return;
    const err =
      field === "name"
        ? undefined
        : field === "contact"
          ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
            ? undefined
            : "Укажи email вида name@example.com."
          : (telegramUsernameError(v) ?? undefined);
    setErrors((prev) => ({ ...prev, [field]: err }));
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setShowRequiredErrors(true);
    if (Object.keys(validateQuestionnaire(draft.questionnaire)).length) {
      setMessage(
        "Ответь на все вопросы и укажи возраст. На текстовый вопрос — до трёх ответов, каждый до пяти слов.",
      );
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(
          '#vne-questionnaire [aria-invalid="true"]',
        );
        field?.focus();
        field?.scrollIntoView({ block: "center" });
      });
      return;
    }
    const next: { name?: string; contact?: string; telegram?: string } = {};
    const contactValue = draft.contact.trim();
    if (!draft.name.trim()) next.name = "Укажи имя или обращение.";
    if (!contactValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue))
      next.contact = "Укажи email вида name@example.com.";
    const tg = telegramUsernameError(draft.telegram);
    if (tg) next.telegram = tg;
    setErrors(next);
    const first = next.name
      ? nameRef
      : next.contact
        ? contactRef
        : next.telegram
          ? telegramRef
          : null;
    if (first) {
      first.current?.focus();
      setMessage("Проверь выделенные поля.");
      return;
    }
    if (!consent) {
      setMessage("Подтвердите согласие на обработку данных.");
      return;
    }
    setPending(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    const data = {
      name: draft.name,
      email: draft.contact,
      telegram: draft.telegram,
      event: selected?.slug,
      website: String(form.get("website") ?? ""),
      consent,
      questionnaire: serializeQuestionnaire(draft.questionnaire),
      ratings: draft.questionnaire.ratings,
      age: draft.questionnaire.age,
    };
    const signature = JSON.stringify(data);
    if (submission.current.signature !== signature)
      submission.current = { signature, id: crypto.randomUUID() };
    const result = await (async () => {
      // Sites preview uses its own queue. A configured Supabase service keeps the existing flow.
      const config = await siteAdminRequest<{ enabled: boolean; questionnaireVersion?: number }>(
        "requests/config",
      );
      const hasQuestionnaire =
        data.questionnaire.length > 0 ||
        Object.values(data.ratings).some((rating) => rating !== null) ||
        data.age !== null;
      if (hasQuestionnaire && (!config.enabled || config.questionnaireVersion !== 3))
        return {
          ok: false,
          message:
            "Сохранение ответов анкеты в этой среде пока недоступно. Ответы остались в форме; попробуй позже.",
        };
      if (config.enabled)
        return siteAdminRequest<{ ok: boolean; message: string }>("requests/submit", {
          ...data,
          id: submission.current.id,
        }).catch((error: unknown) => ({
          ok: false,
          message: error instanceof Error ? error.message : "Не удалось сохранить заявку.",
        }));
      return send({ data });
    })().catch(() => ({
      ok: false as const,
      message: "Не удалось отправить заявку. Попробуй позже.",
    }));
    setPending(false);
    setMessage(result.message);
    if (result.ok) setDialogOpen(true);
  };
  return (
    <PageShell
      eyebrow="ВНЕ / приглашение"
      title="Оставить заявку"
      intro="Тестовый режим. Используй вымышленные данные. Письма пока не отправляются."
      density="compact"
      headerMedia={
        <QuestionnaireModeToggle
          value={draft.questionnaire}
          onChange={draft.setQuestionnaire}
          disabled={!hydrated || pending}
        />
      }
    >
      <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <InView subtle>
          <div className="border-l-2 border-mint bg-surface p-5">
            <p className="font-display text-xs uppercase text-mint">Заявка на вступление</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Анкета помогает познакомиться с тобой. Аккаунт, рассмотрение общей заявки и участие в
              конкретном событии — отдельные шаги.
            </p>
          </div>
        </InView>
        <InView subtle>
          <div className="mt-8 border-y border-border py-5">
            <p className="text-xs uppercase text-muted-foreground">Выбранный интерес</p>
            <p className="mt-2 font-display text-lg">
              {selected?.title ?? "Общий интерес к проекту"}
            </p>
            {eventSlug && !selected && (
              <p className="mt-2 text-sm text-orange">Неизвестное событие не было выбрано.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link to="/events" className="text-blue underline underline-offset-4">
                Изменить событие
              </Link>
              {selected && (
                <Link
                  to="/apply"
                  search={{ event: undefined }}
                  replace
                  resetScroll={false}
                  className="text-blue underline underline-offset-4"
                >
                  Сбросить выбор
                </Link>
              )}
            </div>
          </div>
        </InView>
        <InView>
          <noscript>
            <p className="mt-10 border-l-2 border-orange bg-surface p-5 text-sm leading-relaxed text-muted-foreground">
              Для защищённой отправки заявки нужен JavaScript. Без него поля отключены.
            </p>
          </noscript>
          <form
            method="post"
            onSubmit={submit}
            noValidate
            aria-disabled={!hydrated}
            data-hydrated={hydrated ? "true" : "false"}
            className="mt-10"
          >
            <fieldset disabled={!hydrated || pending} className="space-y-7 disabled:opacity-60">
              <Questionnaire
                value={draft.questionnaire}
                onChange={draft.setQuestionnaire}
                disabled={!hydrated || pending}
                showModeToggle={false}
                showRequiredErrors={showRequiredErrors}
              />
              <div className="border-t border-border pt-8">
                <h2 className="font-display text-xl">Как к тебе обращаться</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Контактные данные для рассмотрения заявки.
                </p>
              </div>
              <div className="absolute -left-[10000px]" aria-hidden="true">
                <Label htmlFor="website">Сайт</Label>
                <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="name">Имя или обращение</Label>
                <Input
                  ref={nameRef}
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={draft.name}
                  onChange={(e) => draft.setName(e.target.value)}
                  onBlur={() => checkField("name")}
                  enterKeyHint="next"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  className="mt-2 h-12"
                />
                {errors.name && (
                  <p id="name-error" className="mt-2 text-sm text-orange">
                    {errors.name}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="contact">Email</Label>
                <Input
                  ref={contactRef}
                  id="contact"
                  name="contact"
                  autoComplete="email"
                  value={draft.contact}
                  onChange={(e) => draft.setContact(e.target.value)}
                  onBlur={() => checkField("contact")}
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  enterKeyHint="next"
                  aria-invalid={!!errors.contact}
                  aria-describedby={errors.contact ? "contact-error" : "contact-help"}
                  placeholder="name@example.com"
                  className="mt-2 h-12"
                />
                <p id="contact-help" className="mt-2 text-xs text-muted-foreground">
                  Используй вымышленный email. В тестовом режиме письма не отправляются.
                </p>
                {errors.contact && (
                  <p id="contact-error" className="mt-2 text-sm text-orange">
                    {errors.contact}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="telegram">Telegram</Label>
                <Input
                  ref={telegramRef}
                  id="telegram"
                  name="telegram"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={draft.telegram}
                  onChange={(e) => draft.setTelegram(e.target.value)}
                  onBlur={() => checkField("telegram")}
                  enterKeyHint="send"
                  aria-invalid={!!errors.telegram}
                  aria-describedby={errors.telegram ? "telegram-error" : "telegram-help"}
                  placeholder="@vne_guest"
                  className="mt-2 h-12"
                />
                <p id="telegram-help" className="mt-2 text-xs text-muted-foreground">
                  Можно вставить @name, name или ссылку t.me/name.
                </p>
                {errors.telegram && (
                  <p id="telegram-error" className="mt-2 text-sm text-orange">
                    {errors.telegram}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="event">Событие</Label>
                <select
                  id="event"
                  name="event"
                  value={selected?.slug ?? ""}
                  onChange={(e) => onEventChange(e.target.value)}
                  className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Общий интерес к проекту</option>
                  {publicEvents.map((event) => (
                    <option key={event.slug} value={event.slug}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-4 border-y border-border py-6">
                <p className="text-sm text-muted-foreground">
                  Отправляя заявку, вы подтверждаете согласие с опубликованными правилами обработки
                  данных.
                </p>
                <label className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Checkbox
                    required
                    checked={consent}
                    onCheckedChange={(value) => setConsent(value === true)}
                    aria-label="Согласие на обработку данных"
                  />
                  <span>
                    Я прочитал(а){" "}
                    <Link to="/consent" className="text-blue underline underline-offset-4">
                      согласие на обработку данных
                    </Link>
                    .
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  ref={submitRef}
                  type="submit"
                  className="h-12 bg-cta px-6 text-cta-foreground"
                >
                  {pending ? "Отправляем…" : "Отправить заявку"}
                </Button>
                <Link
                  to="/rules"
                  search={{ event: selected?.slug }}
                  className="inline-flex min-h-11 items-center text-sm text-blue underline underline-offset-4"
                >
                  Правила
                </Link>
                <Link
                  to="/faq"
                  search={{ event: selected?.slug }}
                  className="inline-flex min-h-11 items-center text-sm text-blue underline underline-offset-4"
                >
                  FAQ
                </Link>
              </div>
              <p role="status" tabIndex={-1} className="min-h-6 text-sm text-mint">
                {message}
              </p>
            </fieldset>
          </form>
        </InView>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => submitRef.current?.focus({ preventScroll: true }));
            }}
          >
            <DialogHeader>
              <DialogTitle>Заявка сохранена</DialogTitle>
              <DialogDescription>
                Заявка сохранена в тестовой среде и доступна администратору для рассмотрения. Письма
                сейчас не отправляются. Заявка не подтверждает участие.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild type="button" className="min-h-11">
                <Link to="/member" search={{ event: selected?.slug }}>
                  Открыть кабинет
                </Link>
              </Button>
              <Button type="button" className="min-h-11" onClick={() => setDialogOpen(false)}>
                Понятно
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </PageShell>
  );
}
