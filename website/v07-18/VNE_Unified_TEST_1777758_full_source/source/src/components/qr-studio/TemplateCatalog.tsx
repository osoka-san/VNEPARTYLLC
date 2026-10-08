import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { QR_TEMPLATES, templateImage, type QrTemplate } from "@/lib/qr-studio/catalog";
import {
  PASS_QR_PALETTES,
  PASS_TEMPLATE_NOTES,
  passTemplateImage,
} from "@/lib/qr-studio/pass-palette";
import { PASS_ACCESS, TICKET_DESIGNS } from "@/components/tickets/ticket-designs";
import type { PassAccess } from "@/components/tickets/types";
export function TemplateCatalog({
  onSelect,
  onPreview,
  selected,
  passAccess,
  onPassAccessChange,
}: {
  selected?: string | undefined;
  onSelect: (t: QrTemplate) => void;
  onPreview: (t: QrTemplate) => void;
  passAccess: PassAccess;
  onPassAccessChange: (access: PassAccess) => void;
}) {
  const [collection, setCollection] = useState("all");
  const [mode, setMode] = useState<"reference" | "working">("working");
  const [query, setQuery] = useState("");
  const palette = PASS_QR_PALETTES[passAccess];
  const items = QR_TEMPLATES.filter(
    (t) =>
      (collection === "all" || t.collection === collection) &&
      (t.name + " " + t.description).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="qs-catalog">
      <div className="qs-library-heading">
        <div>
          <h2>Коллекция макетов</h2>
          <p>
            16 стилей для четырёх типов пропуска. Сначала выберите карту — цвета всех макетов
            подстроятся под неё.
          </p>
        </div>
        <span className="qs-catalog-count">{String(items.length).padStart(2, "0")} / 16</span>
      </div>
      <div className="qs-pass-types" role="group" aria-label="Палитра типа пропуска">
        {PASS_ACCESS.map((access) => (
          <button
            type="button"
            key={access}
            aria-pressed={passAccess === access}
            onClick={() => onPassAccessChange(access)}
          >
            <span
              className="qs-pass-dot"
              style={{ background: TICKET_DESIGNS[access].accent }}
              aria-hidden="true"
            />
            <span>
              {TICKET_DESIGNS[access].short}
              <small>{PASS_QR_PALETTES[access].label}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="qs-catalog-tools">
        <div className="qs-segment" role="group" aria-label="Коллекция">
          {[
            ["all", "Все · 16"],
            ["graphic", "Графика · 6"],
            ["material", "Фактуры · 10"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={collection === id}
              onClick={() => setCollection(id!)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="qs-segment" role="group" aria-label="Изображения макетов">
          {(["reference", "working"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "reference" ? "Референсы" : "В цветах пропуска"}
            </button>
          ))}
        </div>
      </div>
      <label className="qs-catalog-search">
        <span className="sr-only">Найти стиль QR</span>
        <input
          type="search"
          placeholder="Найти стиль: порталы, мрамор, изгибы…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="qs-hint">
        {mode === "reference"
          ? "Исходные художественные образцы. На карточке используется рабочий QR в выбранном стиле."
          : `${TICKET_DESIGNS[passAccess].label} · ${palette.label}. Образцы с текстом «на удачу»; на пропуске рисунок строится из его собственного QR.`}
      </p>
      <div className="qs-catalog-grid">
        {items.map((t) => (
          <article
            className={"qs-template" + (selected === t.id ? " is-selected" : "")}
            key={t.id}
            data-template={t.id}
          >
            <button
              type="button"
              className="qs-template-image"
              onClick={() => onSelect(t)}
              aria-label={`Выбрать стиль ${t.name}`}
              data-pass-type={passAccess}
              style={
                {
                  "--pass-qr-paper": palette.bg,
                  "--pass-qr-ink": palette.fg,
                  "--pass-qr-accent": TICKET_DESIGNS[passAccess].accent,
                } as CSSProperties
              }
            >
              <span className={mode === "working" ? "qs-template-fit" : "qs-template-reference"}>
                {mode === "working" && (
                  <span className="qs-fit-top">
                    <span>ВНЕ</span>
                    <span>{TICKET_DESIGNS[passAccess].short}</span>
                  </span>
                )}
                <img
                  src={
                    mode === "working"
                      ? passTemplateImage(t.id, passAccess)
                      : templateImage(t.id, mode)
                  }
                  width="680"
                  height="680"
                  alt={`${t.name} · ${mode === "reference" ? "референс" : TICKET_DESIGNS[passAccess].label}`}
                  loading="lazy"
                  decoding="async"
                />
                {mode === "working" && (
                  <span className="qs-fit-caption">ОБРАЗЕЦ / НЕ ДЛЯ ВХОДА</span>
                )}
              </span>
            </button>
            <div className="qs-template-body">
              <div className="qs-template-title">
                <img
                  className="qs-title-thumb"
                  src={passTemplateImage(t.id, passAccess)}
                  alt=""
                  width="40"
                  height="40"
                  loading="lazy"
                />
                <div>
                  <span>
                    {t.collection === "graphic" ? "Г" : "Ф"} / {t.number}
                  </span>
                  <h3>{t.name}</h3>
                </div>
              </div>
              <p>{mode === "reference" ? t.description : PASS_TEMPLATE_NOTES[t.id]}</p>
              <div className="qs-actions">
                <Button variant="outline" onClick={() => onSelect(t)}>
                  Настроить
                </Button>
                <Button onClick={() => onPreview(t)}>На карточке</Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {items.length === 0 && (
        <p className="qs-hint" role="status">
          Такого стиля пока нет. Попробуйте другое название.
        </p>
      )}
    </section>
  );
}
