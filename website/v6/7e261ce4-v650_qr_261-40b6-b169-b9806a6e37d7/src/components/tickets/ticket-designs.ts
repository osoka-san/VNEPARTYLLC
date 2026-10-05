import type { PassAccess, PassDTO, PassEvent } from "./types";

export type TicketDesign = {
  label: string;
  short: string;
  eyebrow: string;
  serial: string;
  accent: string;
  strap: string;
  edge: string;
  description: string;
};

// Точные значения из vne-pass-kit (ticket-designs.mjs); цвета — часть утверждённого дизайна карт.
export const TICKET_DESIGNS: Record<PassAccess, TicketDesign> = {
  GENERAL: {
    label: "GUEST GENERAL",
    short: "GENERAL",
    eyebrow: "GUEST ACCESS",
    serial: "01",
    accent: "#e55330",
    strap: "#d65a37",
    edge: "#f49b76",
    description: "Тёплый фарфор. Графит. Оранжевая подпись.",
  },
  VIP: {
    label: "VIP",
    short: "VIP",
    eyebrow: "PRIVATE SELECTION",
    serial: "02",
    accent: "#d7bb81",
    strap: "#20201c",
    edge: "#a99160",
    description: "Чёрный металл. Шампань. Свет на гранях.",
  },
  SECURITY: {
    label: "SECURITY STAFF",
    short: "SECURITY",
    eyebrow: "EVENT OPERATIONS",
    serial: "03",
    accent: "#bce7bc",
    strap: "#26362e",
    edge: "#99c19c",
    description: "Контрастная маркировка. Ясная принадлежность.",
  },
  ARTIST: {
    label: "ARTIST",
    short: "ARTIST",
    eyebrow: "ARTIST ACCESS",
    serial: "04",
    accent: "#a8bdf9",
    strap: "#6c7fa3",
    edge: "#bfccf2",
    description: "Холодный серебряный свет. Свободный ритм.",
  },
};

export const PASS_ACCESS: PassAccess[] = ["GENERAL", "VIP", "SECURITY", "ARTIST"];

export const getDesign = (access: string | undefined): TicketDesign =>
  TICKET_DESIGNS[access as PassAccess] ?? TICKET_DESIGNS.GENERAL;

export function eventDate(event: PassEvent | undefined): string {
  if (!event?.date) return event?.when || "Дата будет объявлена";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : event.date;
}

/** Синтетический образец только для защищённого дизайн-просмотра. Не анонс и не вход. */
export function makeDemoPass(access: PassAccess = "GENERAL"): PassDTO {
  const d = getDesign(access);
  return {
    id: `demo-${access}`,
    ticketCode: `VNE-DEMO-${d.serial}-0000-0000`,
    shortId: `DEMO${d.serial}`,
    userId: "U—0048",
    name: access === "ARTIST" ? "@artist_demo" : "АЛЕКСАНДР / DEMO",
    telegram: "@guest_demo",
    access,
    theme:
      access === "VIP"
        ? "gold"
        : access === "SECURITY"
          ? "mint"
          : access === "ARTIST"
            ? "ice"
            : "ember",
    sequenceNumber: Number(d.serial),
    sequenceLabel: `${d.serial}/40`,
    event: {
      id: "preview-event",
      title: "ПО ТУ СТОРОНУ\nТИШИНЫ",
      date: "2026-11-14",
      shuttleTime: "20:00",
      meetingPoint: "Точка сбора · демо-адрес",
      totalTickets: 40,
    },
    status: "active",
    source: "demo",
    demo: true,
    qrText: `https://example.com/vne-demo-${access.toLowerCase()}-not-valid`,
    validUntil: "2099-01-01T00:00:00.000Z",
  };
}
