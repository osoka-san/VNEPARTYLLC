import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { TicketStage } from "./PassView";
import { makeDemoPass, PASS_ACCESS, TICKET_DESIGNS } from "./ticket-designs";
import type { PassAccess, PassDTO } from "./types";
import { engineForPattern, type TemplateId } from "@/lib/qr-studio/pattern";
import { getQrTemplate, QR_STUDIO_TEMPLATES, isStudioTemplate } from "@/lib/qr-studio/catalog";
import {
  loadPreviewDraft,
  savePreviewDraft,
  type PreviewDraft,
} from "@/lib/qr-studio/ticket-preview";
import "@/styles/tickets/workspace.css";
import "../qr-studio/studio.css";
import { passQrPalette, passTemplateImage } from "@/lib/qr-studio/pass-palette";
export function TicketDesignPreview({
  template,
  draft,
  initialAccess,
}: {
  template?: TemplateId | undefined;
  draft?: string | undefined;
  initialAccess?: PassAccess | undefined;
}) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<PreviewDraft>(() => ({
    schema: 1,
    pattern: { ...(getQrTemplate(template) ?? QR_STUDIO_TEMPLATES[0]!).pattern },
    engineVersion: engineForPattern((getQrTemplate(template) ?? QR_STUDIO_TEMPLATES[0]!).pattern),
    text: "на удачу",
    createdAt: 0,
  }));
  const [loading, setLoading] = useState(!!draft),
    [error, setError] = useState("");
  const [access, setAccess] = useState<PassAccess>(initialAccess ?? "GENERAL"),
    [name, setName] = useState("Имя гостя"),
    [event, setEvent] = useState("");
  const [flipped, setFlipped] = useState(true);
  const [status, setStatus] = useState<"building" | "verified" | "fallback">("building");
  useSiteLoading(loading, "Готовим макет пропуска");
  useEffect(() => {
    if (initialAccess) setAccess(initialAccess);
  }, [initialAccess]);
  useEffect(() => {
    setError("");
    setFlipped(true);
    setLoading(!!draft);
    if (draft) {
      try {
        const saved = loadPreviewDraft(draft);
        setCurrent(saved);
        setEvent(saved.pattern.event);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Макет не найден.");
      } finally {
        setLoading(false);
      }
    } else
      setCurrent({
        schema: 1,
        pattern: { ...(getQrTemplate(template) ?? QR_STUDIO_TEMPLATES[0]!).pattern },
        engineVersion: engineForPattern(
          (getQrTemplate(template) ?? QR_STUDIO_TEMPLATES[0]!).pattern,
        ),
        text: "на удачу",
        createdAt: 0,
      });
  }, [template, draft]);
  const selected = getQrTemplate(current.pattern.template);
  const pass = useMemo<PassDTO>(
    () => ({
      ...makeDemoPass(access),
      name: name || "Имя гостя",
      event: { ...makeDemoPass(access).event, title: event || "ВНЕ / ДЛЯ СВОИХ" },
      qrText: current.text,
      design: { engineVersion: current.engineVersion, pattern: current.pattern },
    }),
    [access, name, event, current],
  );
  async function edit() {
    try {
      const id = savePreviewDraft(
        { ...current.pattern, event },
        current.text,
        current.engineVersion,
      );
      await navigate({
        to: "/admin/qr-studio",
        search: { draft: id, template: current.pattern.template, view: undefined, access },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть редактор.");
    }
  }
  return (
    <div className="qr-studio qs-card-preview">
      <div className="qs-library-heading">
        <div>
          <h2>{current.pattern.name} · на карточке</h2>
          <p>
            QR автоматически согласован с цветом и размером выбранного пропуска. Просмотр не
            выпускает билет.
          </p>
        </div>
        <Link
          to="/admin/tickets"
          search={{ view: undefined, template: undefined, draft: undefined }}
          className="tw-button"
        >
          Управление билетами
        </Link>
      </div>
      {(!isStudioTemplate(current.pattern.template) ||
        current.engineVersion !== engineForPattern(current.pattern)) && (
        <p className="qs-hint">
          Архивное оформление показано с сохранённым движком. Выбор другого стиля создаст новый
          макет; существующий QR не меняется.
        </p>
      )}
      {error && (
        <p className="qs-notice" role="alert">
          {error}
        </p>
      )}
      <div className="qs-card-preview-grid">
        <section className="qs-card-settings">
          <label htmlFor="card-template">Макет QR</label>
          <select
            id="card-template"
            value={selected?.id ?? ""}
            onChange={(e) => {
              const next = getQrTemplate(e.target.value);
              if (next) {
                const nextPattern = { ...next.pattern, event };
                setCurrent((v) => ({
                  ...v,
                  pattern: nextPattern,
                  engineVersion: engineForPattern(nextPattern),
                }));
                setFlipped(true);
                try {
                  const id = savePreviewDraft(nextPattern, current.text);
                  void navigate({
                    to: "/admin/tickets",
                    search: { view: "preview", template: next.id, draft: id, access },
                    replace: true,
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Не удалось сохранить выбор.");
                }
              }
            }}
          >
            {!isStudioTemplate(current.pattern.template) && (
              <option value={current.pattern.template ?? ""} disabled>
                Архивный стиль · {current.pattern.name}
              </option>
            )}
            {QR_STUDIO_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selected && (
            <figure className="qs-card-reference">
              <img
                src={passTemplateImage(selected.id, access, current.engineVersion)}
                alt={`${selected.name} · палитра ${access}`}
                loading="lazy"
                decoding="async"
              />
              <figcaption>{passQrPalette(access).label} · образец рисунка</figcaption>
            </figure>
          )}
          <label htmlFor="card-access">Тип карточки</label>
          <select
            id="card-access"
            value={access}
            onChange={(e) => {
              const next = e.target.value as PassAccess;
              setAccess(next);
              void navigate({
                to: "/admin/tickets",
                search: { view: "preview", template, draft, access: next },
                replace: true,
              });
            }}
          >
            {PASS_ACCESS.map((value) => (
              <option key={value} value={value}>
                {TICKET_DESIGNS[value].label}
              </option>
            ))}
          </select>
          <p className="qs-hint">
            {TICKET_DESIGNS[access].description} Палитра применяется и к увеличенному QR. Защитное
            поле вокруг кода сохраняется.
          </p>
          <label htmlFor="card-name">Имя на макете</label>
          <input
            id="card-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="card-event">Мероприятие на макете</label>
          <input
            id="card-event"
            value={event}
            placeholder="ВНЕ / ДЛЯ СВОИХ"
            maxLength={100}
            onChange={(e) => setEvent(e.target.value)}
          />
          <p className="qs-hint">
            В QR: <span className="qs-preview-payload">{current.text}</span>
          </p>
          <div className="qs-actions">
            <button type="button" className="tw-button" onClick={() => void edit()}>
              Изменить QR в студии
            </button>
            <Link
              to="/admin/qr-studio"
              search={{ view: undefined, template: undefined, draft: undefined, access }}
              className="tw-button"
            >
              Все макеты
            </Link>
          </div>
        </section>
        <section className="qs-card-stage" aria-label="Карточка с выбранным QR">
          <div className="qs-segment" role="group" aria-label="Сторона карточки">
            <button type="button" aria-pressed={flipped} onClick={() => setFlipped(true)}>
              QR-сторона
            </button>
            <button type="button" aria-pressed={!flipped} onClick={() => setFlipped(false)}>
              Лицевая сторона
            </button>
          </div>
          {loading ? (
            <div role="status" className="qs-empty">
              Открываем макет…
            </div>
          ) : (
            <TicketStage
              pass={pass}
              flipped={flipped}
              paused
              compact
              onFlip={() => setFlipped((v) => !v)}
              onQrStatus={setStatus}
            />
          )}
          <p role="status" className="qs-card-status">
            {loading || status === "building"
              ? "Строим и проверяем выбранный QR…"
              : status === "verified"
                ? "Выбранный QR готов · проверка чтения пройдена"
                : "Художественный QR не прошёл проверку. На карточке показан обычный код с тем же содержимым."}
          </p>
        </section>
      </div>
    </div>
  );
}
