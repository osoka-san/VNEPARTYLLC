import approvedMotionDefaults from "../config/motion-defaults.schema9.json";

export const LOADING_MODES = [
  { id: "wormhole", label: "Туннель", hint: "Кольца уходят в глубину — исходный Wormhole." },
  { id: "pulse", label: "Пульсация", hint: "Мягкие расходящиеся световые волны." },
  { id: "orbit", label: "Орбита", hint: "Светящиеся кольца движутся по кругу." },
  { id: "static", label: "Статичный", hint: "Одно светящееся кольцо без движения." },
  { id: "off", label: "Выключен", hint: "Сайт загружается без общей стеклянной пелены." },
] as const;

export type LoadingSettings = {
  mode: (typeof LOADING_MODES)[number]["id"];
  direction: "forward" | "reverse";
  speed: number;
  ringCount: number;
  size: number;
  mobileScale: number;
  spread: number;
  travel: number;
  stroke: number;
  brightness: number;
  glow: number;
  opacity: number;
  mint: string;
  cyan: string;
  highlight: string;
  background: string;
  darkness: number;
  blur: number;
  mobileBlur: number;
  saturation: number;
  showBrand: boolean;
  showLabel: boolean;
  showPercent: boolean;
  percentScale: number;
  percentGap: number;
  showDelay: number;
  minVisible: number;
  transition: number;
  slowAfter: number;
};

export const defaultLoadingSettings: LoadingSettings =
  approvedMotionDefaults.loading as LoadingSettings;

export const LOADING_RANGES = {
  speed: { label: "Скорость", min: 0.25, max: 2.5, step: 0.05, unit: "×" },
  ringCount: { label: "Количество колец", min: 3, max: 16, step: 1, unit: "" },
  size: { label: "Диаметр кольца", min: 24, max: 80, step: 1, unit: " px" },
  mobileScale: { label: "Масштаб на телефоне", min: 0.6, max: 1.2, step: 0.05, unit: "×" },
  spread: { label: "Глубина / размах", min: 1.2, max: 3, step: 0.1, unit: "×" },
  travel: { label: "Смещение колец", min: 0, max: 16, step: 1, unit: " px" },
  stroke: { label: "Толщина контура", min: 0, max: 3, step: 0.25, unit: " px" },
  brightness: { label: "Яркость", min: 0.5, max: 2, step: 0.05, unit: "×" },
  glow: { label: "Сила свечения", min: 0, max: 2, step: 0.05, unit: "×" },
  opacity: { label: "Непрозрачность колец", min: 0.2, max: 1, step: 0.05, unit: "" },
  darkness: { label: "Затемнение фона", min: 0, max: 0.85, step: 0.01, unit: "" },
  blur: { label: "Размытие на компьютере", min: 0, max: 30, step: 0.5, unit: " px" },
  mobileBlur: { label: "Размытие на телефоне", min: 0, max: 24, step: 0.5, unit: " px" },
  saturation: { label: "Насыщенность фона", min: 0, max: 1.5, step: 0.05, unit: "×" },
  percentScale: { label: "Размер индикатора", min: 0.35, max: 1.5, step: 0.05, unit: "×" },
  percentGap: { label: "Отступ от воронки", min: 0, max: 48, step: 1, unit: " px" },
  showDelay: { label: "Задержка перед показом", min: 0, max: 1000, step: 20, unit: " мс" },
  minVisible: { label: "Минимальное время показа", min: 0, max: 1200, step: 20, unit: " мс" },
  transition: { label: "Плавность появления", min: 0, max: 600, step: 20, unit: " мс" },
  slowAfter: {
    label: "Предложить продолжить через",
    min: 5000,
    max: 20000,
    step: 1000,
    unit: " мс",
  },
} as const;
export type LoadingRangeKey = keyof typeof LOADING_RANGES;

export function sanitizeLoadingSettings(input: unknown): LoadingSettings {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const result = { ...defaultLoadingSettings };
  for (const [key, range] of Object.entries(LOADING_RANGES)) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value))
      result[key as LoadingRangeKey] = Math.min(range.max, Math.max(range.min, value));
  }
  result.ringCount = Math.round(result.ringCount);
  for (const key of ["mint", "cyan", "highlight", "background"] as const) {
    const value = raw[key];
    if (typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value))
      result[key] = value.toLowerCase();
  }
  for (const key of ["showBrand", "showLabel", "showPercent"] as const)
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  if (LOADING_MODES.some((mode) => mode.id === raw["mode"]))
    result.mode = raw["mode"] as LoadingSettings["mode"];
  if (raw["direction"] === "reverse") result.direction = "reverse";
  return result;
}

export const LOADING_PRESETS = [
  { label: "Неон ВНЕ", values: defaultLoadingSettings },
  {
    label: "Мягкий свет",
    values: {
      ...defaultLoadingSettings,
      stroke: 0,
      glow: 0.65,
      mint: "#30e5ad",
      cyan: "#64eee3",
      darkness: 0.27,
      blur: 10,
      mobileBlur: 8,
    },
  },
  {
    label: "Спокойный",
    values: {
      ...defaultLoadingSettings,
      mode: "pulse",
      speed: 0.55,
      ringCount: 5,
      stroke: 0.5,
      glow: 0.65,
    },
  },
] satisfies { label: string; values: LoadingSettings }[];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
/** Only sanitized scalar values enter CSS, including server-rendered first paint. */
export function loadingVariables(
  input: LoadingSettings,
  reduced = false,
): Record<`--${string}`, string> {
  const s = sanitizeLoadingSettings(input);
  const staticMode = reduced || s.mode === "static";
  return {
    "--loading-mint": s.mint,
    "--loading-cyan": s.cyan,
    "--loading-mint-rgb": rgb(s.mint),
    "--loading-cyan-rgb": rgb(s.cyan),
    "--loading-highlight-rgb": rgb(s.highlight),
    "--loading-background-rgb": rgb(s.background),
    "--loading-darkness": String(s.darkness),
    "--loading-blur": `${s.blur}px`,
    "--loading-mobile-blur": `${s.mobileBlur}px`,
    "--loading-saturation": String(s.saturation),
    "--loading-transition": `${s.transition}ms`,
    "--loading-display": s.mode === "off" ? "none" : "grid",
    "--loading-brand-display": s.showBrand ? "block" : "none",
    "--loading-label-display": s.showLabel ? "inline" : "none",
    "--loading-percent-display": s.showPercent ? "flex" : "none",
    "--loading-percent-scale": String(s.percentScale),
    "--loading-percent-gap": `${s.percentGap}px`,
    "--loader-animation": staticMode
      ? "none"
      : s.mode === "pulse"
        ? "vne-wormhole-pulse"
        : s.mode === "orbit"
          ? "vne-wormhole-orbit"
          : "vne-wormhole-scale",
    "--loader-static-opacity": staticMode ? "1" : "0",
    "--loader-direction": s.direction === "reverse" ? "reverse" : "normal",
    "--loader-duration": `${3 / s.speed}s`,
    "--loader-count": String(s.ringCount),
    "--loader-size": `${s.size}px`,
    "--loader-mobile-scale": String(s.mobileScale),
    "--loader-spread": String(s.spread),
    "--loader-travel": `${s.travel}px`,
    "--loader-stroke": `${s.stroke}px`,
    "--loader-brightness": String(s.brightness),
    "--loader-opacity": String(s.opacity),
    "--wormhole-core": `${6 * s.glow}px`,
    "--wormhole-glow": `${26 * s.glow}px`,
    "--wormhole-aura": `${48 * s.glow}px`,
    "--wormhole-inner": `${10 * s.glow}px`,
    "--loader-glow": String(s.glow),
    "--loader-glow-alpha": String(Math.min(1, s.glow)),
  };
}

export function readLoadingBootstrap(): LoadingSettings | null {
  if (typeof document === "undefined") return null;
  try {
    const data = document.getElementById("vne-loading-defaults")?.textContent;
    return data ? sanitizeLoadingSettings(JSON.parse(data)) : null;
  } catch {
    return null;
  }
}
