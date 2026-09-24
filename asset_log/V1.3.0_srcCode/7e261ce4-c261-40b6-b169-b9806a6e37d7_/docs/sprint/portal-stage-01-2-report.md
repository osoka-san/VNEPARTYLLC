# ВНЕ / ПОРОГ — отчёт приёмки этапа 01.2

Дата проверки: 23 сентября 2026 года  
Проект: `7e261ce4-c261-40b6-b169-b9806a6e37d7`  
Ветка контрольной проверки: `edit/edt-bc1e379e-bec7-4f63-9fe0-8bd35c2374ce`  
Контрольный HEAD перед записью отчёта: `bf5e92329e5430ea5ea21428647f97a94377db5a`

## Результат

Ревизия 01.2 реализована и проверена на актуальной версии проекта. Первый экран сохраняет утверждённую scroll-анимацию и её двунаправленность, но теперь безопасно проходит состояния до импорта, загрузки renderer, потери контекста и полного отсутствия WebGL. Публикация не выполнялась; база, платежи, подключения и production не изменялись.

Архив `screen_audit_day_0101.zip` и старый `day-0101-report.md` использовались только как историческая справка. Их статусы не считались актуальными доказательствами.

## Реализовано

- До импорта Three/R3F показывается нейтральный тёмный `PortalLoadingFallback`, без вспышки собранной эмблемы.
- `prefers-reduced-motion` проверяется до монтирования 3D-модуля; в этом режиме сразу отображается точный статичный SVG.
- Динамический импорт защищён локальной error boundary и активным таймером 8 секунд. Таймер не расходуется при скрытой вкладке или открытом диалоге; позднее разрешение импорта не возвращает сцену после terminal fallback.
- Готовность WebGL подтверждается после реального render pass через `addAfterEffect`, при живом контексте, ненулевом canvas и наличии render calls.
- Renderer имеет отдельный активный таймер 4 секунды. Потеря `webglcontextlost` переводит экран в terminal static без цикла повторной инициализации.
- Сохранены один Canvas, demand rendering, native scroll, shared `displayedProgress`, frame-rate-independent damping, exact endpoints и reverse-scroll.
- Для высоты менее 560 px добавлен отдельный fit композиции; пропорции SVG не меняются.
- Цвета вынесены в canonical-модель `design-config.ts`; `brand-tokens.css` генерируется и проверяется на drift.
- `SVGLoader.createShapes` заменён на актуальный `shapePath.toShapes()`.
- Добавлен воспроизводимый Playwright-harness `tests/portal-stage-01-2.py` и отдельные npm/bun-команды приёмки.

## Браузерная матрица

Все перечисленные сценарии прошли в финальном автоматическом прогоне:

| Сценарий | Результат | Доказательство |
| --- | --- | --- |
| Pre-import loading без арки | PASS | `01-loading.png` |
| Ready при progress 0 | PASS | `02-ready-zero.png` |
| Первый scroll | PASS | `03-first.png` |
| Промежуточная сборка | PASS | `04-mid.png` |
| Реальные WebGL-пиксели | PASS | `04-mid-canvas.png`: 6 241 цвета, 139 399 non-dark px |
| Hold при 100% | PASS | `05-hold.png` |
| Reverse до 0% | PASS | `06-reverse-zero.png` |
| Resize ниже активной секции | PASS | `07-resize-below.png` |
| Reduced motion до импорта сцены | PASS | `08-reduced-motion.png` |
| Short landscape 844×390 | PASS | `09-landscape-mid.png` |
| Ошибка импорта → static | PASS | `10-module-reject-static.png` |
| Reload восстанавливает scroll-позу | PASS | `11-reload-restored.png` |
| Потеря WebGL-контекста → static | PASS | `12-context-lost-static.png` |
| Таймер импорта при диалоге остаётся на loading | PASS | `13-module-timeout-paused.png` |
| Активный timeout импорта → static | PASS | `14-module-timeout-static.png` |
| Onest и Unbounded с кириллицей | PASS | запись `15-fonts` в acceptance log |
| WebGL отключён при запуске → static | PASS | `16-webgl-unavailable-static.png` |

Скриншоты находятся в `docs/sprint/screenshots/portal-stage-01-2/`. Полный машинный вывод — в `docs/sprint/logs/portal-stage-01-2-acceptance.log`.

Renderer интерактивных кадров:

```text
ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
```

Это подтверждает настоящий WebGL-render и пиксели Canvas в Chromium/SwiftShader, но не физический GPU.

## Инженерные проверки

| Команда | Результат |
| --- | --- |
| `bun run typecheck` | PASS, `tsgo 7.0.0-dev.20260320.1` |
| `bun run tokens:check` | PASS |
| `bun run test:motion` | PASS: 6 тестов, 977 assertions |
| `bun run test:acceptance` | PASS: все сценарии выше |
| `bun run lint` | PASS: 0 ошибок, 6 прежних Fast Refresh warnings в UI-компонентах |
| `bun run build` | PASS: client, SSR и Nitro build |

Логи каждой команды сохранены в `docs/sprint/logs/portal-stage-01-2-*.log`. Build предупреждает о крупном lazy chunk `PortalScene` и устаревшей отдельной настройке `vite-tsconfig-paths`; это не блокирует сборку и не изменялось вне объёма этапа.

`motion-config.ts` и `PortalLinks.tsx` не имели diff на контрольной проверке: утверждённые позы, easing и характер движения не переписывались.

## Ограничения проверки

- Физический iPhone/Safari: **NOT VERIFIED**.
- Физический Android/Chrome: **NOT VERIFIED**.
- Физический GPU и экран 120 Гц: **NOT VERIFIED**.
- Автоматическая проверка выполнена в headless Chromium с SwiftShader; WebGL-unavailable дополнительно проверен запуском Chromium с отключёнными WebGL и software rasterizer.
- Реальная отправка, оплата, база, роли и авторизация не входят в этап и не проверялись.

## Итоговый статус

**PASS для программной и Chromium-приёмки этапа 01.2 с перечисленными ограничениями физических устройств.**