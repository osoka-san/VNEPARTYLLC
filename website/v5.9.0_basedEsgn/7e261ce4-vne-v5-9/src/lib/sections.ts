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
