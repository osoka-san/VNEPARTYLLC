# ВНЕ / ПОРОГ — отчёт приёмки этапа 01.3

Дата прогона: 23 сентября 2026, 12:30–12:53 UTC
Проект: `7e261ce4-c261-40b6-b169-b9806a6e37d7`
Ветка: `edit/edt-9dd1841b-fd08-4d5b-871e-beff42a37636`
Code SHA прогонов: `9842d0edf76ff1c13c4b90201ed5f8f32ca12c9e`
Исходный внешний аудит: `baae7ec1317dc74d8b73366c8655059323cab86e` (отчёт 01.2 — `bf5e923`)
Рабочее дерево: изменения этапа 01.3 (layout статичного портала, resize below, harness, скрипты, логи).

Среда приёмки: Python 3.13.12, Playwright 1.56.0 (headless Chromium, SwiftShader), Bun 1.3.3.
Установка harness: `pip install playwright pillow && python3 -m playwright install chromium`.
Dev-сервер: `bun run dev` на `http://localhost:8080`, переменная `PORTAL_BASE_URL` по умолчанию указывает туда же.
Собранное приложение: `bun run build`, затем воркер-рантайм `wrangler dev server/index.mjs --assets ./client` (пресет сборки `cloudflare-module`, `vite preview` для него неприменим).

## 1. Исправленные дефекты

| Дефект | Статус | Что сделано |
| --- | --- | --- |
| Пересечение статичной эмблемы с CTA «Получить приглашение» (500×860) | ЗАКРЫТ | `StaticFallback.tsx` измеряет реально занятое копией, кнопками и доком место и выбирает наибольшую свободную область (под копией либо справа от неё), зазор 16 px, пропорции SVG не меняются |
| Короткие раскладки: эмблема схлопывалась, CTA налезал на док | ЗАКРЫТ | `styles.css`: короткая ландшафтная `@media (height < 600px) and (width >= 640px)`, короткая портретная `@media (height < 700px) and (width < 640px)`, док в ландшафте поднят |
| `shortViewport`-fit: `max(160, width - 2 * width * 0.55)` всегда давал 160 | ЗАКРЫТ | `PortalScene.tsx`: расчёт через `gutterPx`/`copyColumnPx`/`leftReservePx`; `shortViewport = height < 600 && width >= 640` |
| Потеря места чтения при resize ниже портала | ЗАКРЫТ | `routes/index.tsx`: `belowOffsetRef` хранит смещение от конца портала; «читаю ниже» определяется по состоянию до изменения геометрии, т. к. браузер успевает обрезать `scrollY` |
| `tokens:check` перезаписывал проверяемый CSS | ЗАКРЫТ | общий рендер вынесен в `scripts/brand-tokens.ts`; `check-brand-tokens.ts` только сравнивает, запись осталась в `tokens:generate` |
| Логи приёмки не попадали в дерево (`.gitignore` исключал `*.log`) | ЗАКРЫТ | узкое исключение `!docs/sprint/logs/` и `!docs/sprint/logs/**/*.log`; остальные логи по-прежнему игнорируются |

Подтверждённые ранее решения не откатывались: локальная защита динамического импорта, раздельные активные таймеры импорта (8 с) и renderer (4 с), terminal static без повторной инициализации, reduced motion до загрузки сцены, нейтральный loading, готовность после render pass, один Canvas, demand rendering, native scroll, shared `displayedProgress`, damping, точные endpoints и reverse. `motion-config.ts` и `PortalLinks.tsx` не изменялись.

## 2. Приёмочный harness

Один сфокусированный harness: `tests/portal-acceptance.py` (`bun run test:acceptance`), 71 запись, все PASS.
Полный машинный вывод: `docs/sprint/logs/portal-stage-01-3-acceptance.log`, кадры: `docs/sprint/screenshots/portal-stage-01-3/`.
Каждый кадр сопровождается метаданными: viewport, DPR, renderer, scrollY, raw/displayed progress, режим, количества Canvas/static/loading.

| Группа | Сценарии | Результат |
| --- | --- | --- |
| Loading и готовность | 01-loading (импорт задержан управляемо, собранной арки нет), 02-ready-zero + композиция скрытой позы | PASS |
| Desktop scroll | 03-first, 04-mid, 05-hold, 06-reverse-zero | PASS |
| Мобильные портреты | 27-mobile-390×844 и 28-mobile-360×740: reveal, mid, assembled, reverse + композиция (звенья, Flow, CTA, док) | PASS |
| Ландшафт | 09-landscape-mid 844×390 | PASS |
| Отказы импорта | 10-module-reject-static, 19-late-import-after-static (импорт завершается после terminal static: Canvas не возвращается, loading не возвращается, CTA работает) | PASS |
| Таймеры и пауза | 13-module-timeout-paused (диалог и скрытая вкладка не расходуют 8 с), 14-module-timeout-static | PASS |
| Renderer | 12-context-lost-static | PASS |
| Reload и навигация | 11-reload-restored, 11b-history-navigation, 17/18 early scroll во время loading | PASS |
| Resize | 20 внутри портала, 21 ниже портала (место чтения сохранено), 22 при открытом диалоге, 23 переход в fallback во время чтения ниже, 24 в static | PASS |
| Reduced motion | 08 (чанк сцены не запрашивается — проверка по three/fiber/drei, а не по имени файла), 25/26 переключение предпочтения | PASS |
| Доступность и шрифты | Escape, возврат фокуса, полный цикл Tab/Shift+Tab в диалоге, 15-fonts: Onest и Unbounded загружены и отрисованы кириллицей | PASS |
| WebGL недоступен | 16-webgl-unavailable-static | PASS |

Дополнительные harness:

- `bun run test:static-matrix` — 16 размеров × 2 режима (reduced motion, WebGL off), все PASS: `docs/sprint/logs/portal-stage-01-3-static-matrix.log`.
- `bun run test:build-smoke` — целевой smoke-test собранного приложения: загрузка сцены с живым WebGL, статичный портал при отключённом WebGL, отсутствие запроса чанка сцены при reduced motion. PASS: `docs/sprint/logs/portal-stage-01-3-build-smoke.log`.
- `bun run test:geometry` — сравнение геометрии, см. раздел 3.

Renderer интерактивных кадров: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Это настоящий WebGL-render, но не физический GPU.

## 3. G1 — сравнение геометрии

`tests/portal-geometry-compare.py`: фронтальная ортографическая проекция реальной three-геометрии (общие anchors, единый `SVG_TO_WORLD`, без независимого масштабирования звеньев) накладывается на исходные front profiles `public/brand/portal/portal-front-profiles.svg`.

| Звено | IoU | Наружу, ед. SVG | Потеряно, ед. SVG |
| --- | --- | --- | --- |
| portal-link-01 | 0.9429 | 1.80 | 0.00 |
| portal-link-02 | 0.9262 | 1.80 | 0.00 |
| portal-link-03 | 0.8703 | 2.12 | 0.00 |

Проекция нигде не теряет исходный контур; расхождение только наружу и укладывается в внешний bevel экструзии (`bevel = 0.012` world = 1.2 ед. SVG, на углах до √2·bevel). Геометрия не подгонялась. Художественная перспектива, глубина и нарисованные боковые грани master SVG в это сравнение не входят — это другой тип проекции.

Артефакты: `docs/sprint/screenshots/portal-stage-01-3/g1-overlay-source-vs-projection.png`, `g1-geometry-compare.json`.

## 4. Инженерные команды

| Команда | Результат | Лог |
| --- | --- | --- |
| `bun run typecheck` | PASS | `portal-stage-01-3-typecheck.log` |
| `bun run tokens:check` | PASS (без записи в CSS) | `portal-stage-01-3-tokens-check.log` |
| `bun run test:motion` | PASS: 6 тестов, 977 assertions | `portal-stage-01-3-test-motion.log` |
| `bun run test:acceptance` | PASS: 71 запись | `portal-stage-01-3-acceptance.log` |
| `bun run test:static-matrix` | PASS | `portal-stage-01-3-static-matrix.log` |
| `bun run test:geometry` | PASS | `g1-geometry-compare.json` |
| `bun run test:build-smoke` | PASS | `portal-stage-01-3-build-smoke.log` |
| `bun run lint` | PASS: 0 ошибок, 6 прежних Fast Refresh warnings | `portal-stage-01-3-lint.log` |
| `bun run build` | PASS | `portal-stage-01-3-build.log` |

Пакеты: между `bf5e923` и `baae7ec` менялся `package.json` — это фиксация точных версий, а не обновление установленных пакетов; `bun.lock` подтверждает неизменность установленных версий.

## 5. NOT VERIFIED и BLOCKED

- **NOT VERIFIED**: renderer-таймаут 4 с при успешном импорте без пригодного кадра — недостижим в headless Chromium без публичного переключателя отказа; такой переключатель в UI намеренно не добавлялся.
- **NOT VERIFIED**: физический iPhone/Safari, Android/Chrome, реальный GPU, экран 120 Гц.
- **BLOCKED (GH1)**: соответствие исходников GitHub. Ветка `public` в `osoka-san/VNEPARTYLLC` остаётся на `94a2b9f` и содержит материалы, а не текущие исходники; проверенный SHA `9842d0e` в GitHub отсутствует. Внутренняя ветка `edit/...` доказательством синхронизации не считается. Оставшийся шаг — владелец подключает репозиторий через меню проекта и назначает отдельную ветку приложения (например `app/main`), не перезаписывая `public`.

## 6. Итоговый статус

**PASS для программной и Chromium-приёмки этапа 01.3** при перечисленных ограничениях физических устройств. Полный PASS этапа 01 не объявляется: пункт GH1 остаётся BLOCKED и требует решения владельца. Публикация не выполнялась; база, роли, авторизация, платежи и подключения не изменялись. Этап 02.0 не начат.
