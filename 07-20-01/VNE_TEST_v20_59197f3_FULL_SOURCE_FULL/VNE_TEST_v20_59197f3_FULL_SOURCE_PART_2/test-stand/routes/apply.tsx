import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type FormEvent } from "react";
import { useApplyDraft } from "@/components/app/ApplyDraft";
import { Questionnaire } from "@/components/app/Questionnaire";
import { validateQuestionnaire, serializeQuestionnaire } from "@/lib/questionnaire";
import { validateMembershipInput } from "@/lib/membership";
import {
  getQuestionnaireAvailability,
  submitOwnedMembershipQuestionnaire,
} from "@/lib/questionnaire.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/apply")({
  loader: () => getQuestionnaireAvailability(),
  component: Apply,
});
function Apply() {
  const draft = useApplyDraft(),
    availability = Route.useLoaderData(),
    send = useServerFn(submitOwnedMembershipQuestionnaire);
  const [pending, setPending] = useState(false),
    [errors, setErrors] = useState(false),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false);
  const submission = useRef({ signature: "", id: "" });
  const locked =
    pending ||
    !availability.enabled ||
    ["loading", "signin", "submitted", "conflict", "expired"].includes(draft.persistence.phase) ||
    (draft.persistence.phase === "error" && !draft.persistence.owner);
  const status = {
    loading: "Проверяем сохранённый черновик…",
    ready: "Изменения будут сохраняться автоматически.",
    dirty: "Есть несохранённые изменения…",
    saving: "Сохраняем черновик…",
    saved: draft.persistence.expiresAt
      ? `Черновик сохранён. Доступен до ${new Date(draft.persistence.expiresAt).toLocaleDateString("ru-RU", { timeZone: "UTC" })} (UTC).`
      : "Черновик сохранён.",
    error:
      "Не удалось сохранить или загрузить черновик. Не закрывайте страницу: последние изменения могут быть не сохранены.",
    conflict:
      "Черновик изменён в другой вкладке или на другом устройстве. Автосохранение остановлено: новая версия не перезаписана.",
    expired: "Срок доступа к черновику истёк. Автосохранение остановлено.",
    signin: "Войдите в тестовый аккаунт, чтобы продолжить заполнение.",
    submitted: "Заявка уже отправлена. Её статус доступен в кабинете.",
    unconfigured:
      "Автосохранение черновика пока не подключено. До отправки ответы остаются только в открытой вкладке.",
  }[draft.persistence.phase];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    setErrors(true);
    setSaved(false);
    const intake = { name: draft.name, email: draft.contact, telegram: draft.telegram };
    const check = validateMembershipInput(intake);
    if (!check.ok) {
      setMessage(Object.values(check.errors).join(" "));
      return;
    }
    if (Object.keys(validateQuestionnaire(draft.questionnaire)).length) {
      setMessage("Заполните все вопросы и возраст. Проверьте выделенные поля.");
      return;
    }
    if (!consent) {
      setMessage("Подтвердите согласие на сохранение тестовых данных.");
      return;
    }
    const data = {
      ...intake,
      consent,
      questionnaireVersion: 3,
      questionnaire: serializeQuestionnaire(draft.questionnaire),
      ratings: draft.questionnaire.ratings,
      age: draft.questionnaire.age,
    };
    const signature = JSON.stringify(data);
    if (submission.current.signature !== signature)
      submission.current = { signature, id: crypto.randomUUID() };
    setPending(true);
    setMessage("");
    try {
      const draftReference = draft.persistence.owner ? await draft.flush() : null;
      if (draft.persistence.owner && !draftReference) {
        setMessage("Сначала сохраните черновик или разрешите конфликт. Заявка пока не отправлена.");
        return;
      }
      const result = await send({
        data: {
          ...data,
          idempotencyKey: draftReference?.id ?? submission.current.id,
          ...(draftReference ? { draftReference } : {}),
        },
      });
      if (result.ok) {
        draft.complete();
        setConsent(false);
        setSaved(true);
        setMessage("Анкета сохранена. Номер заявки: " + result.receipt.requestId);
      } else {
        if (result.reason === "signin" || result.reason === "conflict") await draft.revalidate();
        setMessage(
          result.reason === "signin"
            ? "Войдите в тестовый аккаунт. Ответы остаются в форме."
            : result.reason === "conflict"
              ? "Конфликт повторной отправки. Проверьте свой статус."
              : "Не удалось сохранить анкету. Ответы остаются в форме.",
        );
      }
    } catch {
      setMessage("Нет связи. Ответы остаются в форме.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <h1 className="mb-6 text-3xl">Анкета ВНЕ</h1>
      <p className="mb-6">
        Все поля заполняйте вымышленными данными. Анкета не выдаёт доступ к событиям.
      </p>
      <div className="mb-6 space-y-3 rounded border border-border p-4">
        <p role="status" aria-live="polite">
          {status}
        </p>
        {draft.persistence.phase !== "unconfigured" && (
          <p className="text-sm text-muted-foreground">
            Черновик доступен в аккаунте 67 дней с последнего успешного сохранения изменений.
            Просмотр срок не продлевает. Перед выходом дождитесь сообщения «Черновик сохранён».
            После отправки черновик удаляется. Истёкшие черновики удаляются при ежедневной очистке.
          </p>
        )}
        {draft.persistence.phase === "signin" && <Link to="/login">Войти в аккаунт</Link>}
        {draft.persistence.phase === "submitted" && <Link to="/member">Посмотреть мой статус</Link>}
        {draft.persistence.phase === "error" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (draft.persistence.owner) void draft.flush();
              else void draft.reload();
            }}
          >
            Повторить
          </Button>
        )}
        {["conflict", "expired"].includes(draft.persistence.phase) && (
          <Button type="button" variant="outline" onClick={() => void draft.reload()}>
            {draft.persistence.phase === "conflict"
              ? "Загрузить серверную версию вместо ответов в этой вкладке"
              : "Начать заново вместо истёкшего черновика"}
          </Button>
        )}
        {draft.persistence.phase === "saved" && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              document
                .getElementById(`draft-${draft.resumeSection}`)
                ?.scrollIntoView({ block: "start", behavior: "auto" })
            }
          >
            Продолжить заполнение
          </Button>
        )}
      </div>
      <form
        method="post"
        action="/apply#no-submit"
        onSubmit={submit}
        noValidate
        onFocusCapture={(event) => {
          const section = (event.target as HTMLElement).closest<HTMLElement>("[data-draft-section]")
            ?.dataset["draftSection"];
          if (section === "questionnaire" || section === "contact") draft.setResumeSection(section);
        }}
      >
        <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
          <div id="draft-contact" data-draft-section="contact" className="grid gap-3">
            <Label htmlFor="name">Тестовое имя</Label>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) => draft.setName(e.target.value)}
              maxLength={80}
            />
            <Label htmlFor="contact">Тестовый email</Label>
            <Input
              id="contact"
              type="email"
              value={draft.contact}
              onChange={(e) => draft.setContact(e.target.value)}
              maxLength={254}
            />
            <Label htmlFor="telegram">Вымышленный Telegram username</Label>
            <Input
              id="telegram"
              value={draft.telegram}
              onChange={(e) => draft.setTelegram(e.target.value)}
              maxLength={33}
            />
          </div>
          <div id="draft-questionnaire" data-draft-section="questionnaire">
            <Questionnaire
              value={draft.questionnaire}
              onChange={draft.setQuestionnaire}
              showRequiredErrors={errors}
              disabled={locked}
            />
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Согласен на сохранение введённых вымышленных данных в тестовой базе для проверки
              анкеты.
            </span>
          </label>
          <Button type="submit">{pending ? "Сохраняем…" : "Отправить анкету"}</Button>
        </fieldset>
      </form>
      {!availability.enabled && <p role="alert">TEST пока не настроен. Отправка недоступна.</p>}
      <p className="my-6 break-all" role="status">
        {message}
      </p>
      {saved && <Link to="/member">Посмотреть мой статус</Link>}
    </section>
  );
}
