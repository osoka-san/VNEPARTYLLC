# Реализация единого Gallery of Light

## Объём

Реализована презентационная часть утверждённых пакетов 1–4 + 5A без backend, Auth, БД, ролей, оплаты и публикации.

- Code SHA проверенной реализации до добавления evidence-метаданных отчёта: `f7d9df9c8ae14fdda7280dcf20bb17ca910c75fd`.
- Evidence SHA-256: `cff9519a632f791599598d009060339ad0eeafa7064c8075f20836e9ab4cc20d` (`unified-about-browser-evidence.json`) и `df0e5f8dd61cb532f93891a74d2628c31a2392ed38454a1927c4d9b8a8c61a19` (`unified-about-motion-evidence.json`).

- Общие внутренние оболочки сведены к ориентиру 1280 px; full-bleed главы главной сохранены.
- `/about` пересобран в единый рассказ: space + pine, compact stone + community, water как подчинённый финальный кадр.
- `/events` сохраняет ровно две демонстрационные карточки и больше не повторяет атмосферный header-кадр.
- `/contact` не показывает фиктивные телефон или email.
- `/member` показывает раздельные будущие этапы; `/admin` и `/scan` сохраняют честные демонстрационные состояния.
- Flow, портал, четыре фоновые сцены, TextRoll/TextScramble, motion settings и существующие focus/motion исправления не изменялись.

## Ассеты

- Архив `VNE_Unified_About_Assets.zip`: SHA-256 `256fbab544f591c85c566308d126e6df7b9a2786d044a6b8735c6e0861b492f2`.
- Два исходных PNG сохранены только в `asset_log/official/gallery-of-light/editorial-v2/source/`.
- Двенадцать исходных AVIF/WebP derivatives подключены из `public/media/gallery-of-light/editorial-v2/` без перекодирования.
- 14 из 14 файлов совпали с SHA-256 поставленного manifest.
- В Chromium `/about` выбрал AVIF 960 px при viewport 1280 и AVIF 480 px при viewport 390; все три кадра декодированы, network failures отсутствуют.

## Проверки

| Проверка | Результат |
| --- | --- |
| Typecheck | PASS |
| Brand tokens | PASS |
| Lint | PASS, 0 errors; 8 существующих Fast Refresh warnings |
| Motion unit tests | PASS, 6/6 |
| Motion settings | PASS, 3/3 |
| Acceptance harness | PASS, 72 сценария |
| Production build | PASS |
| Asset hash verification | PASS, 14/14 |
| Browser routes | PASS: `/about`, `/events`, оба detail, `/member`, `/scan`, `/contact`, `/privacy`, `/i/:code`, `/c/:code`, 404 |
| Responsive | PASS на 360, 390, 430, 1280 и 1920 px; horizontal overflow отсутствует |
| Apply dialog | PASS: после Escape фокус вернулся на «Проверить заполнение», тестовые поля сохранились |
| FAQ | PASS: `#access` раскрыт, enabled duration 0.26 s |
| Admin keyboard | PASS: radio group, ArrowRight и roving focus работают |
| Reduced motion | PASS в Chromium: весь `/about` читаем, три изображения доступны |
| Image reveal off | PASS: `imageReveal=false`, `revealStyle=none`, manual off и reduced дают opacity 1 без активной анимации |
| No-JS | PASS: SSR-страница `/about` вернула 200, заголовок, текст и три обычных изображения |
| About links | PASS: `/faq#access` и `/apply` присутствуют в итоговом HTML/DOM |

Машиночитаемые результаты сохранены в `docs/sprint/unified-about-browser-evidence.json` и `docs/sprint/unified-about-motion-evidence.json`. Визуальный baseline не обновлялся.

## Ограничения

- Не проверялись физические телефоны, device screenreader, реальный GPU, production и публикация.
- Browser-check использовал headless Chromium; FPS/INP не измерялись.
- Серверные операции, реальные контакты, даты, цены, адрес, допуск, QR и оплата не реализованы и не заявлены как работающие.
- Пакеты 5B/5C остаются будущими отдельными этапами.
## Поправка desktop-сетки (24.09.2026, 23:xx UTC)

SHA: исходный HEAD задачи `426925e…`; промежуточный `214fe7fc57a492d4c41c474e3bd63d0d067316ad`; база этой поправки `b8efc1ff4929ecfb21307ef66d50513ae80e8989` (проверено владельцем как `b52668a…`); итоговый code SHA — следующий авто-коммит после базы (фиксируется платформой; evidence ниже не ссылается на себя).

Дефект: `/about`, `/events`, `/events/:slug`, `/admin`, `FutureShell` имели `max-w-[1280px]` и `lg:px-12` на одном элементе (полезно 1184 px), а PageShell header/AppFooter — padding 48 + inner 1280. Исправление: внешний контейнер этих страниц `max-w-[1376px]` с прежним padding 48 → полезная ширина 1280, общая вертикаль. Header (1376 + px-12), footer, главы index (`sm:px-12` + inner 1280) уже согласованы; full-bleed фон/портал не тронуты. Узкая форма `/apply` сохраняет функциональную ширину (content x416/656 намеренно).

`sizes` /about: первичные значения 424/766 были ошибкой замера во время ImageReveal scale 1.045 и заменены (см. раздел ниже).

/about: `InView` оборачивал `SectionHeading`, у которого уже есть `AnimatedText` — двойной вход заголовка. `InView` сужен до TextLoop-строки и ссылок; заголовок анимируется один раз.

Геометрия (Playwright, `/tmp/browser/grid/geo.py`), 5 маршрутов × 360/430/1440/1920: overflow 0 везде; h1 left = content left = footer left: 20/20/80/320 px; все изображения загружены и декодированы (AVIF 480/800/960/1280 по ширине). typecheck 0, eslint about.tsx 0. Полная 72-сценарная матрица не перезапускалась; publish не запускался; core motion/admin logic/backend/lockfile не изменены.

## Точечная правка sizes (24.09.2026, 23:07+ UTC)

Основание — нетрансформированная ширина слота (`picture.parentElement.offsetWidth`, manual reduced motion), не `img.getBoundingClientRect()` во время ImageReveal.

| Изображение | sizes | 390 | 1024 | 1440/1920 |
|---|---|---|---|---|
| pine / water (col-span 7) | `≥1376 734px; ≥1024 calc((100vw − 448px)·0.583333 + 192px); ≥640 100vw−64; 100vw−40` | 350 | 528 | 733 |
| stone (col-span 4) | `≥1376 406px; ≥1024 calc((100vw − 448px)·0.333333 + 96px); …` | 350 | 288 | 405 |
| EventCard (только /events) | `≥1376 592px; ≥1024 calc((100vw−192px)/2); ≥768 calc((100vw−160px)/2); ≥640 100vw−96; 100vw−72` | 318 | 416 | 592 |
| Detail | `≥1376 840px; ≥1050 calc((100vw−144px)·0.681818); ≥1024 100vw−432; ≥640 100vw−64; 100vw−40` | 350 | 592 | 840 |

Все измеренные слоты совпадают с формулами. currentSrc: 390 → AVIF 480; 1024 → pine/water 960, stone/cards 480, detail 800; 1440/1920 → pine/water 960, stone 480, cards 800, detail 1280. Все изображения загружены (`complete && naturalWidth>0`). Сетка, исходники и web-деривативы не менялись.

Длинный заголовок / UtilityDock на 1920 (/about, reduced): h1 bottom 362 px, dock top 1739 px, overflow 0; снимок `docs/sprint/evidence/about-1920-grid.png` — перекрытий нет. Итоговый fresh SHA сообщает API после авто-коммита.

## Завершающая локальная правка /about (24.09.2026, 23:22+ UTC)

Основание: HEAD `8c9aeee96fd5f7bb2fbf761c62b47f38fb1d6721`. Только на `/about` обе текстовые CTA-ссылки получили область нажатия высотой не менее 44 px; оболочка и quiet error/placeholder всех трёх editorial-изображений используют основной фон `#070A09` через семантический `background`, без изменения общего `EditorialPicture`. Сетка, `sizes`, изображения, подписи и параметры ImageReveal не менялись.

Целевая браузерная проверка выполнена на desktop/mobile и в reduced/manual off: CTA сохраняют порядок, фокус и высоту ≥44 px; три изображения загружены, а фон их оболочек равен `#070A09`; при reduced/off изображения сразу находятся в видимом финальном состоянии без активной анимации. Полная 72-сценарная матрица не запускалась; backend/Auth/БД/payment/QR и публикация не затрагивались. Итоговый fresh SHA сообщает API после авто-коммита.
