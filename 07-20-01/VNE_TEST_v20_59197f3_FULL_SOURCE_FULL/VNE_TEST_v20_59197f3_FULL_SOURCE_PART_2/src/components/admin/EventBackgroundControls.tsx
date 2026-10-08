import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { publicEvents } from "@/content/site-content";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { DigitalRain } from "@/components/motion/EventBackground";
import {
  eventBackgroundDefault,
  eventBackgroundFor,
  type EventBackgroundSettings,
} from "@/lib/event-backgrounds";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import "./event-background-controls.css";

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const display = `${Number(value.toFixed(2))}${suffix}`;
  return (
    <div className="eb-control">
      <div className="eb-control-heading">
        <span id={id}>{label}</span>
        <output>{display}</output>
      </div>
      <Slider
        thumbLabelledBy={id}
        thumbValueText={display}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next ?? value)}
      />
    </div>
  );
}

export function EventBackgroundControls() {
  const { settings, updateSettings, reduced } = useMotionEnv();
  const [slug, setSlug] = useState(publicEvents[0]!.slug);
  const [message, setMessage] = useState("");
  const event = publicEvents.find((item) => item.slug === slug) ?? publicEvents[0]!;
  const config = eventBackgroundFor(settings.eventBackgrounds, event.slug);
  const id = useId();
  const update = (patch: Partial<EventBackgroundSettings>) => {
    updateSettings({
      eventBackgrounds: { ...settings.eventBackgrounds, [event.slug]: { ...config, ...patch } },
    });
    setMessage("");
  };
  return (
    <section
      id="event-backgrounds"
      className="eb-panel order-first lg:col-span-12"
      aria-labelledby={`${id}-title`}
      data-admin-static="true"
    >
      <div className="eb-heading">
        <div>
          <p className="eb-kicker">СОБЫТИЯ / АТМОСФЕРА</p>
          <h3 id={`${id}-title`}>Фоны событий</h3>
        </div>
        <span className="eb-type">Цифровой дождь</span>
      </div>
      <p className="eb-description">
        У каждого события — своя палитра и свой ритм. Изменения сразу видны здесь и на странице
        выбранного события.
      </p>
      <div className="eb-events" role="group" aria-label="Событие для настройки фона">
        {publicEvents.map((item, i) => {
          const palette = eventBackgroundFor(settings.eventBackgrounds, item.slug);
          return (
            <button
              type="button"
              key={item.slug}
              aria-pressed={event.slug === item.slug}
              onClick={() => {
                setSlug(item.slug);
                setMessage("");
              }}
            >
              <span className="eb-event-number">{String(i + 1).padStart(2, "0")}</span>
              <span className="eb-event-title">{item.title}</span>
              <span
                className="eb-swatch"
                style={{ background: palette.color }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <div className="eb-layout">
        <div className="eb-preview-column">
          <div className="eb-preview" aria-label={`Превью фона: ${event.title}`}>
            <DigitalRain slug={event.slug} config={config} compact />
            <div className="eb-preview-state">
              {!config.enabled
                ? "ФОН ВЫКЛЮЧЕН"
                : reduced || !config.animated
                  ? "СТАТИЧНЫЙ ФОН"
                  : "ЖИВОЕ ПРЕВЬЮ"}
            </div>
            <div className="eb-preview-copy">
              <span>ВНЕ / СОБЫТИЕ</span>
              <h4>{event.title}</h4>
              <p>{event.format}</p>
            </div>
            <div className="eb-preview-footer">
              <span>Демо / не анонс</span>
              <span>{config.speed.toFixed(2)}×</span>
            </div>
          </div>
          <Link to="/events/$slug" params={{ slug: event.slug }} className="eb-open">
            Открыть страницу события <ArrowUpRight size={16} />
          </Link>
          <p className="eb-note">
            {reduced
              ? "Уменьшение движения включено: показываем статичную композицию."
              : "В уменьшенном движении композиция становится статичной. На мобильном экране поток менее плотный."}
          </p>
        </div>
        <div className="eb-settings">
          <div className="eb-toggles">
            <label htmlFor={`${id}-enabled`}>
              Показывать фон
              <Switch
                id={`${id}-enabled`}
                checked={config.enabled}
                onCheckedChange={(enabled) => update({ enabled })}
              />
            </label>
            <label htmlFor={`${id}-animated`}>
              Анимировать
              <Switch
                id={`${id}-animated`}
                checked={config.animated}
                onCheckedChange={(animated) => update({ animated })}
              />
            </label>
          </div>
          <fieldset className="eb-fields" disabled={!config.enabled}>
            <legend className="sr-only">Параметры фона события {event.title}</legend>
            <div className="eb-colors">
              {(
                [
                  { key: "color", label: "Символы" },
                  { key: "highlight", label: "Свет" },
                  { key: "background", label: "Подложка" },
                ] as const
              ).map(({ key, label }) => (
                <label key={key}>
                  <span>{label}</span>
                  <span className="eb-color-value">
                    <input
                      type="color"
                      aria-label={`${label}: цвет фона события`}
                      value={config[key]}
                      onChange={(e) => update({ [key]: e.target.value })}
                    />
                    <code>{config[key].toUpperCase()}</code>
                  </span>
                </label>
              ))}
            </div>
            <div className="eb-ranges">
              <Range
                label="Скорость"
                value={config.speed}
                min={0.25}
                max={2}
                step={0.05}
                suffix="×"
                onChange={(speed) => update({ speed })}
              />
              <Range
                label="Плотность потока"
                value={config.density}
                min={12}
                max={64}
                step={2}
                onChange={(density) => update({ density })}
              />
              <Range
                label="Размер символов"
                value={config.size}
                min={12}
                max={28}
                suffix=" px"
                onChange={(size) => update({ size })}
              />
              <Range
                label="Видимость"
                value={Math.round(config.opacity * 100)}
                min={5}
                max={65}
                suffix="%"
                onChange={(opacity) => update({ opacity: opacity / 100 })}
              />
              <Range
                label="Свечение"
                value={config.glow}
                min={0}
                max={14}
                suffix=" px"
                onChange={(glow) => update({ glow })}
              />
            </div>
            <div className="eb-selects">
              <label htmlFor={`${id}-direction`}>
                Направление
                <select
                  id={`${id}-direction`}
                  value={config.direction}
                  onChange={(e) =>
                    update({ direction: e.target.value as EventBackgroundSettings["direction"] })
                  }
                >
                  <option value="down">Сверху вниз</option>
                  <option value="up">Снизу вверх</option>
                </select>
              </label>
              <label htmlFor={`${id}-characters`}>
                Символы
                <select
                  id={`${id}-characters`}
                  value={config.characters}
                  onChange={(e) =>
                    update({ characters: e.target.value as EventBackgroundSettings["characters"] })
                  }
                >
                  <option value="katakana">Катакана и цифры</option>
                  <option value="binary">Двоичный код</option>
                  <option value="symbols">Геометрические знаки</option>
                </select>
              </label>
            </div>
          </fieldset>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              updateSettings({
                eventBackgrounds: {
                  ...settings.eventBackgrounds,
                  [event.slug]: eventBackgroundDefault(event.slug),
                },
              });
              setMessage("Восстановлен исходный фон выбранного события.");
            }}
          >
            <RotateCcw size={14} /> Сбросить фон события
          </Button>
          <p className="eb-note" role="status">
            {message ||
              "Чтобы сохранить для всех, выберите «Фоны событий» внизу админки или сохраните все настройки."}
          </p>
        </div>
      </div>
    </section>
  );
}
