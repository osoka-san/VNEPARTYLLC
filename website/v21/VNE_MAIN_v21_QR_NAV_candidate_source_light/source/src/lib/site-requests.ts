export const REQUEST_STATUSES = {
  submitted: "Новая",
  under_review: "На рассмотрении",
  needs_info: "Нужно уточнение",
  waitlisted: "Лист ожидания",
  approved: "Одобрена",
  rejected: "Отклонена",
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUSES;
export type RequestKind = "membership" | "event";
export const REQUEST_ACTIONS = {
  take: { label: "Взять на рассмотрение", from: ["submitted"], to: "under_review" },
  request_info: {
    label: "Запросить уточнение",
    from: ["submitted", "under_review"],
    to: "needs_info",
  },
  resume: { label: "Уточнение получено", from: ["needs_info"], to: "under_review" },
  waitlist: { label: "В лист ожидания", from: ["submitted", "under_review"], to: "waitlisted" },
  approve: { label: "Одобрить", from: ["submitted", "under_review", "waitlisted"], to: "approved" },
  reject: {
    label: "Отклонить",
    from: ["submitted", "under_review", "needs_info", "waitlisted"],
    to: "rejected",
  },
  reopen: { label: "Вернуть на рассмотрение", from: ["approved", "rejected"], to: "under_review" },
  note: { label: "Добавить комментарий", from: Object.keys(REQUEST_STATUSES), to: null },
} as const;
export type RequestAction = keyof typeof REQUEST_ACTIONS;
export const REVIEW_EVENTS = [
  { id: "light-study-01", title: "Световая сессия 01" },
  { id: "threshold-study-02", title: "Порог: эскиз 02" },
] as const;
export function allowedRequestActions(status: RequestStatus): RequestAction[] {
  return (Object.keys(REQUEST_ACTIONS) as RequestAction[]).filter((action) =>
    (REQUEST_ACTIONS[action].from as readonly string[]).includes(status),
  );
}
export type SiteRequest = {
  id: string;
  kind: RequestKind;
  name: string;
  email: string;
  telegram: string;
  eventKey: string;
  eventTitle: string;
  details: string;
  status: RequestStatus;
  note: string;
  version: number;
  source: "form" | "manual";
  createdAt: string;
  updatedAt: string;
};
export type RequestHistory = {
  id: string;
  action: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  note: string;
  actorName: string;
  createdAt: string;
};
export type RequestList = {
  items: SiteRequest[];
  total: number;
  counts: Record<RequestStatus, number>;
  page: number;
  pageSize: number;
};
