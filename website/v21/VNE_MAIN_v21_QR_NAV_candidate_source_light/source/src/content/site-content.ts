export type EventStatus = "demo" | "announced";
import { editorialMedia } from "./editorial-media";

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
    summary:
      "Эскиз встречи, где свет очерчивает пространство, а звук объединяет моменты. Дата и программа не объявлены.",
    program: [
      "Программа готовится",
      "Состав участников не опубликован",
      "Площадка не подтверждена",
    ],
    get image() {
      return editorialMedia.eventResonance.src;
    },
    get imageAvifSrcSet() {
      return editorialMedia.eventResonance.avifSrcSet;
    },
    get imageWebpSrcSet() {
      return editorialMedia.eventResonance.webpSrcSet;
    },
    imagePosition: "50% 55%",
    imageWidth: editorialMedia.eventResonance.width,
    imageHeight: editorialMedia.eventResonance.height,
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
    summary:
      "Полоса света, шаг в глубину, новый ритм. Художественный эскиз будущей встречи, не анонс события.",
    program: ["Последовательность вечера уточняется", "Условия участия не утверждены"],
    get image() {
      return editorialMedia.eventLightInterval.src;
    },
    get imageAvifSrcSet() {
      return editorialMedia.eventLightInterval.avifSrcSet;
    },
    get imageWebpSrcSet() {
      return editorialMedia.eventLightInterval.webpSrcSet;
    },
    imagePosition: "62% 52%",
    imageWidth: editorialMedia.eventLightInterval.width,
    imageHeight: editorialMedia.eventLightInterval.height,
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
    question: "Как заполнить анкету?",
    answer:
      "Ответь на семь вопросов, выбери значения трёх шкал и укажи возраст. На каждый вопрос с вариантами — до трёх ответов, включая свои; каждый до пяти слов. Все вопросы обязательны. Используй вымышленные имя, email и Telegram.",
  },
  {
    id: "own-answers",
    question: "Можно отвечать своими словами?",
    answer:
      "Да. Выбери «Ввести самостоятельно» в меню вопроса или переключи всю анкету на ручной ввод кнопкой вверху. Лимит тот же: до трёх ответов, каждый до пяти слов.",
  },
  {
    id: "status",
    question: "Где посмотреть заявку?",
    answer:
      "В кабинете той учётной записи, из которой отправлена анкета. Там можно проверить статус. Доступные действия зависят от тестовой среды.",
  },
  {
    id: "participation",
    question: "Одобрение подтверждает участие?",
    answer:
      "Нет. Решение по тестовой заявке не подтверждает участие в реальном событии и не создаёт пропуск.",
  },
  {
    id: "access",
    question: "Чем отличаются аккаунт, заявка и допуск?",
    answer:
      "Аккаунт нужен для входа. Общая заявка — для знакомства с ВНЕ. Участие в конкретном событии, оплата и допуск оформляются отдельно. Аккаунт, одобрение общей заявки или изображение карты сами по себе не дают права входа.",
  },
  {
    id: "payment",
    question: "Можно оплатить участие?",
    answer: "Пока нет. Условия оплаты появятся после подтверждения и подключения функции.",
  },
  {
    id: "address",
    question: "Где и когда состоится событие?",
    answer:
      "Подтверждённого анонса пока нет. Демонстрационные карточки и художественные изображения не подтверждают дату или площадку.",
  },
  {
    id: "qr",
    question: "Выдаётся ли пропуск?",
    answer:
      "В текущем тестовом режиме пропуск на реальное событие не выдаётся. Изображение карты или QR-код сами по себе не подтверждают допуск.",
  },
  {
    id: "notifications",
    question: "Придёт уведомление?",
    answer:
      "В тестовом режиме письма и сообщения в Telegram не отправляются. Проверяй статус в кабинете.",
  },
  {
    id: "support",
    question: "Как связаться с командой?",
    answer: "Подтверждённый канал появится в разделе «Связь». Сейчас контакты не объявлены.",
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
