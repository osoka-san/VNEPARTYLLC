export type EventBackgroundSettings = {
  enabled: boolean;
  animated: boolean;
  color: string;
  highlight: string;
  background: string;
  speed: number;
  density: number;
  size: number;
  opacity: number;
  glow: number;
  direction: "down" | "up";
  characters: "katakana" | "binary" | "symbols";
};

/** Separate art direction for each published event; no event or admission data. */
export const defaultEventBackgrounds: Record<string, EventBackgroundSettings> = {
  "light-study-01": {
    enabled: true,
    animated: true,
    color: "#30e5ad",
    highlight: "#c7fff0",
    background: "#070a09",
    speed: 0.65,
    density: 42,
    size: 17,
    opacity: 0.38,
    glow: 6,
    direction: "down",
    characters: "katakana",
  },
  "threshold-study-02": {
    enabled: true,
    animated: true,
    color: "#e55330",
    highlight: "#ffd4a6",
    background: "#0e0a09",
    speed: 0.95,
    density: 30,
    size: 20,
    opacity: 0.34,
    glow: 9,
    direction: "up",
    characters: "symbols",
  },
};

export function eventBackgroundDefault(slug: string): EventBackgroundSettings {
  if (Object.hasOwn(defaultEventBackgrounds, slug)) return { ...defaultEventBackgrounds[slug]! };
  // Future event pages get a stable variation, never random SSR/hydration output.
  const seed = Array.from(slug).reduce((n, c) => n + c.charCodeAt(0), 0);
  const base = Object.values(defaultEventBackgrounds)[seed % 2]!;
  return { ...base, speed: 0.6 + (seed % 7) * 0.1, density: 30 + (seed % 10) * 2 };
}

export function sanitizeEventBackground(
  input: unknown,
  fallback: EventBackgroundSettings,
): EventBackgroundSettings {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const number = (
    key: "speed" | "density" | "size" | "opacity" | "glow",
    min: number,
    max: number,
  ) =>
    typeof raw[key] === "number" && Number.isFinite(raw[key])
      ? Math.min(max, Math.max(min, raw[key]))
      : fallback[key];
  const color = (key: "color" | "highlight" | "background") =>
    typeof raw[key] === "string" && /^#[0-9a-f]{6}$/i.test(raw[key])
      ? raw[key].toLowerCase()
      : fallback[key];
  return {
    enabled: typeof raw["enabled"] === "boolean" ? raw["enabled"] : fallback.enabled,
    animated: typeof raw["animated"] === "boolean" ? raw["animated"] : fallback.animated,
    color: color("color"),
    highlight: color("highlight"),
    background: color("background"),
    speed: number("speed", 0.25, 2),
    density: Math.round(number("density", 12, 64)),
    size: Math.round(number("size", 12, 28)),
    opacity: number("opacity", 0.05, 0.65),
    glow: number("glow", 0, 14),
    direction:
      raw["direction"] === "up" || raw["direction"] === "down"
        ? raw["direction"]
        : fallback.direction,
    characters: ["katakana", "binary", "symbols"].includes(raw["characters"] as string)
      ? (raw["characters"] as EventBackgroundSettings["characters"])
      : fallback.characters,
  };
}

export function sanitizeEventBackgrounds(input: unknown): Record<string, EventBackgroundSettings> {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const slugs = new Set([
    ...Object.keys(defaultEventBackgrounds),
    ...Object.keys(raw)
      .filter((s) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s))
      .slice(0, 24),
  ]);
  return Object.fromEntries(
    Array.from(slugs, (slug) => [
      slug,
      sanitizeEventBackground(raw[slug], eventBackgroundDefault(slug)),
    ]),
  );
}

export function eventBackgroundFor(
  settings: Record<string, EventBackgroundSettings>,
  slug: string,
) {
  return Object.hasOwn(settings, slug) ? settings[slug]! : eventBackgroundDefault(slug);
}
