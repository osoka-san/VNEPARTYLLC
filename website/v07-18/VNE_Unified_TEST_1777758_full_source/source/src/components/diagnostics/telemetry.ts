/** Original VNE preview telemetry. No request interception, payloads, URLs, storage or remote sink. */
export const EVENT_DEFINITIONS = {
  page_ready: { message: "Экран открыт", severity: "info", code: null },
  browser_online: { message: "Браузер сообщает: сеть доступна", severity: "info", code: null },
  browser_offline: { message: "Браузер сообщает: нет сети", severity: "warning", code: null },
  route_missing: { message: "Маршрут не найден", severity: "warning", code: 404 },
  render_failed: { message: "Ошибка отображения интерфейса", severity: "error", code: null },
  script_failed: { message: "Необработанная ошибка в браузере", severity: "error", code: null },
  rejection: { message: "Необработанная асинхронная ошибка", severity: "error", code: null },
} as const;
export type EventKind = keyof typeof EVENT_DEFINITIONS;
export type Severity = "info" | "warning" | "error";
export type SafeArea = "public" | "observatory" | "fallback";
export type LogEntry = Readonly<{
  id: string;
  at: number;
  kind: string;
  severity: Severity;
  code: number | null;
  message: string;
  area: SafeArea;
  origin: "browser" | "example";
  correlation: string;
}>;
export const LIMIT = 200;
const EMPTY: readonly LogEntry[] = Object.freeze([]);
export function createTelemetryStore() {
  let rows: readonly LogEntry[] = EMPTY;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  return {
    getSnapshot: () => rows,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    record(kind: unknown, area: unknown = "public") {
      if (typeof kind !== "string" || !Object.hasOwn(EVENT_DEFINITIONS, kind)) return;
      const definition = EVENT_DEFINITIONS[kind as EventKind];
      const safeArea: SafeArea = area === "observatory" || area === "fallback" ? area : "public";
      sequence += 1;
      // Intentionally select only fixed fields. Never spread incoming values or stringify errors.
      const row: LogEntry = Object.freeze({
        id: `local-${sequence}`,
        at: Date.now(),
        kind,
        severity: definition.severity,
        code: definition.code,
        message: definition.message,
        area: safeArea,
        origin: "browser",
        correlation: `event-${sequence.toString().padStart(4, "0")}`,
      });
      rows = Object.freeze([...rows.slice(-(LIMIT - 1)), row]);
      emit();
    },
    clear() {
      rows = EMPTY;
      emit();
    },
  };
}
export const telemetry = createTelemetryStore();
export const serverSnapshot = () => EMPTY;
export function recordBrowserEvent(kind: EventKind, area: SafeArea = "public") {
  if (typeof window !== "undefined") telemetry.record(kind, area);
}
export function exampleEntries(now: number): readonly LogEntry[] {
  const examples: [number, Severity, string][] = [
    [200, "info", "Проверка экрана завершена"],
    [401, "warning", "Требуется вход"],
    [403, "warning", "Доступ к действию запрещён"],
    [404, "warning", "Страница не найдена"],
    [429, "warning", "Слишком много запросов"],
    [500, "error", "Ошибка сервера"],
    [503, "error", "Сервис временно недоступен"],
    [200, "info", "Повторная проверка завершена"],
  ];
  return examples.map(([code, severity, message], index) =>
    Object.freeze({
      id: `example-${index + 1}`,
      at: now - (examples.length - index) * 45000,
      kind: "status_example",
      severity,
      code,
      message,
      area: "observatory" as const,
      origin: "example" as const,
      correlation: index < 4 ? "demo-flow-01" : "demo-flow-02",
    }),
  );
}
export function selectEntries(
  rows: readonly LogEntry[],
  query: string,
  severity: string,
  minutes: number,
  now: number,
) {
  const needle = query.trim().toLocaleLowerCase("ru");
  return rows.filter(
    (row) =>
      (severity === "all" || row.severity === severity) &&
      (!minutes || now - row.at <= minutes * 60000) &&
      (!needle ||
        `${row.id} ${row.message} ${row.code ?? ""} ${row.correlation} ${row.kind}`
          .toLocaleLowerCase("ru")
          .includes(needle)),
  );
}
export function serializeEntries(rows: readonly LogEntry[]) {
  // Second allowlist at the export boundary. No arbitrary properties survive.
  return JSON.stringify(
    {
      scope: "VNE Unified TEST: local browser observations or explicit examples. No server logs.",
      entries: rows.map((row) => ({
        id: row.id,
        at: new Date(row.at).toISOString(),
        kind: row.kind,
        severity: row.severity,
        code: row.code,
        message: row.message,
        area: row.area,
        origin: row.origin,
        correlation: row.correlation,
      })),
    },
    null,
    2,
  );
}
