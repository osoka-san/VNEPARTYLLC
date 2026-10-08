import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Play, RotateCcw, Save, RefreshCw } from "lucide-react";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import {
  Wormhole,
  LoadingPercent,
  LoadingWordmark,
  useBeginSiteLoading,
  useSiteLoading,
} from "@/components/loading/SiteLoading";
import { useSiteAccess } from "@/lib/site-admin";
import {
  defaultLoadingSettings,
  LOADING_MODES,
  LOADING_PRESETS,
  LOADING_RANGES,
  loadingVariables,
  type LoadingSettings,
  type LoadingRangeKey,
} from "@/lib/loading-settings";
import { heroLqip } from "@/content/gallery-media";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import "./event-background-controls.css";
import "./loading-controls.css";

function RangeField({
  name,
  settings,
  update,
}: {
  name: LoadingRangeKey;
  settings: LoadingSettings;
  update: (patch: Partial<LoadingSettings>) => void;
}) {
  const id = useId(),
    range = LOADING_RANGES[name],
    value = settings[name];
  const percent = name === "opacity" || name === "darkness" || name === "percentScale";
  const display = percent
    ? `${Math.round(value * 100)}%`
    : `${Number(value.toFixed(2))}${range.unit}`;
  return (
    <div className="eb-control">
      <div className="eb-control-heading">
        <span id={id}>{range.label}</span>
        <output>{display}</output>
      </div>
      <Slider
        thumbLabelledBy={id}
        thumbValueText={display}
        value={[value]}
        min={range.min}
        max={range.max}
        step={range.step}
        onValueChange={([next]) => update({ [name]: next ?? value })}
      />
    </div>
  );
}

const groups: { title: string; keys: LoadingRangeKey[]; note?: string }[] = [
  {
    title: "Движение и форма",
    keys: ["speed", "ringCount", "size", "mobileScale", "spread", "travel", "stroke"],
    note: "Скорость, количество, размах и смещение работают в движущихся режимах. В статичном режиме остаётся одно кольцо.",
  },
  { title: "Свет", keys: ["brightness", "glow", "opacity"] },
  { title: "Стеклянный фон", keys: ["darkness", "blur", "mobileBlur", "saturation"] },
  {
    title: "Время показа",
    keys: ["showDelay", "minVisible", "transition", "slowAfter"],
    note: "Задержка помогает избежать мигания на быстрых запросах. Первый экран показывается сразу. Кнопка продолжения убирает пелену, но не завершает запрос.",
  },
];

export function LoadingControls() {
  const motion = useMotionEnv(),
    access = useSiteAccess(),
    begin = useBeginSiteLoading();
  const config = motion.settings.loading;
  const id = useId();
  const [phone, setPhone] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [replay, setReplay] = useState(0);
  const demo = useRef<{ release: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  useSiteLoading(busy, "Сохраняем настройки загрузки");
  useEffect(
    () => () => {
      demo.current?.release();
      clearTimeout(demo.current?.timer);
    },
    [],
  );
  const update = (patch: Partial<LoadingSettings>) => {
    motion.updateSettings({ loading: { ...config, ...patch } });
    setMessage("");
  };
  const mode = LOADING_MODES.find((item) => item.id === config.mode)!;
  const dirty = JSON.stringify(config) !== JSON.stringify(motion.siteDefault.loading);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await motion.saveSiteDefaults(["loading"]);
      setMessage("Настройки загрузки сохранены для всех следующих открытий сайта.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить настройки.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      await motion.refreshSiteDefaults();
      setMessage("Применены актуальные общие настройки.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить настройки.");
    } finally {
      setBusy(false);
    }
  }
  const variables = loadingVariables(config, motion.reduced);
  if (phone) variables["--loading-blur"] = variables["--loading-mobile-blur"]!;
  return (
    <section
      id="loading-settings"
      className="eb-panel lc-panel order-first lg:col-span-12"
      aria-labelledby={`${id}-title`}
      data-admin-static="true"
    >
      <div className="eb-heading">
        <div>
          <p className="eb-kicker">ВНЕ / ОЖИДАНИЕ</p>
          <h3 id={`${id}-title`}>Загрузка сайта</h3>
        </div>
        <span className="eb-type">Живое превью</span>
      </div>
      <p className="eb-description">
        Настройте световые кольца и стекло поверх страницы. Изменения сразу применяются в вашем
        просмотре. Администратор может сохранить только этот раздел или все настройки кнопкой внизу.
      </p>
      <div className="lc-presets" role="group" aria-label="Готовое оформление загрузчика">
        {LOADING_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={JSON.stringify(config) === JSON.stringify(preset.values)}
            onClick={() => {
              motion.updateSettings({ loading: { ...preset.values } });
              setMessage("");
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="lc-layout">
        <div className="lc-settings">
          <fieldset className="lc-modes">
            <legend>Режим загрузчика</legend>
            <div className="lc-mode-grid">
              {LOADING_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={config.mode === item.id}
                  onClick={() => update({ mode: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="eb-note">{mode.hint}</p>
          </fieldset>
          <label className="lc-direction">
            Направление
            <select
              value={config.direction}
              disabled={config.mode === "static" || config.mode === "off"}
              onChange={(e) =>
                update({ direction: e.target.value as LoadingSettings["direction"] })
              }
            >
              <option value="forward">Прямое</option>
              <option value="reverse">Обратное</option>
            </select>
          </label>
          <div className="eb-colors lc-colors">
            {(
              [
                ["mint", "Основной цвет"],
                ["cyan", "Второй цвет"],
                ["highlight", "Световой блик"],
                ["background", "Цвет стекла"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <div className="eb-color-value">
                  <input
                    type="color"
                    aria-label={label}
                    value={config[key]}
                    onChange={(e) => update({ [key]: e.target.value })}
                  />
                  <code>{config[key]}</code>
                </div>
              </label>
            ))}
          </div>
          <details className="lc-group" open>
            <summary>Процент загрузки</summary>
            <p className="eb-note">
              Число и полоска меняют размер вместе. 65% — уменьшенный на 35% вариант; цвет общий с
              воронкой. Отступ задаётся отдельно.
            </p>
            <div className="eb-toggles">
              <label>
                Показывать процент
                <Switch
                  checked={config.showPercent}
                  onCheckedChange={(value) => update({ showPercent: value })}
                />
              </label>
            </div>
            <div className="eb-ranges">
              <RangeField name="percentScale" settings={config} update={update} />
              <RangeField name="percentGap" settings={config} update={update} />
            </div>
          </details>
          {groups.map((group) => (
            <details key={group.title} className="lc-group" open>
              <summary>{group.title}</summary>
              {group.note && <p className="eb-note">{group.note}</p>}
              <div className="eb-ranges">
                {group.keys.map((key) => (
                  <RangeField key={key} name={key} settings={config} update={update} />
                ))}
              </div>
            </details>
          ))}
          <div className="eb-toggles lc-toggles">
            <label>
              Логотип ВНЕ над воронкой
              <Switch
                checked={config.showBrand}
                onCheckedChange={(value) => update({ showBrand: value })}
              />
            </label>
            <label>
              Текст состояния
              <Switch
                checked={config.showLabel}
                onCheckedChange={(value) => update({ showLabel: value })}
              />
            </label>
          </div>
        </div>
        <div className="lc-preview-column">
          <div className="lc-device" role="group" aria-label="Размер превью">
            <button type="button" aria-pressed={!phone} onClick={() => setPhone(false)}>
              Компьютер
            </button>
            <button type="button" aria-pressed={phone} onClick={() => setPhone(true)}>
              Телефон
            </button>
          </div>
          <div
            className="lc-stage"
            data-device={phone ? "phone" : "desktop"}
            style={variables as CSSProperties}
          >
            <img src={heroLqip.desktop} alt="" className="lc-scene" />
            <div className="lc-page">
              <span>ВНЕ / ДЛЯ СВОИХ</span>
              <h4>
                Меньше шума.
                <br />
                Больше связи.
              </h4>
              <p>Музыка. Пространство. Люди.</p>
              <div className="lc-page-line" />
              <div className="lc-page-line" />
            </div>
            <div key={replay} className="vne-loading-glass lc-glass" data-state="visible">
              <div className="vne-loading-center">
                <LoadingWordmark />
                <Wormhole />
                <LoadingPercent progress={64} />
                <span className="vne-loading-label">Открываем пространство ВНЕ</span>
              </div>
            </div>
          </div>
          <p className="eb-note">
            {config.mode === "off"
              ? "Общий загрузчик выключен; состояние запроса остаётся в самой форме."
              : motion.reduced
                ? "Включено уменьшение движения: показано статичное кольцо. Системная настройка имеет приоритет."
                : config.mode === "static"
                  ? "Одно статичное светящееся кольцо."
                  : `${mode.label} · ${config.ringCount} колец · цикл ${(3 / config.speed).toFixed(1)} с`}
          </p>
          {config.mode !== "off" && config.showPercent && (
            <p className="eb-note">
              64% — пример для настройки вида. На сайте процент оценивает загрузку.
            </p>
          )}
          <div className="lc-actions">
            <Button type="button" variant="outline" onClick={() => setReplay((value) => value + 1)}>
              <RotateCcw size={16} /> Повторить
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={config.mode === "off"}
              onClick={() => {
                demo.current?.release();
                clearTimeout(demo.current?.timer);
                const release = begin("Превью загрузки · 3 секунды");
                demo.current = { release, timer: setTimeout(release, 3000) };
              }}
            >
              <Play size={16} /> На весь экран · 3 с
            </Button>
          </div>
          <div className="lc-save">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                motion.updateSettings({ loading: { ...defaultLoadingSettings } });
                setMessage("Восстановлен неоновый вариант ВНЕ в текущем просмотре.");
              }}
            >
              <RotateCcw size={16} /> Сбросить загрузчик
            </Button>
            {access.actor?.role === "owner" ? (
              <Button
                type="button"
                disabled={busy || !dirty || !motion.sharedDefaultsAvailable}
                onClick={() => void save()}
              >
                <Save size={16} /> Сохранить загрузчик для всех
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy || !motion.sharedDefaultsAvailable}
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} /> Актуализировать настройки
              </Button>
            )}
            <p className="eb-note">
              {dirty
                ? "Есть изменения в текущем просмотре."
                : "Загрузчик соответствует общим настройкам."}
            </p>
            <p className="lc-message" role="status">
              {message}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
