import type { MembershipQuestionnaireReceipt } from "@/lib/questionnaire-persistence.server";

const LABELS = {
  pending: "На рассмотрении",
  approved: "Заявка одобрена",
  rejected: "Заявка отклонена",
} as const;

export type MembershipIntakeState =
  { ok: true; items: MembershipQuestionnaireReceipt[] } | { ok: false; reason: string };

/** General community intake. This component never grants event or staff access. */
export function MembershipIntakeStatus({
  state,
  demo = false,
}: {
  state: MembershipIntakeState;
  demo?: boolean;
}) {
  return (
    <section
      aria-labelledby="membership-intake-heading"
      className="border border-border bg-surface p-5 sm:p-8"
    >
      {demo && (
        <p className="mb-4 text-xs uppercase text-orange">Локальный макет · вымышленные данные</p>
      )}
      <p className="text-xs uppercase tracking-widest text-mint">Знакомство с ВНЕ</p>
      <h2 id="membership-intake-heading" className="mt-3 font-display text-2xl">
        Заявка на вступление
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Здесь хранится статус общей заявки. Участие в конкретном событии подтверждается отдельно.
      </p>
      {!state.ok ? (
        <p role="status" className="mt-6 text-sm text-orange">
          {state.reason === "signin"
            ? "Войдите в аккаунт, чтобы увидеть свою заявку."
            : "Не удалось загрузить статус. Это не означает, что заявки нет. Попробуйте позже."}
        </p>
      ) : state.items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Сохранённых заявок пока нет. Анкету можно заполнить на странице заявки.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {state.items.map((item) => (
            <li key={item.requestId} className="border-t border-border pt-5">
              <p className="font-display text-lg text-mint">{LABELS[item.status]}</p>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Номер заявки</dt>
                  <dd className="mt-1 break-all">{item.requestId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Анкета</dt>
                  <dd className="mt-1">
                    Все ответы сохранены · версия {item.questionnaireVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Отправлена</dt>
                  <dd className="mt-1">
                    {new Date(item.createdAt).toLocaleDateString("ru-RU", { timeZone: "UTC" })}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Тестовая среда: используйте только вымышленные данные. Сохранение анкеты не выдаёт пропуск и
        не открывает оплату.
      </p>
    </section>
  );
}
