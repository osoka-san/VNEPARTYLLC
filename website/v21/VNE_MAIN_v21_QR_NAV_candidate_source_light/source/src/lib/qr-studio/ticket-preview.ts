import {
  ENGINE_VERSION,
  engineForPattern,
  parsePattern,
  supportsPatternEngine,
  type Pattern,
} from "./pattern";
export type PreviewDraft = {
  schema: 1;
  pattern: Pattern;
  engineVersion: string;
  text: string;
  createdAt: number;
};
const PREFIX = "vne-qr-card-preview:";
export function parsePreviewDraft(value: unknown): PreviewDraft {
  if (!value || typeof value !== "object")
    throw new Error("Макет недоступен. Откройте его заново из QR-студии.");
  const p = value as Record<string, unknown>;
  if (
    p["schema"] !== 1 ||
    typeof p["text"] !== "string" ||
    !p["text"].trim() ||
    new TextEncoder().encode(p["text"]).length > 220 ||
    typeof p["createdAt"] !== "number" ||
    !Number.isFinite(p["createdAt"])
  )
    throw new Error("Некорректные настройки макета.");
  const pattern = parsePattern(p["pattern"]);
  const engineVersion = p["engineVersion"] ?? ENGINE_VERSION;
  if (typeof engineVersion !== "string" || !supportsPatternEngine(engineVersion, pattern))
    throw new Error("Версия оформления макета не поддерживается.");
  return {
    schema: 1,
    pattern,
    engineVersion,
    text: p["text"],
    createdAt: p["createdAt"],
  };
}
export function savePreviewDraft(
  pattern: Pattern,
  text: string,
  engineVersion: string = engineForPattern(pattern),
) {
  const draft = parsePreviewDraft({
    schema: 1,
    pattern,
    engineVersion,
    text,
    createdAt: Date.now(),
  });
  const id = crypto.randomUUID();
  try {
    // Keep a small collection of local drafts; only an opaque ID goes into the URL.
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(PREFIX));
    if (keys.length >= 16) {
      const sorted = keys
        .map((k) => {
          try {
            return { k, time: JSON.parse(sessionStorage.getItem(k) || "{}").createdAt || 0 };
          } catch {
            return { k, time: 0 };
          }
        })
        .sort((a, b) => a.time - b.time);
      for (const { k } of sorted.slice(0, keys.length - 15)) sessionStorage.removeItem(k);
    }
    sessionStorage.setItem(PREFIX + id, JSON.stringify(draft));
  } catch {
    throw new Error("Браузер не сохранил макет. Разрешите хранение данных сайта и повторите.");
  }
  return id;
}
export function loadPreviewDraft(id: string): PreviewDraft {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Ссылка на макет некорректна.");
  try {
    return parsePreviewDraft(JSON.parse(sessionStorage.getItem(PREFIX + id) || "null"));
  } catch {
    throw new Error(
      "Этот макет не найден в текущей вкладке. Выберите шаблон ниже или вернитесь в QR-студию.",
    );
  }
}
