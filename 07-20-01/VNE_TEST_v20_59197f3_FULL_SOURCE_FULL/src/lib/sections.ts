/** Редактируемые из админки текстовые блоки. Текст по умолчанию используется, пока нет опубликованной версии. */
export const SITE_SECTIONS = [
  {
    key: "home-invite",
    area: "Главная",
    title: "Приглашение",
    body: "Заявка — первый шаг. Аккаунт создаётся только после одобрения.",
  },
  {
    key: "events-intro",
    area: "События",
    title: "Ближайшие ночи",
    body: "Даты и места сообщаются участникам после одобрения.",
  },
  {
    key: "events-page",
    area: "События",
    title: "События",
    body: "Каркас будущей афиши. Все карточки ниже синтетические и не являются анонсами реальных событий.",
  },
  {
    key: "about-intro",
    area: "О ВНЕ",
    title: "Пространство для внимательного слушания",
    body: "ВНЕ соединяет музыку, свет и временную архитектуру. Факты о будущей площадке будут опубликованы отдельно после подтверждения.",
  },
  {
    key: "about-space",
    area: "О ВНЕ",
    title: "Художественный образ — не адрес",
    body: "Свет, масштаб и паузы формируют восприятие музыки. Изображения передают направление атмосферы, но не подтверждают конкретную площадку или её характеристики.",
  },
  {
    key: "about-community",
    area: "О ВНЕ",
    title: "Внимание важнее статуса",
    body: "Проект задуман для людей, которым важны музыка, уважение к пространству и друг к другу. Конкретные условия участия будут опубликованы только после утверждения.",
  },
  {
    key: "docs-note",
    area: "Документы",
    title: "Статус документов",
    body: "Правила и юридические тексты находятся в статусе черновика.",
  },
  {
    key: "contact-note",
    area: "Контакты",
    title: "Связь",
    body: "Адрес и каналы связи появятся после подтверждения.",
  },
] as const;

export type SectionKey = (typeof SITE_SECTIONS)[number]["key"];
export const isSectionKey = (v: unknown): v is SectionKey => SITE_SECTIONS.some((s) => s.key === v);

export type SectionText = { title: string; body: string };
/** Опубликованный текст или текст по умолчанию. */
export function sectionText(
  published: Record<string, SectionText> | undefined,
  key: SectionKey,
): SectionText {
  const d = SITE_SECTIONS.find((s) => s.key === key)!;
  return published?.[key] ?? { title: d.title, body: d.body };
}
