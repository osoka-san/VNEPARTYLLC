import type { createArtwork, Pattern } from "./core";
import type { PassAccess } from "@/components/tickets/types";
export type RenderResult = { art: ReturnType<typeof createArtwork> | null; error: string };
export function renderArtwork(
  text: string,
  pattern: Pattern,
  signal?: AbortSignal,
  passAccess?: PassAccess,
  engineVersion?: string,
): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<RenderResult>) => {
      cleanup();
      resolve(event.data);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("Генератор не загрузился. Обновите страницу и повторите."));
    };
    worker.postMessage({ text, pattern, passAccess, engineVersion });
  });
}
