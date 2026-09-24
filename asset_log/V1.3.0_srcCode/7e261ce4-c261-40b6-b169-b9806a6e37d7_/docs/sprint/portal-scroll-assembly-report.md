# ВНЕ / ПОРОГ — scroll-сборка портала

## Версия и границы работы

- SHA до изменений: `a31b7fb53d675cacd5fc96b4f8feca291eadfbe0`.
- SHA после изменений: `6ca2b6a352a37e595445c60dfbdac02e8ef81bcf`.
- Ветка проекта: `edit/edt-fb778c84-0441-4ce0-979a-4d35a22ca20a`.
- Production не публиковался; MCP, серверные данные, авторизация, платежи и следующие этапы не менялись.

## Реализация

- Удалён таймерный intro и его sessionStorage-состояние. Поза каждого звена теперь является чистой функцией текущего scroll-прогресса: reload, прямой возврат и обратная прокрутка дают ту же позу без автопроигрывания и скачков.
- Интервалы: синее звено `0–25%`, мятное `20–45%`, оранжевое `38–60%`, точная сборка всех трёх `60–82%`, удержание готовой эмблемы `82–100%`.
- Сохранены исходные `createPortalGeometry`, SVG path/anchors, фирменные цвета, depth/bevel, FrontSide, assembled offsets и постановка света.
- Hidden-поза вычисляется из реальных bounds, камеры, масштаба и экранной верхней границы `DockOccluder`. Добавлен запас скрытия 40 px; детали стартуют по центру, вложены по anchors и разнесены только по Z.
- Fit всех видимых scroll-поз считается по исходной геометрии. Резерв под текст/CTA: 40% высоты desktop и 56% mobile.
- CTA сборки переименован в «Открыть портал» и прокручивает к концу секции. При нулевом прогрессе доступна подсказка «Прокрутите, чтобы открыть портал».
- Reduced motion и отказ WebGL по-прежнему показывают собранный `portal-master.svg`; сохранены один Canvas, bounded loading→ready/static, context-lost fallback, пауза при диалоге/скрытой вкладке и защита resize ниже секции.
- Обычные SSR, `ClientOnly`/`Suspense` и renderer-loading состояния используют отдельный тёмный placeholder без эмблемы. Собранный SVG теперь монтируется только после подтверждённого static/reduced-motion режима, поэтому до первого scroll отсутствует flash готового портала.

## Изменённые файлы

- `src/config/motion-config.ts` — интервалы, scroll-позы, вычисляемая hidden-поза.
- `src/components/vne/PortalLinks.tsx` — детерминированное scroll-управление без таймера/FSM intro.
- `src/components/vne/PortalScene.tsx` — screen-space расчёт скрытия за доком и обновлённая безопасная область.
- `src/components/vne/PortalLoadingFallback.tsx` — нейтральный тёмный первый кадр без собранной эмблемы.
- `src/lib/portal-bounds.ts` — bounds по всем ключевым scroll-позам.
- `src/routes/index.tsx` — доступная подсказка в начальном состоянии.
- `src/content/vne-content.ts` — подпись CTA «Открыть портал».
- `src/components/vne/IntroController.tsx` — удалён как неиспользуемый таймер.

## Проверка

Окружение: Playwright Chromium headless, SwiftShader WebGL. Физические устройства не были доступны.

| Сценарий                            | Результат                                                                                                                          | Доказательство                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Нет движения без scroll после 2.5 с | PASS — `СБОРКА 00`, портал скрыт                                                                                                   | `screenshots/portal-scroll-1440x900-initial.png`, `screenshots/portal-scroll-390x844-initial.png` |
| Первый HTML/SSR-кадр                | PASS — Flow, CTA и подсказка читаемы; static SVG=0, canvas=0                                                                       | `screenshots/portal-scroll-no-flash-ssr.png`                                                      |
| Hydration/Suspense loading          | PASS — собранной арки нет; static SVG=0, canvas=0                                                                                  | `screenshots/portal-scroll-no-flash-loading.png`                                                  |
| Первый ready до scroll=0            | PASS — 3D-звенья скрыты доком; static SVG=0, canvas=1, `СБОРКА 00`                                                                 | `screenshots/portal-scroll-no-flash-ready-zero.png`                                               |
| Начало scroll                       | PASS — появляется только выходящая синяя грань, готовая арка не мелькает                                                           | `screenshots/portal-scroll-no-flash-first-scroll.png`                                             |
| Первый scroll и промежуточная поза  | PASS — позы следуют scroll; на 48% вышли синее и мятное звенья                                                                     | `screenshots/portal-scroll-1440x900-mid.png`, `screenshots/portal-scroll-390x844-mid.png`         |
| Финальная сборка и hold             | PASS — на 82–100% сохраняется одна и та же собранная эмблема                                                                       | `screenshots/portal-scroll-1440x900-final.png`, `screenshots/portal-scroll-390x844-final.png`     |
| Reverse к 0                         | PASS — детерминированный возврат под док, `СБОРКА 00`                                                                              | `screenshots/portal-scroll-1440x900-reverse.png`, `screenshots/portal-scroll-390x844-reverse.png` |
| Reload на 92%                       | PASS — восстановлено `СБОРКА 92`, без intro                                                                                        | автоматический прогон `check.py`                                                                  |
| Initial renderer failure            | PASS — до решения остаётся тёмный loading; после bounded timeout `data-mode=static`, canvas=0, SVG=1                               | `screenshots/portal-scroll-no-flash-webgl-failure.png`                                            |
| Потеря контекста после ready        | PASS — переход в static, canvas=0                                                                                                  | автоматический прогон `failure_and_states.py`                                                     |
| Reduced motion                      | PASS — static SVG, canvas=0, progress отсутствует                                                                                  | `screenshots/portal-scroll-reduced-motion.png`                                                    |
| Resize ниже портала                 | PASS — следующий раздел остаётся видимым, возврата к portal section нет                                                            | `screenshots/portal-scroll-next-section-after-resize.png`                                         |
| Один Canvas / ошибки приложения     | PASS — canvas=1 в WebGL-режиме, console errors=0 на desktop/mobile                                                                 | автоматический прогон `check.py`                                                                  |
| Front silhouette против master SVG  | PASS — исходные geometry paths, anchors и assembled offsets не менялись; допустимое различие создают сохранённые perspective/depth | `screenshots/portal-scroll-overlay-comparison.png`                                                |
| Физический iPhone / Safari          | NOT VERIFIED — устройства нет                                                                                                      | —                                                                                                 |
| Физический Android                  | NOT VERIFIED — устройства нет                                                                                                      | —                                                                                                 |

## Команды

- `bun run lint` → PASS: 0 ошибок, 6 существующих предупреждений Fast Refresh в `src/components/ui/*`.
- `bunx tsgo --noEmit` → PASS, без вывода.
- Автоматическая preview-сборка → PASS, последний сигнал `build OK`.
- Playwright `check.py`, `failure_and_states.py`, `regression.py`, `check_portal_no_flash.py` → PASS для перечисленных сценариев. Отдельно зафиксированы SSR, задержанный lazy/Suspense, ready при progress=0 и первый scroll. При намеренно заблокированном WebGL зарегистрирована ожидаемая ошибка создания контекста, после чего сработал static fallback.

## Ограничения

- Проверка выполнена в Chromium/SwiftShader, не на физическом GPU мобильного устройства.
- Overlay использует ту же неизменённую исходную геометрию/assembled offsets и сохранённую фронтальную сравнительную съёмку; текущая сценическая камера оставляет лёгкую перспективу и видимые боковины по художественному заданию.
