> **ИСТОРИЧЕСКИЙ РАЗДЕЛ (24.09.2026).** Всё до раздела «03.8» описывает прежние прогоны. Старые PASS (zoom 200 %, матрица 95 снимков и т. п.) не являются доказательствами для текущей ревизии. Актуальное состояние — раздел «03.8» и «03.8 — продолжение» ниже.

# VNE Portal — этап 03: страницы, маршруты и UI/UX

Дата проверки: 2026-09-24.

## Результат

Этап 03 реализован без запуска этапа 04. Главная «Галерея света» сохранена; WebGL/Canvas остаётся только в первом экране главной. Внутренние страницы используют общий визуальный язык, нативную прокрутку и статические изображения.

## Добавлено

- Маршруты: `/events`, `/events/$slug`, `/apply`, `/about`, `/rules`, `/faq`, `/contact`.
- Черновые документы: `/privacy`, `/consent`, `/terms`, `/refunds`, `/cookies`.
- Честные оболочки будущих интерфейсов: `/i/$code`, `/c/$code`, `/member`, `/admin`, `/scan`.
- Общие шапка, мобильное меню, footer, каркас страниц, карточки событий и состояния ошибок/пустых данных.
- Typed content для двух синтетических карточек событий. Они явно обозначены как демонстрационные, без ложных дат, адресов, оплаты или допуска.
- Форма `/apply` только локально проверяет поля. Точный успешный статус: «Поля заполнены. Это демонстрация: данные не отправлены».
- Контекст `?event=` принимается только для известных демонстрационных slug; неизвестное значение не считается выбором.
- Глобальная настройка «Меньше движения», сохранение выбора в браузере, системный reduced-motion fallback.
- Уникальные title/description/Open Graph для содержательных маршрутов; `noindex` для черновых документов и будущих оболочек.
- `/sitemap.xml` содержит только разрешённые публичные страницы.

## Проверки

| Проверка | Статус |
|---|---|
| TypeScript | PASS |
| Production build | PASS |
| Production build smoke | PASS |
| 22 прямых route/state сценария | PASS |
| Форма: ошибки, фокус, локальный success | PASS |
| FAQ `#access` | PASS |
| Back/forward | PASS |
| Мобильное меню и Escape | PASS |
| 360 / 390 / 430 / 1440 / 1920 | PASS |
| 200% zoom | PASS с допуском 4 px системной полосы прокрутки Chromium |
| Canvas вне главной | PASS: 0 |
| Portal acceptance | PASS |
| Static fallback matrix 16×2 | PASS |
| Geometry G1 | PASS |
| Brand tokens | PASS |
| ESLint | PASS: 0 errors, 6 прежних Fast Refresh warnings |

## Автоматизированный визуальный аудит

- Все 19 пользовательских HTML-маршрутов фиксируются на ширинах 360, 390, 430, 1440 и 1920 px: 95 кадров за запуск.
- Эталон обновляется только явной командой; обычная проверка сохраняет текущие кадры, diff и JSON-отчёт.
- Машинные endpoints без визуального интерфейса не включены в screenshot-матрицу.
- Mobile hero v2 обновлён PNG-вариантом, переданным владельцем 24.09.2026; responsive AVIF/WebP пересобраны без апскейла.
- Baseline и повторное сравнение: PASS, 95/95 кадров, 0 регрессий, 0 runtime errors и 0 горизонтальных выходов.
- Контрольная искусственная регрессия корректно дала ненулевой exit code и отдельный diff; после восстановления baseline повторный прогон снова PASS.
- На ширинах 360, 390 и 430 браузер подтверждает выбор новых `gallery-hero-mobile-v2` AVIF-производных.

Скриншоты и машинный список route-state проверок: `docs/sprint/screenshots/day-03/`.
Эталоны, текущие кадры, diff и JSON-отчёт: `docs/sprint/visual-regression/`.

## Ограничения / NOT VERIFIED

- Физические устройства, аппаратный GPU и 120 Hz: NOT VERIFIED.
- Production deployment и абсолютный production canonical/OG URL: NOT VERIFIED.
- Реальные события, контакты, юридические тексты, возрастная политика и согласия не предоставлены; используются явно маркированные демонстрационные/черновые состояния.
- Авторизация, серверная отправка, хранение данных, платежи и QR-проверка не реализовывались.
- Публикация не выполнялась.

---

# 03.8 — исправления по аудиту и закрытие этапа 03 (25.09.2026)

App root `/dev-server`; ветка управляется Lovable (git только чтение). Исходный HEAD `ccfe089f1f05269f622e9996a2c65cfbf81fbdec` (аудит — `950e05e…`). Промежуточный автокоммит платформы `15b5d5b8479738319b59cacb5efaa2ece1609c1c`. Документы `00_READ_FIRST`…`09_EXECUTION_PROMPTS` в репозитории **не найдены** (это ChatGPT Sources вне Lovable) — обновлены проектные копии ниже; перенос — вручную.

| Пункт | Причина → исправление | Проверка (B — свой прогон, эмуляция Chromium) |
|---|---|---|
| 01 Dialog | двойной translate (Tailwind `translate` + keyframes `transform`) → keyframes только opacity/`scale`; `w-[calc(100%-2rem)]`, `max-h-[calc(100dvh-2rem)]`, внутренний scroll, close 44×44 | B: 360/390/430/1440/1920/844×390 — окно внутри экрана, центр ±3 px; Escape → фокус на «Проверить заполнение» |
| 02 Черновик | `ApplyDraftProvider` над Outlet (React state в памяти), управляемые поля | B: rules→«Вернуться к форме», FAQ→Back, Forward/Back сохраняют; reload очищает; local/sessionStorage пусты, history state без ПД |
| 03 Выбор события | управляемый select, `navigate({replace, resetScroll:false})`, нормализация slug | B: общий→light-study-01→threshold-study-02→общий: URL/статус/ссылки согласованы; `?event=missing` не переносится |
| 04 Фокус пробы | `DialogTrigger` | B: после Escape фокус на «Проба окна» |
| 05 no-JS | `<noscript>` SVG + стиль 100svh + фоновые `<noscript>` картинки | B: no-JS 390×844 threshold 844 px, SVG загружен, 4 фона, CTA/футер есть; JS normal: static не появлялся, Canvas после loading; WebGL off: static, 0 Canvas |
| 06 FAQ-проба | настоящий Accordion | B: Enter → aria-expanded=true, animation 0.26s |
| 07 Image/Menu пробы | переиспользованы `ImageReveal replay` и `Stagger` | C |
| 08 Меню/off | CSS: menuMotion=false, manual, system → без fade/slide; off-пресет → dialog instant | B: 4 режима раздельно (manual с `data-reduce-motion=true` подтверждён), переход по ссылке → /about |
| 09 404 | `loader` + `notFound()` + `notFoundComponent`, noindex в head | B: GET `/events/bad-slug` → 404, «Событие не найдено — ВНЕ», noindex; валидный → 200; `/nope` → 404 |
| 10 Legal | `PageTransition quiet`, `QuietContext` для `SectionHeading` | B: h2 opacity 1 через 60 мс |
| 11 44 px | размеры на самих элементах: header, CTA, burger, close, radio, ссылки меню/формы | B: burger/close 44×44, пункты меню 44–53 |
| 12 Карта | `docs/design/site-motion-map.md` переписана | — |

Команды: `bun run typecheck` PASS; `bun run lint` 0 errors / 9 warnings (1 новое — fast-refresh в ApplyDraft); `bun run build` PASS; `bun test tests/` 9 pass. Доказательства: `docs/sprint/evidence/03-8/` (скрипты, JSON, скриншоты).

NOT VERIFIED: физические iPhone/Android, реальный GPU, экранный диктор, настоящий browser zoom 200%, TextSection/TextLoop/Scramble покадрово в этом прогоне (код не менялся), длинные тексты в окне. Мотион-настройки в тестовых контекстах изолированы; пользовательские не менялись.

Выводы первого прохода 03.8 уточнены в разделе «03.8 — продолжение» ниже (часть рисков оставалась незакрытой). Принята концепция Gallery of Light; финальная версия интерфейса художественной приёмки не получала; нет изолированной среды данных, модели ролей и утверждённых правил Auth/RLS/API.

## Инвентаризация URL

| URL | Статус | Контент | Ошибки / мета |
|---|---|---|---|
| `/` | готово (демо-данные) | vne-content | уникальный head |
| `/events`, `/events/:slug` | демо | site-content | неизвестный slug → 404 + noindex |
| `/about`, `/rules`, `/faq`, `/contact` | готово / черновик правил | site-content | head |
| `/apply` | демо, без отправки | site-content | head |
| legal ×5 | шаблон, не утверждён | DocumentPage | noindex |
| `/member`, `/admin`, `/scan`, `/i/:code`, `/c/:code` | будущие оболочки (04–08) | FutureShell | без ложного входа/допуска |
| прочее | 404 | root notFound | HTTP 404 |

## Handoff для 04
Реализованы маршруты и демонстрационные состояния; принята концепция Gallery of Light. **Финальная приёмка этапа 03 не завершена**, поэтому запуск этапа 04 остаётся открытым. Проверенный app SHA: `d9a05fc0bedd5e37b23225f7b7ae52facb302d5e`. Следующий автокоммит является только документационным и не меняет проверенный код приложения. До старта 04 нужны: изолированная среда данных (Lovable Cloud draft/локальный стенд), утверждённая матрица ролей (guest/member/admin/scanner) в отдельной таблице ролей, правила RLS/API и актуальная официальная документация Auth выбранной версии. Настоящая заявка — 05, оплата — 06, QR — 07, сканер — 08. Публикация не выполнялась; серверная интеграция, отправки, платежи и QR не запускались.


---

# 03.8 — продолжение (25.09.2026, после независимого review)

Базовая ревизия: HEAD `3cf70200906b89b5f11010baa1a348092c72ba50` (на старте), рабочее дерево во время прогонов соответствовало автокоммиту `cacd03f3a5472f45c7d36455927e094723737933` плюс правки прохода. Root независимо проверил итоговый код приложения на полном SHA `d9a05fc0bedd5e37b23225f7b7ae52facb302d5e`; следующий автокоммит является только документационным. Приведённые ниже SHA-256 — контрольные суммы наборов файлов, **не** git SHA.

| # | Риск | Исправление | Доказательство (`docs/sprint/evidence/03-8/browser-final.json`) |
|---|---|---|---|
| 1 | /apply без JS / до гидратации мог GET-отправить ПД | `<fieldset disabled>` до `useEffect` гидратации, `data-hydrated`, `<noscript>`-сообщение; без method/action-подмен | `apply_nojs`: поля и кнопка `:disabled`, click + Enter → URL не изменился, 0 запросов, ПД в URL нет. `apply_delayed_hydration` (скрипты задержаны): fieldset disabled, URL `/apply`, после гидратации включено |
| 2 | мусор проходил как телефон | `src/lib/contact-validation.ts`: email `^[^\s@]+@[^\s@]+\.[^\s@]+$`, одна `@`; телефон — только `+ цифры пробел ( ) -`, 7–15 цифр; `tests/contact-validation.test.ts` | `validation`: `-------`, `(((((((`, `a@b@c.ru` → ошибка; `+7 (999) 123-45-67`, `test@example.invalid` → окно |
| 3 | ImageReveal replay: сброс анимировался | длительность 0, пока hidden (оба слоя), затем один полный цикл | `admin_image_replay_curve`: opacity 0/y12/scale1.045 → 0.3 → 0.685 → … → 1/none за ~500 мс |
| 4 | Sheet мог обрезать главы | `overflow-y-auto overscroll-contain` у SheetContent | `menu_fit` 390×740, 360×640, 740×360: последняя ссылка «06 Приглашение» в видимой области после фокуса, прокрутка есть |
| 5 | no-JS портал перекрывал текст | только в `<noscript>`: портал в потоке под текстом, скрыты подсказка, «СБОРКА 00» и точки 01–03 | `nojs_hero` 360×640/360×800/390×844/844×390: пересечений 0; JS-режим без изменений. На 844×390 SVG расположен по y 397–533, ниже первого viewport: доказана естественная прокрутка без пересечений, но не полная видимость эмблемы в первом экране |
| 6 | hit-area | «Понятно» во всех окнах и пауза TextLoop — 44 px | `hit.dialog_ok` 44, close 44×44, пауза 44×44 |
| 7 | противоречивые доказательства | старые невалидные JSON удалены; один стабильный JSON (stdout отдельно от stderr, проходит `json.loads`) | `webgl_off`: webgl/webgl2 false, static 1, canvas 0; `modes` (normal/manual/system/preset-off с DOM-атрибутами): overlay меню 0.26→0.76→1 только в normal, в остальных 1 сразу; окно на 40 мс — opacity 0.265 только в normal; фокус после Escape; `admin_import`; `long_dialog` (прокрутка внутри, «Понятно» достижима) |
| 8 | ранее NOT VERIFIED | прогоны | `browser-final.json`: `text_roll` (matrix3d в фазе playing → plain), `text_section_forward_back` 0.388→1→0.388, Scramble 03/04/06 с промежуточными кадрами и финалом = метке, а для 05 только финал (`intermediate_differs=false`), `text_loop_home/about`, `about_media`, `card_hover`, `page_errors` []; `root-verification.json`: независимые промежуточные кадры Scramble 05 и финал «05 / СВОИ» на проверенном app SHA |
| 9 | формулировки | исторический баннер вверху; убраны «визуал принят» | — |

Снимки: `docs/sprint/evidence/03-8/shots/*.png` (текущий проход), `shots-first-pass/` (первый проход, окно).
Команды: typecheck PASS; lint 0 errors / 9 warnings; build PASS; `bun test tests/` 25 pass.

Дополнительная независимая проверка root на app SHA `d9a05fc0bedd5e37b23225f7b7ae52facb302d5e` сохранена в `docs/sprint/evidence/03-8/root-verification.json`: Scramble 05; ошибка `contact=-------` без окна и ПД в URL; геометрия/управление корректного Dialog; возврат фокуса по Escape; синхронизация `threshold-study-02` и сохранение черновика после возврата из Rules. Root-скриншоты переданы отдельным отчётом ChatGPT и не имеют заявленных путей в репозитории.

NOT VERIFIED: физические телефоны, реальный GPU, экранный диктор, настоящий zoom 200 %; художественная приёмка финальной версии.
Статус: исправления 03.8 выполнены и проверены автоматикой; **приёмка этапа 03 не завершена** — нужна проверка владельцем.
