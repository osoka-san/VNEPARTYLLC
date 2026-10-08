import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const PREVIEW_PATHS = ["/preview", "/preview/menu", "/preview/pass", "/preview/violations"];
export const DEMO_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'; frame-src 'none';";
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const baseStyle = `*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f3f0e9;color:#20241f;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}a:focus-visible{outline:3px solid #af452e;outline-offset:4px}header{padding:max(14px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) 14px max(18px,env(safe-area-inset-left));background:#20241f;color:#fff;display:flex;align-items:center;gap:16px;justify-content:space-between}header a{min-height:44px;display:inline-flex;align-items:center;text-decoration:none}header small{font-size:11px;line-height:1.4;text-align:right;color:#e7c7b7}.wordmark{letter-spacing:.16em;font-weight:800}main{max-width:920px;margin:auto;padding:26px max(18px,env(safe-area-inset-right)) max(32px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}h1{font-size:clamp(28px,6vw,42px);line-height:1.1;margin:0 0 14px}p{font-size:16px;line-height:1.55;margin:0 0 22px;color:#4b504a}h2{font-size:18px;margin:28px 0 12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.card{display:flex;flex-direction:column;justify-content:space-between;gap:18px;min-height:166px;padding:20px;background:#fffdf8;border:1px solid #cecdc4;border-radius:16px;text-decoration:none}.card strong{font-size:21px}.card span{color:#555b51;font-size:14px;line-height:1.5}.card b{color:#9b3e29;font-size:14px}.links{display:grid;gap:10px}.links a{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:54px;padding:13px 16px;border:1px solid #cecdc4;border-radius:12px;background:#ebe9e0;text-decoration:none;font-size:15px}.links small{color:#606558}.note{margin-top:22px;font-size:13px}.frame-page{height:100vh;height:100svh;display:flex;flex-direction:column;overflow:hidden}.frame-page header{flex-shrink:0;min-height:64px}.frame-page iframe{width:100%;flex:1;min-height:0;border:0;background:#f3f0e9;display:block}.frame-page header a{font-size:14px;white-space:nowrap}.frame-page header strong{font-size:14px}.frame-page header small{display:block;font-size:10px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
const doc = (title, body, frame = false) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${title} · ВНЕ TEST</title><style>${baseStyle}</style></head><body${frame ? ' class="frame-page"' : ""}>${body}</body></html>`;

export async function buildPreviewPages(root = process.cwd()) {
  const definitions = [
    ["menu", "Меню 03", "Компактное меню с наклонными обводками. Открытие, разделы и переходы."],
    [
      "pass",
      "Личный пропуск",
      "Подвесная карточка, движение и состояния пропуска на вымышленных данных.",
    ],
    [
      "violations",
      "Нарушения",
      "Поиск, выбор человека, запись и рассмотрение решения на вымышленных данных.",
    ],
  ];
  const pages = {};
  const sources = {};
  for (const [name, title] of definitions) {
    const source = await readFile(`${root}/test-stand/previews/${name}.html`, "utf8");
    if (/(?:fetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|serviceWorker)/.test(source))
      throw Error(`Network-capable demo: ${name}`);
    if (/<(?:script|link|iframe)\b[^>]*(?:src|href)\s*=/i.test(source))
      throw Error(`External dependency in demo: ${name}`);
    if (
      /sb_(?:secret|publishable)_|supabase\.co|Bearer\s+[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(
        source,
      )
    )
      throw Error(`Non-synthetic credential or backend in demo: ${name}`);
    // Keep the source artifact byte-exact. Add a restrictive policy only inside the
    // sandboxed document. Opaque origin prevents access to the TEST session/storage.
    const sandboxDoc = source
      .replace(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "")
      .replace(
        /<head>/i,
        `<head><meta http-equiv="Content-Security-Policy" content="${DEMO_CSP}"><meta name="referrer" content="no-referrer"><script>document.addEventListener("click",function(e){if(e.target instanceof Element && e.target.closest("a"))e.preventDefault();});</script>`,
      );
    const header = `<header><a href="/preview" aria-label="Вернуться ко всем тестам">← Все тесты</a><div><strong>${title}</strong><small>DEMO · вымышленные данные</small></div></header>`;
    pages[`/preview/${name}`] = doc(
      title,
      header +
        `<iframe title="${title}: интерактивный синтетический макет" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" srcdoc="${escape(sandboxDoc)}"></iframe>`,
      true,
    );
    sources[name] = {
      sha256: createHash("sha256").update(source).digest("hex"),
      bytes: Buffer.byteLength(source),
    };
  }
  pages["/preview"] = doc(
    "Все тестовые версии",
    `<header><span class="wordmark">ВНЕ / TEST</span><small>Тестовый стенд<br>07.10.2026</small></header><main><h1>Все тесты<br>на телефоне</h1><p>Откройте нужный вариант прямо в Safari или Chrome.</p><h2>Интерактивные макеты</h2><div class="cards">${definitions.map(([name, title, description]) => `<a class="card" href="/preview/${name}"><strong>${title}</strong><span>${description}</span><b>Открыть макет ↗</b></a>`).join("")}</div><p class="note">В макетах только вымышленные данные. Действия не сохраняются в базе и не выдают действительный пропуск. Любой показанный QR — пример для макета.</p><h2>Проверки с тестовым аккаунтом</h2><div class="links"><a href="/apply">Анкета и сохранённый черновик <small>Вход →</small></a><a href="/member">Личный кабинет <small>Вход →</small></a><a href="/admin/mfa">MFA администратора <small>Нужен допуск →</small></a><a href="/scanner/mfa">MFA сканера <small>Нужен допуск →</small></a></div><p class="note">Эти разделы работают с разрешёнными тестовыми аккаунтами и сохраняют прежние проверки входа и прав.</p></main>`,
  );
  return { pages, sources };
}
