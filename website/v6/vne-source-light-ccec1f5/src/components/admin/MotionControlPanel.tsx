import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminMotionPreview } from "./AdminMotionPreview";
import {
  defaultMotionSettings,
  matchPreset,
  motionPresets,
  exportMotionSettings,
  parseImportedSettings,
  type MotionSettings,
  type PresetKey,
  type RevealStyle,
  type TextAnimationStyle,
  type TextSplit,
} from "@/lib/motion-settings";
import { saveMotionDefault } from "@/lib/motion-defaults.functions";
import {
  defaultScrambleGroups,
  defaultScrambleTargets,
  scrambleGroups,
  scrambleTargets,
  type ScrambleCharset,
  type ScrambleDirection,
  type ScrambleGroupId,
  type ScrambleTargetId,
} from "@/lib/text-scramble";

const revealStyles: { key: RevealStyle; label: string }[] = [
  { key: "blur", label: "Расфокус" },
  { key: "rise", label: "Подъём" },
  { key: "fade", label: "Проявление" },
  { key: "scale", label: "Приближение" },
  { key: "none", label: "Без появления" },
];

const textStyles: { key: TextAnimationStyle; label: string }[] = [
  { key: "blur", label: "Расфокус" },
  { key: "rise", label: "Подъём" },
  { key: "fade", label: "Проявление" },
  { key: "mask", label: "Маска" },
  { key: "scale", label: "Приближение" },
  { key: "none", label: "Без движения" },
];

const textSplits: { key: TextSplit; label: string }[] = [
  { key: "block", label: "Блок" },
  { key: "line", label: "Строка из текста" },
  { key: "word", label: "Слово" },
  { key: "character", label: "Буква" },
];

const scrambleDirections: { key: ScrambleDirection; label: string }[] = [
  { key: "left", label: "Слева направо" },
  { key: "right", label: "Справа налево" },
  { key: "random", label: "Случайно" },
];

const scrambleCharsets: { key: ScrambleCharset; label: string }[] = [
  { key: "auto", label: "Авто RU / EN" },
  { key: "mixed", label: "Смешанный" },
  { key: "symbols", label: "Буквы + знаки" },
];

function Choice<T extends string>({
  value,
  options,
  onChange,
  settingKey,
  active,
  onActivate,
}: {
  value: T;
  settingKey: keyof MotionSettings;
  active: boolean;
  onActivate: (key: keyof MotionSettings) => void;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      data-setting-key={settingKey}
      onFocusCapture={() => onActivate(settingKey)}
      className={`mt-3 flex flex-wrap gap-2 border-l-2 pl-3 transition-colors ${active ? "border-orange" : "border-transparent"}`}
    >
      {options.map((option) => (
        <Button
          key={option.key}
          type="button"
          variant="outline"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={
            value === option.key
              ? "min-h-11 border-[var(--orange)]"
              : "min-h-11 text-muted-foreground"
          }
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function TextStyleControl({
  label,
  value,
  onChange,
  settingKey,
  active,
  onActivate,
}: {
  label: string;
  settingKey: keyof MotionSettings;
  active: boolean;
  onActivate: (key: keyof MotionSettings) => void;
  value: TextAnimationStyle;
  onChange: (value: TextAnimationStyle) => void;
}) {
  return (
    <div className="py-3">
      <Label className="font-body text-sm">{label}</Label>
      <Choice
        value={value}
        options={textStyles}
        onChange={onChange}
        settingKey={settingKey}
        active={active}
        onActivate={onActivate}
      />
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  settingKey,
  active,
  onActivate,
}: {
  label: string;
  hint?: string;
  settingKey: keyof MotionSettings;
  active: boolean;
  onActivate: (key: keyof MotionSettings) => void;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const display = `${value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}${unit ?? ""}`;
  return (
    <div
      data-setting-key={settingKey}
      onFocusCapture={() => onActivate(settingKey)}
      onPointerDown={() => onActivate(settingKey)}
      className={`border-l-2 py-3 pl-3 transition-colors ${active ? "border-orange bg-white/[0.025]" : "border-transparent"}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <Label id={`${id}-l`} className="font-body text-sm">
          {label}
        </Label>
        <span className="font-display text-xs text-muted-foreground">
          {value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}
          {unit ?? ""}
        </span>
      </div>
      {hint ? (
        <p id={`${id}-h`} className="mt-1 font-body text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <Slider
        thumbLabelledBy={`${id}-l`}
        thumbDescribedBy={hint ? `${id}-h` : undefined}
        thumbValueText={display}
        className="mt-3"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next ?? value)}
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  settingKey,
  active,
  onActivate,
}: {
  label: string;
  hint: string;
  settingKey: keyof MotionSettings;
  active: boolean;
  onActivate: (key: keyof MotionSettings) => void;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div
      data-setting-key={settingKey}
      onFocusCapture={() => onActivate(settingKey)}
      onPointerDown={() => onActivate(settingKey)}
      className={`flex items-start justify-between gap-4 border-l-2 py-3 pl-3 transition-colors ${active ? "border-orange bg-white/[0.025]" : "border-transparent"}`}
    >
      <div>
        <Label htmlFor={id} className="font-body text-sm">
          {label}
        </Label>
        <p id={`${id}-h`} className="mt-1 font-body text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch id={id} aria-describedby={`${id}-h`} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Панель управления движением сайта. Настройки живут в этом браузере. */
export function MotionControlPanel() {
  const { settings, siteDefault, updateSettings, replaceSettings, reduced } = useMotionEnv();
  const saveDefault = useServerFn(saveMotionDefault);
  const [previewKey, setPreviewKey] = useState(0);
  const [activeKey, setActiveKey] = useState<keyof MotionSettings>("revealStyle");
  const replayTimer = useRef<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const activePreset = matchPreset(settings);

  const replay = () => setPreviewKey((key) => key + 1);
  const scheduleReplay = () => {
    if (replayTimer.current) window.clearTimeout(replayTimer.current);
    replayTimer.current = window.setTimeout(replay, 200);
  };
  const set = (patch: Partial<MotionSettings>) => {
    const key = Object.keys(patch)[0] as keyof MotionSettings | undefined;
    if (key) setActiveKey(key);
    updateSettings(patch);
    scheduleReplay();
  };
  const setScrambleGroup = (group: ScrambleGroupId, checked: boolean) =>
    set({ scrambleGroups: { ...settings.scrambleGroups, [group]: checked } });
  const setScrambleTarget = (target: ScrambleTargetId, checked: boolean) =>
    set({ scrambleTargets: { ...settings.scrambleTargets, [target]: checked } });
  const setAllScrambleTargets = (checked: boolean) =>
    set({
      scrambleGroups: Object.fromEntries(scrambleGroups.map(({ id }) => [id, checked])) as Record<
        ScrambleGroupId,
        boolean
      >,
      scrambleTargets: Object.fromEntries(scrambleTargets.map(({ id }) => [id, checked])) as Record<
        ScrambleTargetId,
        boolean
      >,
    });
  const resetScramble = () => {
    set({
      scramble: defaultMotionSettings.scramble,
      scrambleDuration: defaultMotionSettings.scrambleDuration,
      scrambleTick: defaultMotionSettings.scrambleTick,
      scrambleDelay: defaultMotionSettings.scrambleDelay,
      scrambleIntensity: defaultMotionSettings.scrambleIntensity,
      scrambleDirection: defaultMotionSettings.scrambleDirection,
      scrambleCharset: defaultMotionSettings.scrambleCharset,
      scrambleRepeat: defaultMotionSettings.scrambleRepeat,
      scrambleGroups: { ...defaultScrambleGroups },
      scrambleTargets: { ...defaultScrambleTargets },
    });
    setCopyStatus("Настройки Text Scramble сброшены.");
  };
  useEffect(
    () => () => {
      if (replayTimer.current) window.clearTimeout(replayTimer.current);
    },
    [],
  );

  const [importOpen, setImportOpen] = useState(false);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const [importText, setImportText] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const [pressStatus, setPressStatus] = useState<string | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [defaultSaving, setDefaultSaving] = useState(false);

  const onSaveDefault = async () => {
    setDefaultSaving(true);
    const result = await saveDefault({ data: { settings } }).catch(() => ({
      ok: false as const,
      message: "Не удалось обновить общий default.",
    }));
    setDefaultSaving(false);
    setDefaultOpen(false);
    setCopyStatus(result.message);
  };

  const onImport = () => {
    if (!importText.trim()) {
      setImportError("Поле пустое. Вставьте JSON, скопированный в этой панели.");
      return;
    }
    const result = parseImportedSettings(importText, settings);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    replaceSettings(result.settings);
    setImportError(null);
    setImportOpen(false);
    setImportText("");
    setCopyStatus("Настройки применены.");
    setActiveKey("revealStyle");
    replay();
  };

  const onCopy = async () => {
    const json = exportMotionSettings(settings);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(json);
      setCopyStatus("JSON скопирован.");
    } catch {
      setCopyStatus("Браузер не дал доступ к буферу. Текст выделен ниже — скопируйте его вручную.");
      requestAnimationFrame(() => {
        jsonRef.current?.focus();
        jsonRef.current?.select();
      });
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="space-y-8 lg:col-span-7">
        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Готовые сценарии</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(Object.keys(motionPresets) as PresetKey[]).map((key) => {
              const preset = motionPresets[key];
              const active = activePreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onFocus={() => setActiveKey("revealStyle")}
                  onClick={() => {
                    setActiveKey("revealStyle");
                    replaceSettings(preset.values);
                    setPreviewKey((k) => k + 1);
                  }}
                  className={`min-h-11 rounded-sm border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--orange)] bg-white/[0.04]"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <span className="font-display text-sm">{preset.label}</span>
                  <span className="mt-1 block font-body text-xs text-muted-foreground">
                    {preset.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Появление блоков</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {revealStyles.map((style) => (
              <button
                key={style.key}
                type="button"
                aria-pressed={settings.revealStyle === style.key}
                onFocus={() => setActiveKey("revealStyle")}
                onClick={() => set({ revealStyle: style.key })}
                className={`min-h-11 rounded-sm border px-3 font-body text-sm transition-colors ${
                  settings.revealStyle === style.key
                    ? "border-[var(--orange)] text-foreground"
                    : "border-white/10 text-muted-foreground hover:border-white/25"
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>
          <div className="mt-2 divide-y divide-white/10">
            <Row
              label="Длительность"
              value={settings.duration}
              min={0}
              max={2.5}
              step={0.05}
              unit=" с"
              settingKey="duration"
              active={activeKey === "duration"}
              onActivate={setActiveKey}
              onChange={(duration) => set({ duration })}
            />
            <Row
              label="Смещение"
              hint="Насколько блок поднимается при появлении."
              value={settings.distance}
              min={0}
              max={80}
              step={1}
              unit=" px"
              settingKey="distance"
              active={activeKey === "distance"}
              onActivate={setActiveKey}
              onChange={(distance) => set({ distance })}
            />
            <Row
              label="Размытие"
              value={settings.blur}
              min={0}
              max={24}
              step={1}
              unit=" px"
              settingKey="blur"
              active={activeKey === "blur"}
              onActivate={setActiveKey}
              onChange={(blur) => set({ blur })}
            />
            <Row
              label="Начальный масштаб"
              hint="Действует в режиме «Приближение»."
              value={settings.scaleFrom}
              min={0.8}
              max={1}
              step={0.01}
              settingKey="scaleFrom"
              active={activeKey === "scaleFrom"}
              onActivate={setActiveKey}
              onChange={(scaleFrom) => set({ scaleFrom })}
            />
            <Row
              label="Шаг появления первого экрана"
              value={settings.heroStagger}
              min={0}
              max={0.8}
              step={0.02}
              unit=" с"
              settingKey="heroStagger"
              active={activeKey === "heroStagger"}
              onActivate={setActiveKey}
              onChange={(heroStagger) => set({ heroStagger })}
            />
            <div className="flex items-center justify-between gap-4 py-3">
              <Label className="font-body text-sm">Характер кривой</Label>
              <div className="flex gap-2">
                {(["out", "inOut"] as const).map((ease) => (
                  <button
                    key={ease}
                    type="button"
                    aria-pressed={settings.ease === ease}
                    onFocus={() => setActiveKey("ease")}
                    onClick={() => set({ ease })}
                    className={`min-h-11 rounded-sm border px-3 font-body text-sm ${
                      settings.ease === ease
                        ? "border-[var(--orange)]"
                        : "border-white/10 text-muted-foreground"
                    }`}
                  >
                    {ease === "out" ? "Мягкое торможение" : "Плавное с двух сторон"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section data-admin-static="true">
          <h3 className="font-display text-sm uppercase tracking-wide">Text Effect</h3>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Анимировать текст"
              hint="Общий переключатель для текста на главной, событиях и в этой панели."
              checked={settings.textEnabled}
              settingKey="textEnabled"
              active={activeKey === "textEnabled"}
              onActivate={setActiveKey}
              onChange={(textEnabled) => set({ textEnabled })}
            />
            <TextStyleControl
              label="Заголовки"
              value={settings.textHeadingStyle}
              settingKey="textHeadingStyle"
              active={activeKey === "textHeadingStyle"}
              onActivate={setActiveKey}
              onChange={(textHeadingStyle) => set({ textHeadingStyle })}
            />
            <TextStyleControl
              label="Обычный текст"
              value={settings.textBodyStyle}
              settingKey="textBodyStyle"
              active={activeKey === "textBodyStyle"}
              onActivate={setActiveKey}
              onChange={(textBodyStyle) => set({ textBodyStyle })}
            />
            <TextStyleControl
              label="Короткие акценты"
              value={settings.textAccentStyle}
              settingKey="textAccentStyle"
              active={activeKey === "textAccentStyle"}
              onActivate={setActiveKey}
              onChange={(textAccentStyle) => set({ textAccentStyle })}
            />
            <div className="py-3">
              <Label className="font-body text-sm">Последовательность</Label>
              <Choice
                value={settings.textSplit}
                settingKey="textSplit"
                active={activeKey === "textSplit"}
                onActivate={setActiveKey}
                options={textSplits}
                onChange={(textSplit) => set({ textSplit })}
              />
            </div>
            <Row
              label="Длительность текста"
              value={settings.textDuration}
              min={0}
              max={2.5}
              step={0.05}
              unit=" с"
              settingKey="textDuration"
              active={activeKey === "textDuration"}
              onActivate={setActiveKey}
              onChange={(textDuration) => set({ textDuration })}
            />
            <Row
              label="Начальная задержка"
              value={settings.textDelay}
              min={0}
              max={1.5}
              step={0.05}
              unit=" с"
              settingKey="textDelay"
              active={activeKey === "textDelay"}
              onActivate={setActiveKey}
              onChange={(textDelay) => set({ textDelay })}
            />
            <Row
              label="Шаг элементов"
              value={settings.textStagger}
              min={0}
              max={0.2}
              step={0.005}
              unit=" с"
              settingKey="textStagger"
              active={activeKey === "textStagger"}
              onActivate={setActiveKey}
              onChange={(textStagger) => set({ textStagger })}
            />
            <Row
              label="Смещение текста"
              value={settings.textDistance}
              min={0}
              max={80}
              step={1}
              unit=" px"
              settingKey="textDistance"
              active={activeKey === "textDistance"}
              onActivate={setActiveKey}
              onChange={(textDistance) => set({ textDistance })}
            />
            <Row
              label="Размытие текста"
              value={settings.textBlur}
              min={0}
              max={24}
              step={1}
              unit=" px"
              settingKey="textBlur"
              active={activeKey === "textBlur"}
              onActivate={setActiveKey}
              onChange={(textBlur) => set({ textBlur })}
            />
            <Row
              label="Начальный масштаб текста"
              value={settings.textScaleFrom}
              min={0.8}
              max={1}
              step={0.01}
              settingKey="textScaleFrom"
              active={activeKey === "textScaleFrom"}
              onActivate={setActiveKey}
              onChange={(textScaleFrom) => set({ textScaleFrom })}
            />
            <Row
              label="Порог появления"
              hint="Доля элемента, которая должна войти в экран."
              value={settings.textViewportAmount}
              min={0}
              max={1}
              step={0.05}
              settingKey="textViewportAmount"
              active={activeKey === "textViewportAmount"}
              onActivate={setActiveKey}
              onChange={(textViewportAmount) => set({ textViewportAmount })}
            />
            <Toggle
              label="Повтор при возвращении"
              hint="Повторять после выхода текста из области просмотра."
              checked={settings.textRepeat}
              settingKey="textRepeat"
              active={activeKey === "textRepeat"}
              onActivate={setActiveKey}
              onChange={(textRepeat) => set({ textRepeat })}
            />
            <Toggle
              label="Сценарий первого экрана"
              hint="Разнести появление подписи, заголовка, пояснения и действий."
              checked={settings.textHeroSequence}
              settingKey="textHeroSequence"
              active={activeKey === "textHeroSequence"}
              onActivate={setActiveKey}
              onChange={(textHeroSequence) => set({ textHeroSequence })}
            />
            <Toggle
              label="Текст кнопок и ссылок"
              hint="Применять короткий акцент к действиям."
              checked={settings.textButtons}
              settingKey="textButtons"
              active={activeKey === "textButtons"}
              onActivate={setActiveKey}
              onChange={(textButtons) => set({ textButtons })}
            />
            <Toggle
              label="Текст карточек событий"
              hint="Анимировать даты, названия и статусы карточек."
              checked={settings.textCards}
              settingKey="textCards"
              active={activeKey === "textCards"}
              onActivate={setActiveKey}
              onChange={(textCards) => set({ textCards })}
            />
            <Toggle
              label="Текст панели управления"
              hint="Показывать выбранный эффект и на административной странице."
              checked={settings.textAdmin}
              settingKey="textAdmin"
              active={activeKey === "textAdmin"}
              onActivate={setActiveKey}
              onChange={(textAdmin) => set({ textAdmin })}
            />
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Отклик на курсор</h3>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Притяжение кнопок"
              hint="Кнопка слегка тянется за курсором мыши."
              checked={settings.magnetic}
              settingKey="magnetic"
              active={activeKey === "magnetic"}
              onActivate={setActiveKey}
              onChange={(magnetic) => set({ magnetic })}
            />
            <Row
              label="Сила притяжения"
              value={settings.magneticStrength}
              min={0}
              max={0.6}
              step={0.01}
              settingKey="magneticStrength"
              active={activeKey === "magneticStrength"}
              onActivate={setActiveKey}
              onChange={(magneticStrength) => set({ magneticStrength })}
            />
            <Row
              label="Предел смещения"
              value={settings.magneticMaxOffset}
              min={0}
              max={24}
              step={1}
              unit=" px"
              settingKey="magneticMaxOffset"
              active={activeKey === "magneticMaxOffset"}
              onActivate={setActiveKey}
              onChange={(magneticMaxOffset) => set({ magneticMaxOffset })}
            />
            <Toggle
              label="Наклон карточек"
              hint="Лёгкий поворот и подсветка под курсором."
              checked={settings.tilt}
              settingKey="tilt"
              active={activeKey === "tilt"}
              onActivate={setActiveKey}
              onChange={(tilt) => set({ tilt })}
            />
            <Row
              label="Угол наклона"
              value={settings.tiltDeg}
              min={0}
              max={12}
              step={0.5}
              unit="°"
              settingKey="tiltDeg"
              active={activeKey === "tiltDeg"}
              onActivate={setActiveKey}
              onChange={(tiltDeg) => set({ tiltDeg })}
            />
            <Toggle
              label="Реакция на нажатие"
              hint="Кнопка чуть увеличивается при наведении и сжимается при нажатии."
              checked={settings.press}
              settingKey="press"
              active={activeKey === "press"}
              onActivate={setActiveKey}
              onChange={(press) => set({ press })}
            />
            <Row
              label="Увеличение при наведении"
              value={settings.pressHover}
              min={1}
              max={1.1}
              step={0.005}
              settingKey="pressHover"
              active={activeKey === "pressHover"}
              onActivate={setActiveKey}
              onChange={(pressHover) => set({ pressHover })}
            />
            <Row
              label="Сжатие при нажатии"
              value={settings.pressTap}
              min={0.9}
              max={1}
              step={0.005}
              settingKey="pressTap"
              active={activeKey === "pressTap"}
              onActivate={setActiveKey}
              onChange={(pressTap) => set({ pressTap })}
            />
            <Row
              label="Упругость"
              value={settings.springStiffness}
              min={40}
              max={600}
              step={10}
              settingKey="springStiffness"
              active={activeKey === "springStiffness"}
              onActivate={setActiveKey}
              onChange={(springStiffness) => set({ springStiffness })}
            />
            <Row
              label="Затухание"
              value={settings.springDamping}
              min={5}
              max={60}
              step={1}
              settingKey="springDamping"
              active={activeKey === "springDamping"}
              onActivate={setActiveKey}
              onChange={(springDamping) => set({ springDamping })}
            />
          </div>
        </section>

        <section data-admin-static="true">
          <h3 className="font-display text-sm uppercase tracking-wide">Text Scramble</h3>
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Перебирает буквы только в выбранных редакционных акцентах. Цифры, пробелы и пунктуация
            остаются неизменными.
          </p>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Включить Text Scramble"
              hint="При уменьшении движения метка сразу показывается целиком."
              checked={settings.scramble}
              settingKey="scramble"
              active={activeKey === "scramble"}
              onActivate={setActiveKey}
              onChange={(scramble) => set({ scramble })}
            />
            <Row
              label="Длительность перебора"
              value={settings.scrambleDuration}
              min={0.2}
              max={1.5}
              step={0.01}
              unit=" с"
              settingKey="scrambleDuration"
              active={activeKey === "scrambleDuration"}
              onActivate={setActiveKey}
              onChange={(scrambleDuration) => set({ scrambleDuration })}
            />
            <Row
              label="Частота смены знаков"
              hint="Меньше значение — буквы меняются чаще."
              value={settings.scrambleTick}
              min={0.025}
              max={0.12}
              step={0.005}
              unit=" с"
              settingKey="scrambleTick"
              active={activeKey === "scrambleTick"}
              onActivate={setActiveKey}
              onChange={(scrambleTick) => set({ scrambleTick })}
            />
            <Row
              label="Пауза перед началом"
              value={settings.scrambleDelay}
              min={0}
              max={0.5}
              step={0.01}
              unit=" с"
              settingKey="scrambleDelay"
              active={activeKey === "scrambleDelay"}
              onActivate={setActiveKey}
              onChange={(scrambleDelay) => set({ scrambleDelay })}
            />
            <Row
              label="Плотность перебора"
              hint="Доля ещё не раскрытых букв, которые меняются одновременно."
              value={settings.scrambleIntensity}
              min={0.1}
              max={1}
              step={0.05}
              settingKey="scrambleIntensity"
              active={activeKey === "scrambleIntensity"}
              onActivate={setActiveKey}
              onChange={(scrambleIntensity) => set({ scrambleIntensity })}
            />
            <div className="py-3">
              <Label className="font-body text-sm">Направление раскрытия</Label>
              <Choice
                value={settings.scrambleDirection}
                options={scrambleDirections}
                onChange={(scrambleDirection) => set({ scrambleDirection })}
                settingKey="scrambleDirection"
                active={activeKey === "scrambleDirection"}
                onActivate={setActiveKey}
              />
            </div>
            <div className="py-3">
              <Label className="font-body text-sm">Набор сменных знаков</Label>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Авто сохраняет язык и регистр исходной буквы.
              </p>
              <Choice
                value={settings.scrambleCharset}
                options={scrambleCharsets}
                onChange={(scrambleCharset) => set({ scrambleCharset })}
                settingKey="scrambleCharset"
                active={activeKey === "scrambleCharset"}
                onActivate={setActiveKey}
              />
            </div>
            <Toggle
              label="Повтор при возвращении"
              hint="Повторяет эффект только после выхода места из экрана и нового появления."
              checked={settings.scrambleRepeat}
              settingKey="scrambleRepeat"
              active={activeKey === "scrambleRepeat"}
              onActivate={setActiveKey}
              onChange={(scrambleRepeat) => set({ scrambleRepeat })}
            />
          </div>

          <div className="mt-6 border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display text-sm">Области сайта</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Группа и конкретное место должны быть включены одновременно.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setAllScrambleTargets(true)}
                >
                  Включить все
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setAllScrambleTargets(false)}
                >
                  Выключить все
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {scrambleGroups.map((group) => (
                <label
                  key={group.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={settings.scrambleGroups[group.id]}
                    onCheckedChange={(checked) => setScrambleGroup(group.id, checked === true)}
                    aria-label={`Область: ${group.label}`}
                  />
                  <span>{group.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {scrambleGroups.map((group) => {
              const targets = scrambleTargets.filter((target) => target.group === group.id);
              if (targets.length === 0) return null;
              return (
                <fieldset
                  key={group.id}
                  className="border border-border p-4"
                  disabled={!settings.scrambleGroups[group.id]}
                >
                  <legend className="px-2 font-display text-xs uppercase text-mint">
                    {group.label}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {targets.map((target) => (
                      <label
                        key={target.id}
                        className="flex min-h-11 cursor-pointer items-start gap-3 border border-border px-3 py-2 disabled:opacity-50"
                      >
                        <Checkbox
                          checked={settings.scrambleTargets[target.id]}
                          onCheckedChange={(checked) =>
                            setScrambleTarget(target.id, checked === true)
                          }
                          aria-label={`${target.route}: ${target.label}`}
                        />
                        <span className="min-w-0 text-sm">
                          <span className="block">{target.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {target.route} · {target.section}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={resetScramble}>
            Сбросить только Scramble
          </Button>
        </section>

        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Text Roll</h3>
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Фраза «Меньше шума.» в главе «Манифест» один раз мягко прокручивает буквы снизу вверх.
            Цифры и знаки препинания стоят на месте.
          </p>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Включить акцент"
              hint="При уменьшении движения фраза сразу показывается целой."
              checked={settings.rollEnabled}
              settingKey="rollEnabled"
              active={activeKey === "rollEnabled"}
              onActivate={setActiveKey}
              onChange={(rollEnabled) => set({ rollEnabled })}
            />
            <Row
              label="Длительность прокрутки"
              value={settings.rollDuration}
              min={0.5}
              max={0.75}
              step={0.01}
              unit=" с"
              settingKey="rollDuration"
              active={activeKey === "rollDuration"}
              onActivate={setActiveKey}
              onChange={(rollDuration) => set({ rollDuration })}
            />
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Text Loop</h3>
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Basic и custom варианты для двух вторичных редакционных строк. Цикл можно остановить.
          </p>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Включить Text Loop"
              hint="Смена останавливается вне экрана, в скрытой вкладке, при hover или focus."
              checked={settings.loopEnabled}
              settingKey="loopEnabled"
              active={activeKey === "loopEnabled"}
              onActivate={setActiveKey}
              onChange={(loopEnabled) => set({ loopEnabled })}
            />
            <Row
              label="Пауза между словами"
              value={settings.loopInterval}
              min={4}
              max={5}
              step={0.1}
              unit=" с"
              settingKey="loopInterval"
              active={activeKey === "loopInterval"}
              onActivate={setActiveKey}
              onChange={(loopInterval) => set({ loopInterval })}
            />
            <Row
              label="Переход между словами"
              value={settings.loopDuration}
              min={0.3}
              max={0.6}
              step={0.01}
              unit=" с"
              settingKey="loopDuration"
              active={activeKey === "loopDuration"}
              onActivate={setActiveKey}
              onChange={(loopDuration) => set({ loopDuration })}
            />
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Text Sections</h3>
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Постепенно проявляет выбранные редакционные строки фирменным cyan при прокрутке.
          </p>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Включить Text Sections"
              hint="В reduced/off текст сразу принимает финальный читаемый вид."
              checked={settings.sectionEnabled}
              settingKey="sectionEnabled"
              active={activeKey === "sectionEnabled"}
              onActivate={setActiveKey}
              onChange={(sectionEnabled) => set({ sectionEnabled })}
            />
            <Row
              label="Интенсивность cyan"
              value={settings.sectionIntensity}
              min={0.55}
              max={1}
              step={0.05}
              settingKey="sectionIntensity"
              active={activeKey === "sectionIntensity"}
              onActivate={setActiveKey}
              onChange={(sectionIntensity) => set({ sectionIntensity })}
            />
            <Row
              label="Начало подсветки"
              value={settings.sectionStart}
              min={0}
              max={0.45}
              step={0.05}
              settingKey="sectionStart"
              active={activeKey === "sectionStart"}
              onActivate={setActiveKey}
              onChange={(sectionStart) => set({ sectionStart })}
            />
            <Row
              label="Завершение подсветки"
              value={settings.sectionEnd}
              min={0.55}
              max={1}
              step={0.05}
              settingKey="sectionEnd"
              active={activeKey === "sectionEnd"}
              onActivate={setActiveKey}
              onChange={(sectionEnd) => set({ sectionEnd })}
            />
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm uppercase tracking-wide">Дополнительные эффекты</h3>
          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Движение меню"
              hint="Ссылки появляются спокойной последовательностью."
              checked={settings.menuMotion}
              settingKey="menuMotion"
              active={activeKey === "menuMotion"}
              onActivate={setActiveKey}
              onChange={(menuMotion) => set({ menuMotion })}
            />
            <Toggle
              label="Движущаяся подложка"
              hint="Следует между ссылками, вкладками и карточками без сдвига сетки."
              checked={settings.animatedBackground}
              settingKey="animatedBackground"
              active={activeKey === "animatedBackground"}
              onActivate={setActiveKey}
              onChange={(animatedBackground) => set({ animatedBackground })}
            />
            <Row
              label="Переход подложки"
              value={settings.backgroundDuration}
              min={0.16}
              max={0.36}
              step={0.01}
              unit=" с"
              settingKey="backgroundDuration"
              active={activeKey === "backgroundDuration"}
              onActivate={setActiveKey}
              onChange={(backgroundDuration) => set({ backgroundDuration })}
            />
            <Toggle
              label="Раскрытие FAQ"
              hint="Мягкая подложка, шеврон и ответ; вопросы всегда доступны."
              checked={settings.faqMotion}
              settingKey="faqMotion"
              active={activeKey === "faqMotion"}
              onActivate={setActiveKey}
              onChange={(faqMotion) => set({ faqMotion })}
            />
            <Row
              label="Шаг пунктов меню"
              value={settings.menuStagger}
              min={0}
              max={0.16}
              step={0.005}
              unit=" с"
              settingKey="menuStagger"
              active={activeKey === "menuStagger"}
              onActivate={setActiveKey}
              onChange={(menuStagger) => set({ menuStagger })}
            />
            <Toggle
              label="Размытие под меню"
              hint="Локально отделяет открытое меню от страницы."
              checked={settings.progressiveBlur}
              settingKey="progressiveBlur"
              active={activeKey === "progressiveBlur"}
              onActivate={setActiveKey}
              onChange={(progressiveBlur) => set({ progressiveBlur })}
            />
            <Toggle
              label="Появление изображений"
              hint="Однократное мягкое проявление при прокрутке."
              checked={settings.imageReveal}
              settingKey="imageReveal"
              active={activeKey === "imageReveal"}
              onActivate={setActiveKey}
              onChange={(imageReveal) => set({ imageReveal })}
            />
            <Row
              label="Начальный масштаб изображения"
              value={settings.imageScaleFrom}
              min={1}
              max={1.12}
              step={0.005}
              settingKey="imageScaleFrom"
              active={activeKey === "imageScaleFrom"}
              onActivate={setActiveKey}
              onChange={(imageScaleFrom) => set({ imageScaleFrom })}
            />
            <Toggle
              label="Локальное свечение"
              hint="Слабый отклик выбранных элементов только на мышь."
              checked={settings.glow}
              settingKey="glow"
              active={activeKey === "glow"}
              onActivate={setActiveKey}
              onChange={(glow) => set({ glow })}
            />
            <Toggle
              label="Световой акцент текста"
              hint="Однократный блик на коротких статусах."
              checked={settings.shimmer}
              settingKey="shimmer"
              active={activeKey === "shimmer"}
              onActivate={setActiveKey}
              onChange={(shimmer) => set({ shimmer })}
            />
            <Toggle
              label="Переходы окон"
              hint="Проявление подложки и спокойное приближение окна."
              checked={settings.dialogMotion}
              settingKey="dialogMotion"
              active={activeKey === "dialogMotion"}
              onActivate={setActiveKey}
              onChange={(dialogMotion) => set({ dialogMotion })}
            />
            <Toggle
              label="Переходы страниц"
              hint="Короткое проявление новой страницы без задержки навигации."
              checked={settings.pageTransition}
              settingKey="pageTransition"
              active={activeKey === "pageTransition"}
              onActivate={setActiveKey}
              onChange={(pageTransition) => set({ pageTransition })}
            />
            <Row
              label="Длительность перехода страницы"
              value={settings.pageDuration}
              min={0}
              max={1.2}
              step={0.05}
              unit=" с"
              settingKey="pageDuration"
              active={activeKey === "pageDuration"}
              onActivate={setActiveKey}
              onChange={(pageDuration) => set({ pageDuration })}
            />
          </div>
        </section>

        <Collapsible>
          <section className="border border-border bg-surface/40 p-4">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full justify-between px-0 font-display text-sm uppercase"
              >
                Инструменты настроек <span aria-hidden="true">＋</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 font-body text-xs text-muted-foreground">
                Значения сохраняются в этом браузере. Для переноса используйте JSON.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    replaceSettings(siteDefault);
                    setActiveKey("revealStyle");
                    replay();
                    setCopyStatus("Настройки сброшены к общему default.");
                  }}
                >
                  Сбросить
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => void onCopy()}>
                  Скопировать JSON
                </Button>
                <Button
                  ref={importTriggerRef}
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setImportError(null);
                    setImportOpen(true);
                  }}
                >
                  Вставить JSON
                </Button>
              </div>
              <p
                role="status"
                aria-live="polite"
                className="mt-3 min-h-4 font-body text-xs text-muted-foreground"
              >
                {copyStatus}
              </p>
              <label className="sr-only" htmlFor="motion-json">
                Текущие настройки в формате JSON
              </label>
              <textarea
                id="motion-json"
                ref={jsonRef}
                readOnly
                value={exportMotionSettings(settings)}
                className="mt-2 h-40 w-full resize-none rounded-sm bg-white/[0.03] p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
              />
            </CollapsibleContent>
          </section>
        </Collapsible>
        <section className="border-t border-border pt-6">
          <p className="font-body text-xs leading-relaxed text-muted-foreground">
            Текущий набор станет стартовым для всех посетителей без личных настроек.
          </p>
          <Button type="button" className="mt-4 min-h-11" onClick={() => setDefaultOpen(true)}>
            Сделать default
          </Button>
        </section>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              importTriggerRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Вставить настройки</DialogTitle>
              <DialogDescription>
                Вставьте JSON, скопированный в этой панели. Настройки изменятся только после
                проверки.
              </DialogDescription>
            </DialogHeader>
            <label htmlFor="motion-import" className="font-body text-sm">
              JSON настроек
            </label>
            <textarea
              id="motion-import"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              aria-invalid={importError ? true : undefined}
              aria-describedby="motion-import-error"
              className="h-48 w-full rounded-sm border border-border bg-background p-3 font-mono text-xs"
            />
            <p
              id="motion-import-error"
              role="alert"
              className="min-h-4 font-body text-xs text-orange"
            >
              {importError}
            </p>
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => setImportOpen(false)}>
                Отмена
              </Button>
              <Button className="min-h-11" onClick={onImport}>
                Применить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={defaultOpen} onOpenChange={setDefaultOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Обновить общий default?</DialogTitle>
              <DialogDescription>
                Текущие настройки станут стартовыми для всех посетителей без личного выбора.
                Сохранённые личные настройки не изменятся.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => setDefaultOpen(false)}>
                Отмена
              </Button>
              <Button
                className="min-h-11"
                disabled={defaultSaving}
                onClick={() => void onSaveDefault()}
              >
                {defaultSaving ? "Сохранение…" : "Подтвердить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <AdminMotionPreview activeKey={activeKey} replayKey={previewKey} onReplay={replay} />
    </div>
  );
}
