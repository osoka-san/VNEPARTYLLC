import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listSections, saveSection, type SectionDto } from "@/lib/sections.functions";

const statusLabel = { draft: "Черновик", published: "Опубликовано", default: "Текст по умолчанию" };

export function SectionsPanel() {
  const load = useServerFn(listSections);
  const save = useServerFn(saveSection);
  const [sections, setSections] = useState<SectionDto[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const r = await load().catch(() => ({ ok: false as const, sections: [] }));
    setSections(r.sections);
  }, [load]);
  useEffect(() => void refresh(), [refresh]);

  const open = (s: SectionDto) => {
    setActive(s.key);
    setTitle(s.title);
    setBody(s.body);
    setMessage("");
  };
  const submit = async (publish: boolean) => {
    if (!active) return;
    setBusy(true);
    const r = await save({ data: { key: active, title, body, publish } }).catch(() => ({
      message: "Сервис не ответил.",
    }));
    setMessage(r.message);
    setBusy(false);
    await refresh();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <ul className="divide-y divide-border border-y border-border">
        <li className="py-3 text-sm text-muted-foreground">
          Карточки мероприятий (название, описание, даты, цены):{" "}
          <Link to="/admin/events" className="text-blue underline">
            Мероприятия →
          </Link>
        </li>
        {sections.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => open(s)}
              aria-current={active === s.key}
              className="w-full py-4 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[current=true]:text-mint"
            >
              <span className="block text-xs uppercase text-muted-foreground">{s.area}</span>
              <span className="mt-1 block font-display text-lg">{s.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {statusLabel[s.status]}
                {s.updatedAt && ` · ${new Date(s.updatedAt).toLocaleString("ru-RU")}`}
              </span>
            </button>
          </li>
        ))}
        {!sections.length && <li className="py-6 text-sm text-muted-foreground">Загружаем…</li>}
      </ul>
      {active ? (
        <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), void submit(false))}>
          <div>
            <Label htmlFor="section-title">Заголовок</Label>
            <Input
              id="section-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 h-11"
            />
          </div>
          <div>
            <Label htmlFor="section-body">Текст</Label>
            <Textarea
              id="section-body"
              value={body}
              maxLength={4000}
              rows={8}
              onChange={(e) => setBody(e.target.value)}
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">{body.length} / 4000</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="outline" className="min-h-11" disabled={busy}>
              Сохранить черновик
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              Опубликовать
            </Button>
          </div>
          <p role="status" className="min-h-6 text-sm text-mint">
            {message}
          </p>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Выберите раздел слева, чтобы изменить текст.
        </p>
      )}
    </div>
  );
}
