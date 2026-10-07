import {
  defaultMotionSettings,
  sanitizeMotionSettings,
  type MotionSettings,
} from "./motion-settings";
export const PREVIEW_GROUPS = [
  {
    id: "reveal",
    label: "Появление блоков",
    keys: ["revealStyle", "duration", "ease", "distance", "blur", "scaleFrom", "heroStagger"],
  },
  {
    id: "text",
    label: "Текст, Roll и Loop",
    keys: Object.keys(defaultMotionSettings).filter((k) => /^(text|roll|loop)/.test(k)),
  },
  {
    id: "pointer",
    label: "Курсор и нажатия",
    keys: Object.keys(defaultMotionSettings).filter((k) => /^(magnetic|tilt|press|spring)/.test(k)),
  },
  {
    id: "scramble",
    label: "Text Scramble",
    keys: Object.keys(defaultMotionSettings).filter((k) => /^scramble/.test(k)),
  },
  {
    id: "navigation",
    label: "Меню, окна и переходы",
    keys: [
      "menuMotion",
      "menuStagger",
      "dialogMotion",
      "pageTransition",
      "pageDuration",
      "faqMotion",
    ],
  },
  {
    id: "visuals",
    label: "Изображения, фон и подсветка",
    keys: [
      "progressiveBlur",
      "imageReveal",
      "imageScaleFrom",
      "glow",
      "shimmer",
      "animatedBackground",
      "backgroundDuration",
      "sectionEnabled",
      "sectionIntensity",
      "sectionStart",
      "sectionEnd",
    ],
  },
  {
    id: "event-backgrounds",
    label: "Фоны событий",
    keys: ["eventBackgrounds"],
  },
  { id: "loading", label: "Загрузка сайта", keys: ["loading"] },
  { id: "navbar", label: "Навбар", keys: ["navbar"] },
] as const;
export type PreviewGroupId = (typeof PREVIEW_GROUPS)[number]["id"];
export type PreviewDefaults = {
  version: number;
  settings: MotionSettings;
  updatedAt: string | null;
  groups?: PreviewGroupId[];
};
export function mergePreviewGroups(
  base: MotionSettings,
  incoming: MotionSettings,
  groups: readonly string[],
): MotionSettings {
  const result = { ...base } as Record<string, unknown>,
    clean = sanitizeMotionSettings(incoming) as unknown as Record<string, unknown>;
  for (const group of PREVIEW_GROUPS)
    if (groups.includes(group.id)) for (const key of group.keys) result[key] = clean[key];
  return sanitizeMotionSettings(result);
}
export function changedPreviewGroups(
  current: MotionSettings,
  baseline: MotionSettings,
): PreviewGroupId[] {
  return PREVIEW_GROUPS.filter((g) =>
    g.keys.some(
      (k) =>
        JSON.stringify(current[k as keyof MotionSettings]) !==
        JSON.stringify(baseline[k as keyof MotionSettings]),
    ),
  ).map((g) => g.id);
}
export async function requestPreviewDefaults(payload?: {
  expectedVersion: number;
  groups: readonly string[];
  settings: MotionSettings;
}): Promise<PreviewDefaults> {
  const response = await fetch("/api/site-admin/defaults", {
    method: payload ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    ...(payload
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok)
    throw new Error(
      data.error === "VERSION_CONFLICT"
        ? "Общие настройки уже изменены. Нажмите «Актуализировать настройки» перед сохранением."
        : data.error === "PERMISSION_DENIED"
          ? "Общие настройки может сохранять только администратор."
          : data.error === "AUTH_REQUIRED"
            ? "Сеанс завершён. Войдите снова."
            : "Не удалось загрузить или сохранить общие настройки. Повторите попытку.",
    );
  return {
    version: data.version,
    settings: sanitizeMotionSettings(data.settings),
    updatedAt: data.updatedAt,
    ...(data.groups ? { groups: data.groups } : {}),
  };
}
