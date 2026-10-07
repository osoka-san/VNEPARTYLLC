export const ENGINE_VERSION = "vne-glyphs-0.5.0";
export const NEW_RENDERER_ENGINES = {
  origami: "vne-origami-1.0.0",
  basalt: "vne-basalt-1.0.0",
  portals: "vne-portals-1.0.0",
  constellation: "vne-constellation-1.0.0",
  folds: "vne-folds-1.0.0",
  weave: "vne-weave-1.0.0",
} as const;
export const ORIGAMI_ENGINE_VERSION = NEW_RENDERER_ENGINES.origami;
export type RenderEngineVersion =
  typeof ENGINE_VERSION | (typeof NEW_RENDERER_ENGINES)[keyof typeof NEW_RENDERER_ENGINES];
export function engineForPattern(pattern: { template?: string }): RenderEngineVersion {
  return pattern.template && Object.hasOwn(NEW_RENDERER_ENGINES, pattern.template)
    ? NEW_RENDERER_ENGINES[pattern.template as keyof typeof NEW_RENDERER_ENGINES]
    : ENGINE_VERSION;
}
export function supportsPatternEngine(engine: unknown, pattern: { template?: string }) {
  return (
    engine === ENGINE_VERSION || (engine !== undefined && engine === engineForPattern(pattern))
  );
}
export const TEMPLATE_IDS = [
  "coupling",
  "syncopa",
  "dialogue",
  "flow",
  "circle",
  "shift",
  "ribs",
  "folds",
  "enamel",
  "relief",
  "basalt",
  "portals",
  "weave",
  "origami",
  "constellation",
  "marble",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export type Pattern = {
  schema: 1;
  template?: TemplateId;
  name: string;
  event: string;
  geometry: "syncopa" | "flow";
  palette: "mint" | "night" | "paper";
  rounding: number;
  accents: boolean;
};
export const PATTERNS: [Pattern, Pattern] = [
  {
    schema: 1,
    name: "Синкопа",
    event: "",
    geometry: "syncopa",
    palette: "night",
    rounding: 0.44,
    accents: true,
  },
  {
    schema: 1,
    name: "Встречный поток",
    event: "",
    geometry: "flow",
    palette: "mint",
    rounding: 0.36,
    accents: true,
  },
];
export const PALETTES = {
  mint: { bg: "#30E5AD", fg: "#070A09", accent: "#E55330" },
  night: { bg: "#070A09", fg: "#30E5AD", accent: "#E55330" },
  paper: { bg: "#EDF2EE", fg: "#070A09", accent: "#E55330" },
};
export function parsePattern(value: unknown): Pattern {
  if (!value || typeof value !== "object") throw new Error("Некорректный файл паттерна.");
  const p = value as Record<string, unknown>;
  if (
    p["schema"] !== 1 ||
    (p["template"] !== undefined && !TEMPLATE_IDS.includes(p["template"] as TemplateId)) ||
    typeof p["name"] !== "string" ||
    !p["name"].trim() ||
    p["name"].length > 60 ||
    typeof p["event"] !== "string" ||
    p["event"].length > 100 ||
    typeof p["geometry"] !== "string" ||
    !["syncopa", "flow"].includes(p["geometry"]) ||
    typeof p["palette"] !== "string" ||
    !["mint", "night", "paper"].includes(p["palette"]) ||
    typeof p["rounding"] !== "number" ||
    !Number.isFinite(p["rounding"]) ||
    p["rounding"] < 0 ||
    p["rounding"] > 0.46 ||
    typeof p["accents"] !== "boolean"
  )
    throw new Error("Формат или настройки паттерна не поддерживаются.");
  return {
    schema: 1,
    ...(p["template"] !== undefined ? { template: p["template"] as TemplateId } : {}),
    name: p["name"],
    event: p["event"],
    geometry: p["geometry"] as Pattern["geometry"],
    palette: p["palette"] as Pattern["palette"],
    rounding: p["rounding"],
    accents: p["accents"],
  };
}
export function patternFile(pattern: Pattern) {
  return {
    fileSchema: 1,
    engineVersion: engineForPattern(pattern),
    pattern: parsePattern(pattern),
  };
}
export function readPatternFile(value: unknown) {
  if (value && typeof value === "object" && "fileSchema" in value) {
    const file = value as Record<string, unknown>;
    if (
      file["fileSchema"] !== 1 ||
      ![
        ENGINE_VERSION,
        ...Object.values(NEW_RENDERER_ENGINES),
        "vne-glyphs-0.4.0",
        "vne-glyphs-0.3.0",
        "vne-glyphs-0.2.0",
      ].includes(String(file["engineVersion"]))
    )
      throw new Error(
        "Файл создан другой версией генератора. Его оформление нельзя воспроизвести в текущей версии.",
      );
    const pattern = parsePattern(file["pattern"]);
    if (
      Object.values(NEW_RENDERER_ENGINES).includes(
        file["engineVersion"] as (typeof NEW_RENDERER_ENGINES)[keyof typeof NEW_RENDERER_ENGINES],
      ) &&
      !supportsPatternEngine(file["engineVersion"], pattern)
    )
      throw new Error("Версия оформления не соответствует выбранному стилю.");
    return { pattern, legacy: file["engineVersion"] !== engineForPattern(pattern) };
  }
  return { pattern: parsePattern(value), legacy: true };
}
