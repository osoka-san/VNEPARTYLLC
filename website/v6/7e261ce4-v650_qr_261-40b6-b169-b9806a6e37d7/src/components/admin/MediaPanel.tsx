import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  EDITORIAL_LIBRARY,
  GALLERY_LIBRARY,
  MEDIA_SLOTS,
  previewUrl,
  type MediaChoice,
  type MediaOverrides,
  type MediaSlot,
} from "@/lib/media-library";
import { getMediaOverrides, saveMediaSlot, uploadMediaFile } from "@/lib/media.functions";

const PART_LABEL: Record<string, string> = {
  desktop: "Десктоп",
  mobile: "Телефон",
  image: "Изображение",
};

export function MediaPanel() {
  const load = useServerFn(getMediaOverrides);
  const [data, setData] = useState<MediaOverrides | null>(null);
  const [active, setActive] = useState<string>(MEDIA_SLOTS[0]!.key);
  useEffect(() => {
    load().then(setData, () => setData({}));
  }, [load]);
  const slot = MEDIA_SLOTS.find((s) => s.key === active)!;

  return (
    <section aria-labelledby="media-title" className="mt-14">
      <h2 id="media-title" className="font-display text-lg">
        Изображения разделов
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Выберите утверждённое изображение из библиотеки или загрузите своё. Своё изображение
        показывается как есть, одним файлом: лучше загружать AVIF или WebP до 8 МБ, для десктопа
        около 1672×941, для телефона около 941×1672.
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <ul className="divide-y divide-border border-y border-border">
          {MEDIA_SLOTS.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={s.key === active}
                className={`flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-sm ${
                  s.key === active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
                <span className="text-xs">{data?.[s.key] ? "Заменено" : "Утверждённое"}</span>
              </button>
            </li>
          ))}
        </ul>
        {data ? (
          <SlotEditor
            key={slot.key}
            slot={slot}
            value={(data[slot.key] ?? {}) as Record<string, MediaChoice>}
            onSaved={(v) => setData({ ...data, [slot.key]: v })}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        )}
      </div>
    </section>
  );
}

function SlotEditor({
  slot,
  value,
  onSaved,
}: {
  slot: MediaSlot;
  value: Record<string, MediaChoice>;
  onSaved: (v: Record<string, MediaChoice>) => void;
}) {
  const router = useRouter();
  const save = useServerFn(saveMediaSlot);
  const upload = useServerFn(uploadMediaFile);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const parts = slot.kind === "gallery" ? (["desktop", "mobile"] as const) : (["image"] as const);

  const options = (part: string) =>
    slot.kind === "gallery"
      ? GALLERY_LIBRARY[part as "desktop" | "mobile"]
      : EDITORIAL_LIBRARY.map((x) => ({ id: x.id, label: x.label }));

  async function onFile(part: string, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    const r = await upload({ data: fd }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg(r?.message ?? "Не удалось загрузить файл.");
    setDraft({ ...draft, [part]: { upload: r.path } });
    setMsg("Файл загружен. Нажмите «Сохранить», чтобы показать его на сайте.");
  }

  async function submit(next: Record<string, MediaChoice>) {
    setBusy(true);
    setMsg(null);
    const r = await save({ data: { slot: slot.key, value: next } }).catch(() => null);
    setBusy(false);
    setMsg(r?.message ?? "Не удалось сохранить.");
    if (r?.ok) {
      setDraft(next);
      onSaved(next);
      router.invalidate();
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-display text-base">{slot.label}</h3>
      {parts.map((part) => {
        const c = draft[part];
        return (
          <div key={part} className="border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{PART_LABEL[part]}</p>
            <img
              src={previewUrl(slot, part, c)}
              alt=""
              className={`mt-3 w-full bg-background object-cover ${
                part === "mobile" ? "aspect-[9/16] max-w-44" : "aspect-video"
              }`}
            />
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                Из библиотеки
                <select
                  value={c?.lib ?? (c?.upload ? "__upload" : "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...draft };
                    if (!v) delete next[part];
                    else if (v !== "__upload") next[part] = { lib: v };
                    setDraft(next);
                  }}
                  className="min-h-11 border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Утверждённое (по умолчанию)</option>
                  {options(part).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                  {c?.upload && <option value="__upload">Загруженный файл</option>}
                </select>
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center border border-border px-4 text-sm">
                Загрузить файл
                <input
                  type="file"
                  accept="image/avif,image/webp,image/jpeg,image/png"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => onFile(part, e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => submit(draft)}>
          Сохранить
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => submit({})}>
          Вернуть утверждённое
        </Button>
      </div>
      {msg && (
        <p role="status" className="text-sm text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
