import { NEW_RENDERER_ENGINES, type Pattern, type TemplateId, TEMPLATE_IDS } from "./pattern";
import { isPassAccess } from "./pass-palette";
import type { PassAccess } from "@/components/tickets/types";
export type QrTemplate = {
  id: TemplateId;
  collection: "graphic" | "material";
  number: string;
  name: string;
  description: string;
  pattern: Pattern;
};
const definitions: [TemplateId, string, string, Pattern["geometry"], Pattern["palette"], number][] =
  [
    ["coupling", "Сцепление", "Соединённые дуги на светлом поле", "flow", "paper", 0.4],
    ["syncopa", "Синкопа", "Мятный ритм на чёрном", "syncopa", "night", 0.44],
    ["dialogue", "Диалог", "Чёрные изгибы и мандариновые акценты", "syncopa", "mint", 0.42],
    ["flow", "Встречный поток", "Направленные линии и открытые срезы", "flow", "mint", 0.36],
    ["circle", "Внутренний круг", "Петли и внутренние дуги", "syncopa", "night", 0.46],
    ["shift", "Тихий сдвиг", "Горизонтальный ритм на светлом поле", "flow", "paper", 0.34],
    ["ribs", "Рёбра", "Мятные формы с частым рельефом", "syncopa", "night", 0.44],
    ["folds", "Складки", "Мандариновые ленты и сгибы", "flow", "night", 0.32],
    ["enamel", "Эмаль", "Гладкая мятная поверхность и блики", "syncopa", "night", 0.46],
    ["relief", "Рельеф", "Тонкие линии по цельному контуру", "syncopa", "night", 0.46],
    ["basalt", "Базальт", "Тёмный камень на мятном поле", "flow", "mint", 0.18],
    ["portals", "Порталы", "Вложенные рамки и архитектурные грани", "flow", "night", 0.14],
    ["weave", "Плетение", "Пересечения нитей и тёплые акценты", "flow", "night", 0.28],
    ["origami", "Оригами", "Складчатые плоскости и острые грани", "flow", "night", 0.1],
    ["constellation", "Созвездие", "Мятные и мандариновые бусины", "syncopa", "night", 0.46],
    ["marble", "Мрамор", "Зелёный камень с тонкими прожилками", "syncopa", "night", 0.46],
  ];
export const QR_TEMPLATES: QrTemplate[] = definitions.map(
  ([id, name, description, geometry, palette, rounding], i) => ({
    id,
    name,
    description,
    number: String(i < 6 ? i + 1 : i - 5).padStart(2, "0"),
    collection: i < 6 ? "graphic" : "material",
    pattern: {
      schema: 1,
      template: id,
      name,
      event: "",
      geometry,
      palette,
      rounding,
      accents: true,
    },
  }),
);
/** Current selection only. Full registry below remains readable for saved recipes. */
export const QR_STUDIO_TEMPLATES: QrTemplate[] = [
  "origami",
  "basalt",
  "portals",
  "constellation",
  "weave",
  "folds",
].map((id, index) => ({
  ...QR_TEMPLATES.find((t) => t.id === id)!,
  number: String(index + 1).padStart(2, "0"),
}));
export function isStudioTemplate(value: unknown): boolean {
  return QR_STUDIO_TEMPLATES.some((t) => t.id === value);
}
export function getQrTemplate(value: unknown) {
  return QR_TEMPLATES.find((t) => t.id === value);
}
export function templateImage(id: TemplateId, mode: "reference" | "working" = "reference") {
  const name =
    mode === "working" && Object.hasOwn(NEW_RENDERER_ENGINES, id) ? `${id}-reference-v1` : id;
  return `/assets/qr-studio/catalog/${name}-${mode}.${mode === "reference" ? "webp" : "svg"}`;
}
export type PreviewSearch = {
  view?: "preview" | undefined;
  template?: TemplateId | undefined;
  draft?: string | undefined;
  access?: PassAccess | undefined;
};
export function parsePreviewSearch(search: Record<string, unknown>): PreviewSearch {
  const view = search["view"] === "preview" ? ("preview" as const) : undefined;
  const template = getQrTemplate(search["template"])?.id;
  const draft =
    typeof search["draft"] === "string" && /^[0-9a-f-]{36}$/i.test(search["draft"])
      ? search["draft"]
      : undefined;
  const access = isPassAccess(search["access"]) ? search["access"] : undefined;
  return { view, template, draft, ...(access ? { access } : {}) };
}
export const isMaterialTemplate = (id?: TemplateId) => !!id && TEMPLATE_IDS.indexOf(id) >= 6;
