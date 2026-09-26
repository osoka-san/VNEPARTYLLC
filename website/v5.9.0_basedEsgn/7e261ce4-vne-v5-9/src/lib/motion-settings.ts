import { motionTokens } from "./motion";
import {
  defaultScrambleGroups,
  defaultScrambleTargets,
  scrambleGroups,
  type ScrambleCharset,
  type ScrambleDirection,
  type ScrambleGroupId,
  type ScrambleTargetId,
} from "./text-scramble";

/** Настраиваемая через админку модель движения ВНЕ. */
export type RevealStyle = "fade" | "rise" | "blur" | "scale" | "none";
export type EaseKey = "out" | "inOut";
export type TextAnimationStyle = "fade" | "rise" | "blur" | "mask" | "scale" | "none";
export type TextSplit = "block" | "line" | "word" | "character";

export type MotionSettings = {
  revealStyle: RevealStyle;
  duration: number;
  ease: EaseKey;
  distance: number;
  blur: number;
  scaleFrom: number;
  heroStagger: number;
  magnetic: boolean;
  magneticStrength: number;
  magneticMaxOffset: number;
  tilt: boolean;
  tiltDeg: number;
  press: boolean;
  pressHover: number;
  pressTap: number;
  scramble: boolean;
  springStiffness: number;
  springDamping: number;
  menuMotion: boolean;
  menuStagger: number;
  progressiveBlur: boolean;
  imageReveal: boolean;
  imageScaleFrom: number;
  glow: boolean;
  shimmer: boolean;
  dialogMotion: boolean;
  pageTransition: boolean;
  pageDuration: number;
  textEnabled: boolean;
  textHeadingStyle: TextAnimationStyle;
  textBodyStyle: TextAnimationStyle;
  textAccentStyle: TextAnimationStyle;
  textSplit: TextSplit;
  textDuration: number;
  textDelay: number;
  textStagger: number;
  textDistance: number;
  textBlur: number;
  textScaleFrom: number;
  textViewportAmount: number;
  textRepeat: boolean;
  textHeroSequence: boolean;
  textButtons: boolean;
  textCards: boolean;
  textAdmin: boolean;
  /** Text Roll — однократная вертикальная прокрутка букв акцента «Меньше шума.». */
  rollEnabled: boolean;
  rollDuration: number;
  /** Медленные вторичные редакционные строки Text Loop. */
  loopEnabled: boolean;
  loopInterval: number;
  loopDuration: number;
  /** Общая движущаяся подложка навигации, карточек и segmented control. */
  animatedBackground: boolean;
  backgroundDuration: number;
  /** Раскрытие FAQ и его активная подложка. */
  faqMotion: boolean;
  /** Длительность и частота обновления Text Scramble. */
  scrambleDuration: number;
  scrambleTick: number;
  scrambleDelay: number;
  scrambleIntensity: number;
  scrambleDirection: ScrambleDirection;
  scrambleCharset: ScrambleCharset;
  scrambleRepeat: boolean;
  scrambleGroups: Record<ScrambleGroupId, boolean>;
  scrambleTargets: Record<ScrambleTargetId, boolean>;
  /** Scroll-linked cyan-подсветка выбранных редакционных абзацев. */
  sectionEnabled: boolean;
  sectionIntensity: number;
  sectionStart: number;
  sectionEnd: number;
};

export const defaultMotionSettings: MotionSettings = {
  revealStyle: "blur",
  duration: motionTokens.duration.cinematic,
  ease: "out",
  distance: motionTokens.reveal.y,
  blur: motionTokens.reveal.blur,
  scaleFrom: 0.96,
  heroStagger: 0.2,
  magnetic: true,
  magneticStrength: motionTokens.magnetic.strength,
  magneticMaxOffset: motionTokens.magnetic.maxOffset,
  tilt: true,
  tiltDeg: motionTokens.tilt.maxDeg,
  press: true,
  pressHover: motionTokens.press.hover,
  pressTap: motionTokens.press.tap,
  scramble: true,
  springStiffness: motionTokens.spring.stiffness,
  springDamping: motionTokens.spring.damping,
  menuMotion: true,
  menuStagger: motionTokens.menu.stagger,
  progressiveBlur: true,
  imageReveal: true,
  imageScaleFrom: motionTokens.image.scale,
  glow: true,
  shimmer: true,
  dialogMotion: true,
  pageTransition: true,
  pageDuration: 0.24,
  textEnabled: true,
  textHeadingStyle: "blur",
  textBodyStyle: "rise",
  textAccentStyle: "fade",
  textSplit: "word",
  textDuration: 0.72,
  textDelay: 0,
  textStagger: 0.035,
  textDistance: 16,
  textBlur: 8,
  textScaleFrom: 0.96,
  textViewportAmount: 0.2,
  textRepeat: false,
  textHeroSequence: true,
  textButtons: true,
  textCards: true,
  textAdmin: true,
  rollEnabled: true,
  rollDuration: 0.62,
  loopEnabled: true,
  loopInterval: 4.5,
  loopDuration: 0.45,
  animatedBackground: true,
  backgroundDuration: 0.2,
  faqMotion: true,
  scrambleDuration: 0.52,
  scrambleTick: 0.055,
  scrambleDelay: 0,
  scrambleIntensity: 0.65,
  scrambleDirection: "left",
  scrambleCharset: "auto",
  scrambleRepeat: false,
  scrambleGroups: { ...defaultScrambleGroups },
  scrambleTargets: { ...defaultScrambleTargets },
  sectionEnabled: true,
  sectionIntensity: 0.88,
  sectionStart: 0.08,
  sectionEnd: 0.92,
};

export type PresetKey = "signature" | "calm" | "cinematic" | "crisp" | "off";

export const motionPresets: Record<
  PresetKey,
  { label: string; hint: string; values: MotionSettings }
> = {
  signature: {
    label: "Фирменное",
    hint: "Текущий язык ВНЕ: мягкое проявление с расфокусом.",
    values: defaultMotionSettings,
  },
  calm: {
    label: "Спокойное",
    hint: "Короткие переходы, минимум смещения, без наклона.",
    values: {
      ...defaultMotionSettings,
      revealStyle: "fade",
      duration: 0.5,
      distance: 8,
      blur: 0,
      heroStagger: 0.12,
      tilt: false,
      magneticStrength: 0.1,
      scramble: false,
      shimmer: false,
      progressiveBlur: false,
      textHeadingStyle: "fade",
      textBodyStyle: "fade",
      textAccentStyle: "fade",
      textSplit: "line",
      textDuration: 0.48,
      textStagger: 0.025,
      textDistance: 6,
      textBlur: 0,
    },
  },
  cinematic: {
    label: "Кинематографичное",
    hint: "Длинные плавные появления и выраженные паузы.",
    values: {
      ...defaultMotionSettings,
      duration: 1.4,
      distance: 28,
      blur: 12,
      heroStagger: 0.32,
      tiltDeg: 4,
      pageDuration: 0.7,
      textHeadingStyle: "mask",
      textBodyStyle: "blur",
      textAccentStyle: "rise",
      textSplit: "word",
      textDuration: 1.05,
      textStagger: 0.055,
      textDistance: 24,
      textBlur: 12,
    },
  },
  crisp: {
    label: "Чёткое",
    hint: "Быстрые точные отклики без размытия.",
    values: {
      ...defaultMotionSettings,
      revealStyle: "rise",
      duration: 0.32,
      ease: "inOut",
      distance: 12,
      blur: 0,
      heroStagger: 0.08,
      springStiffness: 420,
      springDamping: 34,
      menuStagger: 0.03,
      pageDuration: 0.28,
      textHeadingStyle: "rise",
      textBodyStyle: "fade",
      textAccentStyle: "rise",
      textSplit: "character",
      textDuration: 0.32,
      textStagger: 0.012,
      textDistance: 10,
      textBlur: 0,
    },
  },
  off: {
    label: "Без движения",
    hint: "Всё появляется сразу, интерактивные эффекты выключены.",
    values: {
      ...defaultMotionSettings,
      revealStyle: "none",
      duration: 0,
      distance: 0,
      blur: 0,
      heroStagger: 0,
      magnetic: false,
      tilt: false,
      press: false,
      scramble: false,
      menuMotion: false,
      progressiveBlur: false,
      imageReveal: false,
      glow: false,
      shimmer: false,
      dialogMotion: false,
      pageTransition: false,
      pageDuration: 0,
      textEnabled: false,
      textHeadingStyle: "none",
      textBodyStyle: "none",
      textAccentStyle: "none",
      textDuration: 0,
      textStagger: 0,
      rollEnabled: false,
      loopEnabled: false,
      animatedBackground: false,
      faqMotion: false,
      sectionEnabled: false,
    },
  },
};

export const MOTION_SETTINGS_KEY = "vne.motion.settings";
export const MOTION_SETTINGS_EVENT = "vne:motion-settings";

export function sanitizeMotionSettings(input: unknown): MotionSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaultMotionSettings;
  const raw = input as Record<string, unknown>;
  const num = (key: keyof MotionSettings, min: number, max: number) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : (defaultMotionSettings[key] as number);
  };
  const bool = (key: keyof MotionSettings) =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : (defaultMotionSettings[key] as boolean);
  const styles: RevealStyle[] = ["fade", "rise", "blur", "scale", "none"];
  const textStyles: TextAnimationStyle[] = ["fade", "rise", "blur", "mask", "scale", "none"];
  const textSplits: TextSplit[] = ["block", "line", "word", "character"];
  const scrambleDirections: ScrambleDirection[] = ["left", "right", "random"];
  const scrambleCharsets: ScrambleCharset[] = ["auto", "mixed", "symbols"];
  const record = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawGroups = record(raw["scrambleGroups"]);
  const rawTargets = record(raw["scrambleTargets"]);
  const cleanGroups = Object.fromEntries(
    scrambleGroups.map(({ id }) => [
      id,
      typeof rawGroups[id] === "boolean" ? rawGroups[id] : defaultScrambleGroups[id],
    ]),
  ) as Record<ScrambleGroupId, boolean>;
  const cleanTargets = Object.fromEntries(
    Object.keys(defaultScrambleTargets).map((id) => [
      id,
      typeof rawTargets[id] === "boolean"
        ? rawTargets[id]
        : defaultScrambleTargets[id as ScrambleTargetId],
    ]),
  ) as Record<ScrambleTargetId, boolean>;
  const textStyle = (key: "textHeadingStyle" | "textBodyStyle" | "textAccentStyle") =>
    textStyles.includes(raw[key] as TextAnimationStyle)
      ? (raw[key] as TextAnimationStyle)
      : defaultMotionSettings[key];
  return {
    revealStyle: styles.includes(raw["revealStyle"] as RevealStyle)
      ? (raw["revealStyle"] as RevealStyle)
      : defaultMotionSettings.revealStyle,
    ease: raw["ease"] === "inOut" ? "inOut" : "out",
    duration: num("duration", 0, 2.5),
    distance: num("distance", 0, 80),
    blur: num("blur", 0, 24),
    scaleFrom: num("scaleFrom", 0.8, 1),
    heroStagger: num("heroStagger", 0, 0.8),
    magnetic: bool("magnetic"),
    magneticStrength: num("magneticStrength", 0, 0.6),
    magneticMaxOffset: num("magneticMaxOffset", 0, 24),
    tilt: bool("tilt"),
    tiltDeg: num("tiltDeg", 0, 12),
    press: bool("press"),
    pressHover: num("pressHover", 1, 1.1),
    pressTap: num("pressTap", 0.9, 1),
    scramble: bool("scramble"),
    springStiffness: num("springStiffness", 40, 600),
    springDamping: num("springDamping", 5, 60),
    menuMotion: bool("menuMotion"),
    menuStagger: num("menuStagger", 0, 0.16),
    progressiveBlur: bool("progressiveBlur"),
    imageReveal: bool("imageReveal"),
    imageScaleFrom: num("imageScaleFrom", 1, 1.12),
    glow: bool("glow"),
    shimmer: bool("shimmer"),
    dialogMotion: bool("dialogMotion"),
    pageTransition: bool("pageTransition"),
    pageDuration: num("pageDuration", 0, 1.2),
    textEnabled: bool("textEnabled"),
    textHeadingStyle: textStyle("textHeadingStyle"),
    textBodyStyle: textStyle("textBodyStyle"),
    textAccentStyle: textStyle("textAccentStyle"),
    textSplit: textSplits.includes(raw["textSplit"] as TextSplit)
      ? (raw["textSplit"] as TextSplit)
      : defaultMotionSettings.textSplit,
    textDuration: num("textDuration", 0, 2.5),
    textDelay: num("textDelay", 0, 1.5),
    textStagger: num("textStagger", 0, 0.2),
    textDistance: num("textDistance", 0, 80),
    textBlur: num("textBlur", 0, 24),
    textScaleFrom: num("textScaleFrom", 0.8, 1),
    textViewportAmount: num("textViewportAmount", 0, 1),
    textRepeat: bool("textRepeat"),
    textHeroSequence: bool("textHeroSequence"),
    textButtons: bool("textButtons"),
    textCards: bool("textCards"),
    textAdmin: bool("textAdmin"),
    // Старые настройки: shatterEnabled переносится в rollEnabled, прочие поля Shatter игнорируются.
    rollEnabled:
      typeof raw["rollEnabled"] === "boolean"
        ? (raw["rollEnabled"] as boolean)
        : typeof raw["shatterEnabled"] === "boolean"
          ? (raw["shatterEnabled"] as boolean)
          : defaultMotionSettings.rollEnabled,
    rollDuration: num("rollDuration", 0.5, 0.75),
    loopEnabled: bool("loopEnabled"),
    loopInterval: num("loopInterval", 4, 5),
    loopDuration: num("loopDuration", 0.3, 0.6),
    animatedBackground: bool("animatedBackground"),
    backgroundDuration: num("backgroundDuration", 0.16, 0.36),
    faqMotion: bool("faqMotion"),
    scrambleDuration: num("scrambleDuration", 0.2, 1.5),
    scrambleTick: num("scrambleTick", 0.025, 0.12),
    scrambleDelay: num("scrambleDelay", 0, 0.5),
    scrambleIntensity: num("scrambleIntensity", 0.1, 1),
    scrambleDirection: scrambleDirections.includes(raw["scrambleDirection"] as ScrambleDirection)
      ? (raw["scrambleDirection"] as ScrambleDirection)
      : defaultMotionSettings.scrambleDirection,
    scrambleCharset: scrambleCharsets.includes(raw["scrambleCharset"] as ScrambleCharset)
      ? (raw["scrambleCharset"] as ScrambleCharset)
      : defaultMotionSettings.scrambleCharset,
    scrambleRepeat: bool("scrambleRepeat"),
    scrambleGroups: cleanGroups,
    scrambleTargets: cleanTargets,
    sectionEnabled: bool("sectionEnabled"),
    sectionIntensity: num("sectionIntensity", 0.55, 1),
    sectionStart: num("sectionStart", 0, 0.45),
    sectionEnd: num("sectionEnd", 0.55, 1),
  };
}

export function readStoredMotionSettings(): MotionSettings {
  if (typeof window === "undefined") return defaultMotionSettings;
  try {
    const raw = window.localStorage.getItem(MOTION_SETTINGS_KEY);
    return raw ? sanitizeMotionSettings(JSON.parse(raw)) : defaultMotionSettings;
  } catch {
    return defaultMotionSettings;
  }
}

export function writeStoredMotionSettings(settings: MotionSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOTION_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* хранилище недоступно — настройки живут только в этой вкладке */
  }
  window.dispatchEvent(new CustomEvent(MOTION_SETTINGS_EVENT, { detail: settings }));
}

/** Вложенные boolean-карты сравниваются по известным ключам пресета, а не по ссылке. */
function sameSettingValue(expected: unknown, actual: unknown): boolean {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(e), ...Object.keys(a)]);
    for (const k of keys) {
      if (typeof e[k] !== "boolean" || typeof a[k] !== "boolean" || e[k] !== a[k]) return false;
    }
    return true;
  }
  return Object.is(expected, actual);
}

export function matchPreset(settings: MotionSettings): PresetKey | null {
  const keys = Object.keys(motionPresets) as PresetKey[];
  return (
    keys.find((key) => {
      // Сравнение по значениям известных полей, без зависимости от порядка ключей.
      const values = motionPresets[key].values as Record<string, unknown>;
      const current = settings as unknown as Record<string, unknown>;
      return Object.keys(values).every((k) => sameSettingValue(values[k], current[k]));
    }) ?? null
  );
}

/** Версия схемы экспорта настроек. */
export const MOTION_SCHEMA_VERSION = 6;

export function exportMotionSettings(settings: MotionSettings) {
  return JSON.stringify({ schemaVersion: MOTION_SCHEMA_VERSION, ...settings }, null, 2);
}

export type ImportResult = { ok: true; settings: MotionSettings } | { ok: false; error: string };

/**
 * Проверяет структуру до санитизации: не-объекты, массивы, чужие схемы и будущие
 * версии отклоняются без изменения текущих настроек. Старый объект без версии
 * мигрирует: недостающие поля берутся из текущих значений, а не сбрасываются.
 */
export function parseImportedSettings(raw: string, current: MotionSettings): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Это не JSON. Проверьте кавычки и скобки." };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data))
    return { ok: false, error: "Ожидается объект настроек в фигурных скобках." };
  const obj = { ...(data as Record<string, unknown>) };
  // Миграции v1–v5: Text Shatter заменён на Text Roll; новые поля
  // добавляются из текущих настроек без сброса пользовательских значений.
  if (typeof obj["shatterEnabled"] === "boolean" && !("rollEnabled" in obj))
    obj["rollEnabled"] = obj["shatterEnabled"];
  const version = obj["schemaVersion"];
  if (
    version !== undefined &&
    (typeof version !== "number" || version > MOTION_SCHEMA_VERSION || version < 1)
  )
    return { ok: false, error: "Версия настроек не поддерживается этой версией сайта." };
  const known = (Object.keys(defaultMotionSettings) as (keyof MotionSettings)[]).filter(
    (k) => k in obj,
  );
  if (known.length === 0) return { ok: false, error: "В тексте нет знакомых параметров движения." };
  const merged: Record<string, unknown> = { ...current };
  for (const k of known) {
    if (k === "scrambleGroups" || k === "scrambleTargets") {
      const incoming = obj[k];
      merged[k] =
        incoming && typeof incoming === "object" && !Array.isArray(incoming)
          ? { ...current[k], ...(incoming as Record<string, unknown>) }
          : incoming;
    } else merged[k] = obj[k];
  }
  return { ok: true, settings: sanitizeMotionSettings(merged) };
}
