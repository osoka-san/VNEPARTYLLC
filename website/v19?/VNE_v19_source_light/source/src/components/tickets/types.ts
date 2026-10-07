/** Контракт карточки пропуска ВНЕ (pass DTO модуля выдачи). Тип карты не даёт прав на сайте. */
export type PassAccess = "GENERAL" | "VIP" | "SECURITY" | "ARTIST";
export type PassStatus = "active" | "revoked" | "expired" | "used";

export type PassEvent = {
  id: string;
  title: string;
  date?: string | undefined;
  shuttleTime?: string | undefined;
  meetingPoint?: string | undefined;
  totalTickets?: number | undefined;
  /** legacy */
  when?: string | undefined;
  venue?: string | undefined;
};

export type PassDTO = {
  id: string;
  ticketCode: string;
  shortId?: string | undefined;
  userId: string;
  name: string;
  telegram: string | null;
  access: PassAccess;
  theme: string;
  sequenceNumber: number | null;
  sequenceLabel: string | null;
  event: PassEvent;
  status: PassStatus;
  source: string;
  demo?: boolean | undefined;
  qrText: string | null;
  validUntil: string;
  version?: number;
  environment?: 'live' | 'sandbox';
  qrReleaseAt?: string;
  design?: { engineVersion: string; pattern: import('@/lib/qr-studio/pattern').Pattern };
};

export type StageBadge = PassDTO & {
  lanyardText: string;
  number: string;
  strapColor: string;
  strapEdge: string;
  ticketId?: string | undefined;
};
