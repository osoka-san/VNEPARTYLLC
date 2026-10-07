import { useSiteLoadingAction } from "@/components/loading/SiteLoading";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageShell } from "@/components/app/PageShell";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import {
  TIMEZONES,
  formatInZone,
  formatMoney,
  parseMajorToMinor,
  utcToZonedInput,
  zonedInputToUtc,
} from "@/lib/orders";
import {
  eventTransition,
  listAdminEvents,
  saveEvent,
  savePrivateDetails,
  saveTier,
  type AdminEvent,
} from "@/lib/orders.functions";
import { DraftsPanel } from "@/components/admin/WorkspacePanels";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/admin_/events")({
  headers: privateRouteHeaders,
  head: () => pageMeta("События — управление ВНЕ", "Управление мероприятиями (sandbox).", true),
  loader: async () => {
    const decision = enforceStaff(
      (await getStaffAccess({ data: { area: "admin" } })).decision,
      "/admin",
    );
    if (decision !== "allowed") return { decision, list: null };
    return { decision, list: await listAdminEvents() };
  },
  component: EventsPage,
});

const DATE_FIELDS = [
  ["starts_at", "Начало"],
  ["sales_close_at", "Окончание продаж"],
  ["qr_release_at", "Выдача QR"],
  ["address_reveal_at", "Раскрытие адреса"],
  ["entry_opens_at", "Вход открывается"],
  ["entry_closes_at", "Вход закрывается"],
] as const;

const STATUS_RU = { draft: "Черновик", published: "Опубликовано", archived: "Архив" } as const;

function EventsPage() {
  const { decision, list } = Route.useLoaderData();
  const [editing, setEditing] = useState<AdminEvent | "new" | null>(null);
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / события" />;
  if (decision === "unconfigured")
    return (
      <PageShell
        eyebrow="ВНЕ / управление"
        title="Мероприятия"
        intro="Подготовка событий и рабочих материалов."
        density="compact"
      >
        <section className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 lg:px-12">
          <DraftsPanel kind="event" />
        </section>
      </PageShell>
    );
  if (!list?.ok)
    return (
      <PageShell
        eyebrow="ВНЕ / события"
        title="Недоступно"
        intro={
          list?.reason === "denied"
            ? "Управление событиями — только администраторы."
            : "Список не загрузился."
        }
        density="compact"
      >
        <div className="h-10" />
      </PageShell>
    );
  return (
    <PageShell
      eyebrow="ВНЕ / события"
      title="Мероприятия"
      intro="Черновик, публикация анонса, продажи и архив. Публикация и продажа — разные настройки. Sandbox: реальные платежи не проводятся."
      density="compact"
    >
      <div className="mx-auto max-w-[1376px] space-y-6 px-5 py-10 sm:px-8 lg:px-12">
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" onClick={() => setEditing("new")}>
            Новое событие
          </Button>
          <Link
            to="/admin/orders"
            className="inline-flex min-h-11 items-center px-3 text-blue underline"
          >
            Заказы
          </Link>
          <Link
            to="/admin"
            className="inline-flex min-h-11 items-center px-3 text-muted-foreground underline"
          >
            Назад
          </Link>
        </div>
        {editing && (
          <EventEditor ev={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
        <ul className="space-y-4">
          {list.items.map((e) => (
            <EventRow key={e.id} ev={e} onEdit={() => setEditing(e)} />
          ))}
        </ul>
      </div>
    </PageShell>
  );
}

function EventRow({ ev, onEdit }: { ev: AdminEvent; onEdit: () => void }) {
  const router = useRouter();
  const transition = useSiteLoadingAction(useServerFn(eventTransition), "Обновляем событие");
  const [msg, setMsg] = useState("");
  const act = async (action: string) => {
    if (
      action === "cancel" &&
      !window.confirm("Отменить событие? Резервы будут сняты, оплаченные заказы уйдут на проверку.")
    )
      return;
    const r = await transition({ data: { id: ev.id, action, version: ev.version } }).catch(
      () => null,
    );
    setMsg(!r ? "Сеть недоступна." : r.ok ? "Готово." : r.message);
    await router.invalidate();
  };
  return (
    <li className="border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display uppercase">
          {ev.title} {ev.isSynthetic && <span className="text-xs text-blue">· тест</span>}
        </p>
        <span className="text-sm text-mint">
          {STATUS_RU[ev.status]} · {ev.salesOpen ? "продажи открыты" : "продажи закрыты"}
          {ev.cancelledAt ? " · отменено" : ""}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        /{ev.slug} · {formatInZone(ev.startsAt, ev.timezone)} ({ev.timezone}) · мест {ev.seatsTaken}
        /{ev.capacity ?? "—"} · резерв {ev.reserveTtlMinutes} мин
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Тарифы:{" "}
        {ev.tiers.length
          ? ev.tiers
              .map(
                (t) =>
                  `${t.name} ${formatMoney(t.amountMinor, t.currency)}${t.active ? "" : " (выкл.)"}`,
              )
              .join(", ")
          : "нет"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={onEdit}>
          Изменить
        </Button>
        {ev.status === "draft" && (
          <Button variant="outline" className="min-h-11" onClick={() => void act("publish")}>
            Опубликовать анонс
          </Button>
        )}
        {ev.status === "published" && (
          <Button variant="outline" className="min-h-11" onClick={() => void act("unpublish")}>
            В черновик
          </Button>
        )}
        {ev.status === "published" && !ev.salesOpen && !ev.cancelledAt && (
          <Button variant="outline" className="min-h-11" onClick={() => void act("open_sales")}>
            Открыть продажи
          </Button>
        )}
        {ev.salesOpen && (
          <Button variant="outline" className="min-h-11" onClick={() => void act("close_sales")}>
            Закрыть продажи
          </Button>
        )}
        {!ev.cancelledAt && (
          <Button variant="outline" className="min-h-11" onClick={() => void act("cancel")}>
            Отменить (sandbox)
          </Button>
        )}
        {ev.status !== "archived" && (
          <Button variant="outline" className="min-h-11" onClick={() => void act("archive")}>
            В архив
          </Button>
        )}
      </div>
      {msg && (
        <p role="status" className="mt-3 text-sm">
          {msg}
        </p>
      )}
      <TierEditor ev={ev} />
      <PrivateEditor ev={ev} />
    </li>
  );
}

function EventEditor({ ev, onDone }: { ev: AdminEvent | null; onDone: () => void }) {
  const router = useRouter();
  const save = useSiteLoadingAction(useServerFn(saveEvent), "Сохраняем событие");
  const [tz, setTz] = useState(ev?.timezone ?? "Europe/Moscow");
  const [msg, setMsg] = useState("");
  const initial = (k: (typeof DATE_FIELDS)[number][0]) => {
    const map = {
      starts_at: ev?.startsAt,
      sales_close_at: ev?.salesCloseAt,
      qr_release_at: ev?.qrReleaseAt,
      address_reveal_at: ev?.addressRevealAt,
      entry_opens_at: ev?.entryOpensAt,
      entry_closes_at: ev?.entryClosesAt,
    };
    return utcToZonedInput(map[k] ?? null, tz);
  };
  async function onSubmit(fd: FormData) {
    const form: Record<string, unknown> = {
      slug: String(fd.get("slug") ?? ""),
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      timezone: tz,
      capacity: String(fd.get("capacity") ?? "") === "" ? null : Number(fd.get("capacity")),
      reserve_ttl_minutes: Number(fd.get("reserve_ttl_minutes") ?? 15),
      is_synthetic: fd.get("is_synthetic") === "on",
    };
    for (const [k] of DATE_FIELDS) {
      const v = String(fd.get(k) ?? "");
      form[k] = v ? zonedInputToUtc(v, tz) : null;
    }
    const r = await save({ data: { id: ev?.id ?? null, version: ev?.version ?? 0, form } }).catch(
      () => null,
    );
    if (!r) return setMsg("Сеть недоступна.");
    if (!r.ok) return setMsg(r.message);
    await router.invalidate();
    onDone();
  }
  return (
    <form
      action={(fd) => void onSubmit(fd)}
      className="grid gap-4 border border-border p-5 sm:grid-cols-2"
      aria-label="Редактор события"
    >
      <label className="text-sm">
        Название
        <Input name="title" required defaultValue={ev?.title ?? ""} className="mt-1" />
      </label>
      <label className="text-sm">
        Slug
        <Input
          name="slug"
          required
          pattern="[a-z0-9-]{2,80}"
          defaultValue={ev?.slug ?? ""}
          className="mt-1"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Публичное описание (без адреса)
        <textarea
          name="description"
          defaultValue={ev?.description ?? ""}
          className="mt-1 min-h-24 w-full border border-border bg-surface p-2"
        />
      </label>
      <label className="text-sm">
        Часовой пояс
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="mt-1 min-h-11 w-full border border-border bg-surface px-2"
        >
          {TIMEZONES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Вместимость
        <Input
          name="capacity"
          type="number"
          min={1}
          max={100000}
          defaultValue={ev?.capacity ?? ""}
          className="mt-1"
        />
      </label>
      <label className="text-sm">
        Срок резерва, мин
        <Input
          name="reserve_ttl_minutes"
          type="number"
          min={5}
          max={240}
          defaultValue={ev?.reserveTtlMinutes ?? 15}
          className="mt-1"
        />
      </label>
      {DATE_FIELDS.map(([k, label]) => (
        <label key={`${k}-${tz}`} className="text-sm">
          {label} ({tz})
          <Input name={k} type="datetime-local" defaultValue={initial(k)} className="mt-1" />
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_synthetic" defaultChecked={ev?.isSynthetic ?? true} />{" "}
        Тестовое (вымышленное) событие
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" className="min-h-11">
          Сохранить
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>
          Отмена
        </Button>
      </div>
      {msg && (
        <p role="alert" className="text-sm text-accent sm:col-span-2">
          {msg}
        </p>
      )}
    </form>
  );
}

function TierEditor({ ev }: { ev: AdminEvent }) {
  const router = useRouter();
  const save = useSiteLoadingAction(useServerFn(saveTier), "Сохраняем тариф");
  const [msg, setMsg] = useState("");
  async function onSubmit(fd: FormData) {
    const amount = parseMajorToMinor(String(fd.get("amount") ?? ""));
    if (amount === null) return setMsg("Сумма: число, до 2 знаков после точки.");
    const r = await save({
      data: {
        eventId: ev.id,
        tierId: null,
        name: String(fd.get("name") ?? ""),
        amountMinor: amount,
        currency: String(fd.get("currency") ?? ""),
        active: true,
      },
    }).catch(() => null);
    setMsg(
      !r
        ? "Сеть недоступна."
        : r.ok
          ? "Тариф добавлен. Уже созданные заказы сохраняют свою сумму."
          : r.message,
    );
    await router.invalidate();
  }
  return (
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-blue">Добавить тариф</summary>
      <form action={(fd) => void onSubmit(fd)} className="mt-2 flex flex-wrap gap-2">
        <Input name="name" placeholder="Название" required className="w-40" />
        <Input name="amount" placeholder="Сумма, напр. 2500.00" required className="w-44" />
        <Input
          name="currency"
          placeholder="Валюта (ISO)"
          required
          pattern="[A-Za-z]{3}"
          className="w-32"
        />
        <Button type="submit" variant="outline" className="min-h-11">
          Добавить
        </Button>
      </form>
      {msg && (
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
      )}
    </details>
  );
}

function PrivateEditor({ ev }: { ev: AdminEvent }) {
  const save = useSiteLoadingAction(
    useServerFn(savePrivateDetails),
    "Сохраняем информацию о событии",
  );
  const [msg, setMsg] = useState("");
  async function onSubmit(fd: FormData) {
    const r = await save({
      data: {
        eventId: ev.id,
        address: String(fd.get("address") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      },
    }).catch(() => null);
    setMsg(!r ? "Сеть недоступна." : r.ok ? "Сохранено." : r.message);
  }
  return (
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-blue">
        Закрытый адрес и служебные инструкции
      </summary>
      <p className="text-xs text-muted-foreground">
        Не попадает в публичные страницы и общий API. Для тестов — только вымышленная площадка.
      </p>
      <form action={(fd) => void onSubmit(fd)} className="mt-2 grid gap-2">
        <Input name="address" defaultValue={ev.venueAddress} placeholder="Адрес (вымышленный)" />
        <textarea
          name="notes"
          defaultValue={ev.staffNotes}
          placeholder="Инструкции команде"
          className="min-h-20 border border-border bg-surface p-2"
        />
        <Button type="submit" variant="outline" className="min-h-11 w-fit">
          Сохранить
        </Button>
      </form>
      {msg && (
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
      )}
    </details>
  );
}
