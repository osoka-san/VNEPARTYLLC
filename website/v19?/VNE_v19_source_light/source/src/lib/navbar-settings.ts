export const NAVBAR_ACCENTS = {
  orange: { label: "Оранжевый ВНЕ", color: "#E55330" },
  blue: { label: "Голубой ВНЕ", color: "#86ABFF" },
  mint: { label: "Мятный ВНЕ", color: "#30E5AD" },
} as const;
export const NAVBAR_RANGES = {
  width: { label: "Ширина на компьютере", min: 960, max: 1440, step: 16, unit: "px" },
  height: { label: "Высота панели", min: 52, max: 72, step: 2, unit: "px" },
  radius: { label: "Скругление", min: 0, max: 28, step: 1, unit: "px" },
  offset: { label: "Отступ сверху", min: 4, max: 16, step: 1, unit: "px" },
  opacity: { label: "Плотность фона", min: 0.7, max: 1, step: 0.01, unit: "%" },
  heroOpacity: { label: "Плотность на главной", min: 0.4, max: 1, step: 0.01, unit: "%" },
  blur: { label: "Размытие фона", min: 0, max: 32, step: 1, unit: "px" },
  logoWidth: { label: "Размер логотипа", min: 64, max: 120, step: 2, unit: "px" },
} as const;
export type NavbarSettings = Record<keyof typeof NAVBAR_RANGES, number> & {
  accent: keyof typeof NAVBAR_ACCENTS;
  inviteLabel: string;
  showInvite: boolean;
  showEvents: boolean;
  showAbout: boolean;
  showMember: boolean;
  showChapters: boolean;
};
export const defaultNavbarSettings: NavbarSettings = {
  width: 1136,
  height: 52,
  radius: 12,
  offset: 6,
  opacity: 0.94,
  heroOpacity: 0.67,
  blur: 22,
  logoWidth: 80,
  accent: "orange",
  inviteLabel: "Приглашение",
  showInvite: true,
  showEvents: true,
  showAbout: true,
  showMember: true,
  showChapters: true,
};
export function sanitizeNavbarSettings(input: unknown): NavbarSettings {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const result = { ...defaultNavbarSettings };
  for (const key of Object.keys(NAVBAR_RANGES) as (keyof typeof NAVBAR_RANGES)[]) {
    const value = raw[key],
      range = NAVBAR_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value))
      result[key] = Math.min(range.max, Math.max(range.min, value));
  }
  for (const key of [
    "showInvite",
    "showEvents",
    "showAbout",
    "showMember",
    "showChapters",
  ] as const)
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  if (typeof raw["accent"] === "string" && Object.hasOwn(NAVBAR_ACCENTS, raw["accent"]))
    result.accent = raw["accent"] as NavbarSettings["accent"];
  if (typeof raw["inviteLabel"] === "string") {
    const label = raw["inviteLabel"]
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 18);
    if (label) result.inviteLabel = label;
  }
  return result;
}
export function navbarVariables(s: NavbarSettings): Record<string, string> {
  return {
    "--navbar-width": `${s.width}px`,
    "--navbar-height": `${s.height}px`,
    "--navbar-radius": `${s.radius}px`,
    "--navbar-offset": `${s.offset}px`,
    "--navbar-opacity": String(s.opacity),
    "--navbar-hero-opacity": String(s.heroOpacity),
    "--navbar-blur": `${s.blur}px`,
    "--navbar-logo-width": `${s.logoWidth}px`,
    "--navbar-accent": NAVBAR_ACCENTS[s.accent].color,
  };
}
