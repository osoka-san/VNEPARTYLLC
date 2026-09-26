export type EventStatus = "demo" | "announced";

export interface PublicEvent {
  slug: string;
  title: string;
  kicker: string;
  status: EventStatus;
  dateLabel: string;
  timeLabel: string;
  timezone: string;
  format: string;
  summary: string;
  program: string[];
  image: string;
  imageAvifSrcSet: string;
  imageWebpSrcSet: string;
  imagePosition: string;
  imageWidth: number;
  imageHeight: number;
}

export const publicEvents: PublicEvent[] = [
  {
    slug: "light-study-01",
    title: "Световая сессия 01",
    kicker: "Демонстрационная карточка",
    status: "demo",
    dateLabel: "Дата будет объявлена",
    timeLabel: "Время будет объявлено",
    timezone: "Часовой пояс будет указан",
    format: "Закрытая музыкальная встреча",
    summary: "Пример будущей страницы события. Анонс, дата и участие пока не подтверждены.",
    program: [
      "Программа готовится",
      "Состав участников не опубликован",
      "Место не раскрывается до подтверждения",
    ],
    image: "/media/gallery-of-light/editorial-v1/vne-event-resonance-v2-1280.webp",
    imageAvifSrcSet:
      "/media/gallery-of-light/editorial-v1/vne-event-resonance-v2-480.avif 480w, /media/gallery-of-light/editorial-v1/vne-event-resonance-v2-800.avif 800w, /media/gallery-of-light/editorial-v1/vne-event-resonance-v2-1280.avif 1280w, /media/gallery-of-light/editorial-v1/vne-event-resonance-v2-1586.avif 1586w",
    imageWebpSrcSet:
      "/media/gallery-of-light/editorial-v1/vne-event-resonance-v2-480.webp 480w, /media/gallery-of-light/editorial-v1/vne-event-resonance-v2-800.webp 800w, /media/gallery-of-light/editorial-v1/vne-event-resonance-v2-1280.webp 1280w, /media/gallery-of-light/editorial-v1/vne-event-resonance-v2-1586.webp 1586w",
    imagePosition: "50% 55%",
    imageWidth: 1280,
    imageHeight: 801,
  },
  {
    slug: "threshold-study-02",
    title: "Порог: эскиз 02",
    kicker: "Демонстрационная карточка",
    status: "demo",
    dateLabel: "Дата будет объявлена",
    timeLabel: "Время будет объявлено",
    timezone: "Часовой пояс будет указан",
    format: "Аудиовизуальный формат",
    summary: "Синтетический пример для проверки длинных названий, состояний и маршрута выбора.",
    program: ["Последовательность вечера уточняется", "Условия участия не утверждены"],
    image: "/media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-1280.webp",
    imageAvifSrcSet:
      "/media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-480.avif 480w, /media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-800.avif 800w, /media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-1280.avif 1280w, /media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-1586.avif 1586w",
    imageWebpSrcSet:
      "/media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-480.webp 480w, /media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-800.webp 800w, /media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-1280.webp 1280w, /media/gallery-of-light/addon-v4/vne-event-light-interval-v4-d-1586.webp 1586w",
    imagePosition: "62% 52%",
    imageWidth: 1280,
    imageHeight: 801,
  },
];

export const getPublicEvent = (slug?: string) => publicEvents.find((event) => event.slug === slug);

export const primaryNavigation = [
  { label: "События", to: "/events" },
  { label: "О проекте", to: "/about" },
  { label: "Кабинет", to: "/member" },
] as const;

export const chapterNavigation = [
  { label: "01 Порог", hash: "threshold" },
  { label: "02 Манифест", hash: "manifesto" },
  { label: "03 Пространство", hash: "space" },
  { label: "04 Ближайшая ночь", hash: "next-night" },
  { label: "05 Принадлежность", hash: "belonging" },
  { label: "06 Приглашение", hash: "invitation" },
] as const;

export const faqItems = [
  {
    id: "application",
    question: "Как работает заявка?",
    answer:
      "Вы оставляете имя, email и обязательный Telegram. Сейчас сайт работает в тестовой среде: заявка сохраняется, но письма не отправляются. Позже одобренная заявка получит одноразовое email-приглашение для создания аккаунта.",
  },
  {
    id: "participation",
    question: "Заявка подтверждает участие?",
    answer:
      "Нет. Заполнение формы, карта или ссылка сами по себе не подтверждают участие и не гарантируют доступ.",
  },
  {
    id: "payment",
    question: "Когда происходит оплата?",
    answer: "Порядок и условия оплаты пока не утверждены. Платёжная функция на сайте отсутствует.",
  },
  {
    id: "address",
    question: "Где проходит событие?",
    answer:
      "Адрес пока не опубликован. Он появится только после подтверждения информации о событии.",
  },
  {
    id: "qr",
    question: "Работает ли QR-код?",
    answer:
      "Нет. Маршруты карт зарезервированы, но проверка кодов и решение о допуске ещё не реализованы.",
  },
  {
    id: "support",
    question: "Как связаться с поддержкой?",
    answer:
      "Подтверждённый канал пока не опубликован. Значения на странице контактов являются шаблонами.",
  },
  {
    id: "access",
    question: "Что означает подтверждённый допуск?",
    answer:
      "Заявка, созданный аккаунт, карта и страница события не равны подтверждённому допуску. Решение об участии сообщается отдельно.",
  },
] as const;

export const documents = {
  privacy: {
    title: "Политика конфиденциальности",
    description: "Черновая структура будущей политики обработки данных.",
  },
  consent: {
    title: "Согласие на обработку данных",
    description: "Черновая структура будущего отдельного согласия.",
  },
  terms: {
    title: "Условия использования",
    description: "Черновая структура условий использования сайта.",
  },
  refunds: { title: "Возвраты", description: "Черновая структура будущих правил возврата." },
  cookies: {
    title: "Файлы cookie",
    description: "Черновая структура уведомления о технических настройках сайта.",
  },
} as const;
