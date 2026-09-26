# VNE Portal — premium motion v3

Дата: 2026-09-23  
Production publish: **не запускался**

## Версия и границы

- Проверочный SHA пользователя: `b3ab10f666b34335f715a2f26782892d2eda87ce`.
- Фактический исходный HEAD перед работой: `9a49e3eeb6b3a229a55f9c42c87b29062682c46c`.
- Ветка: `edit/edt-bb9f16ba-e461-4ce1-aaad-9e88a6fad565`.
- Проект не откатывался; изменения сделаны поверх актуального состояния.
- База, платежи, MCP, авторизация и другие продуктовые этапы не менялись.

## Реализация

- Один shared `displayedProgress` управляет звеньями, связанным светом и DOM-индикатором.
- Target остаётся нативным browser scroll; wheel/touch не перехватываются, Lenis и второй scroll engine не добавлялись.
- Damping: frame-rate-independent exponential response `105 ms`, без overshoot; endpoint epsilon `0.00035`.
- Delta после простоя ограничен `120 ms`: первый resume-frame не переносит накопленное время, но нормальный software-WebGL кадр не замедляет response до секунд.
- Demand rendering: scroll/resize/resume вызывают wake/invalidate; кадры продолжаются до convergence и прекращаются после неё. Hidden tab и modal pause переводят frameloop в `never`.
- Reveal/settle используют quintic smootherstep (C2). После окончания reveal каждое звено сразу продолжает settle — прежней мёртвой паузы синего `.25 → .60` нет.
- Разлёт и наклоны уменьшены; exact hidden и assembled endpoints сохранены.
- Исходные SVG paths/anchors, assembled offsets, цвета `#86ABFF/#30E5AD/#E55330`, Flow, шрифты, геометрия, фаски и один Canvas сохранены.
- `scroll=0` остаётся скрытым за доком; loading не показывает собранную арку. WebGL failure/reduced motion сохраняют исходный static SVG.
- Ready подтверждается после реального render-call и живого WebGL context, а приёмка дополнительно проверяет пиксели canvas и renderer.

## Meaningful tests

`tests/portal-motion.test.ts`: **6 PASS / 0 FAIL / 977 assertions**.

- совпадение результата damping на 30/60/120 Hz;
- монотонность вперёд и назад, отсутствие overshoot;
- clamp долгого resume delta;
- endpoints и непрерывность quintic easing;
- exact hidden/assembled poses;
- отсутствие неподвижного интервала после reveal каждого звена.

Логи:

- `docs/sprint/logs/portal-motion-tests.log`
- `docs/sprint/logs/portal-motion-typecheck.log`
- `docs/sprint/logs/portal-motion-lint.log`

`bunx tsgo --noEmit`: PASS.  
Targeted ESLint изменённых файлов: PASS.  
Последняя preview-сборка: `build OK`.

## Реальная WebGL-приёмка

Chromium headless, WebGL 2.0. Canvas присутствовал, static SVG отсутствовал, context не потерян, console/page errors: **0**.

Renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.

Это программный SwiftShader, **не физический GPU, не iPhone и не Android**.

Проверено:

- desktop `1280×720`, DPR `1`, drawing buffer `1280×720`;
- narrow mobile `390×844`, DPR `1.5`, drawing buffer `585×1266`;
- обычный медленный ход, дискретное колесо, быстрый scroll, stop/start, reverse;
- restore/reload на 60% → `СБОРКА 60`;
- final hold, resize `390×844 → 430×932` на 60% → `СБОРКА 60`;
- pause/resume и demand wake;
- настоящие WebGL-позы 0/20/40/60/82/100%.

### Frame timing

Метод: Chromium `requestAnimationFrame`, 5.003 s, непрерывный программный scroll `0 → 100 → 0`, одновременно работали damping, Three/R3F render, PBR-материалы, environment и тени.

- samples: `286`;
- median: `16.70 ms`;
- p95: `16.80 ms`;
- frames `>25 ms`: `2`;
- frames `>50 ms`: `2`.

Это показатель sandbox SwiftShader и не прогноз производительности телефона. Цель 60 fps на физическом устройстве остаётся **NOT VERIFIED**.

## Review media

- WebGL video, 15.04 s: `public/review/portal-motion-premium-v3.webm`.
- Contact sheet 0/20/40/60/82/100: `public/review/portal-motion-premium-v3-contact-sheet.png`.
- Оба файла отвечают HTTP 200 на локальном preview; video content type `video/webm`, sheet `image/png`.
- Внешний preview URL из sandbox отвечает HTTP 401 без preview-сессии; пользовательский preview должен открывать те же пути в авторизованной сессии.

Preview URLs:

- `https://id-preview--7e261ce4-c261-40b6-b169-b9806a6e37d7.lovable.app/review/portal-motion-premium-v3.webm`
- `https://id-preview--7e261ce4-c261-40b6-b169-b9806a6e37d7.lovable.app/review/portal-motion-premium-v3-contact-sheet.png`

## Изменённые файлы

- `src/config/motion-config.ts`
- `src/components/vne/PortalLinks.tsx`
- `src/components/vne/PortalScene.tsx`
- `src/components/vne/QualityController.tsx`
- `src/lib/portal-bounds.ts`
- `src/routes/index.tsx`
- `tests/portal-motion.test.ts`
- `public/review/portal-motion-premium-v3.webm`
- `public/review/portal-motion-premium-v3-contact-sheet.png`
- `docs/sprint/logs/portal-motion-*.log`
- `docs/sprint/portal-premium-motion-v3-report.md`
- `roadmap.md`

## Не проверено

- Физический iPhone/Safari.
- Физический Android/Chrome.
- Физический GPU и дисплеи 120 Hz.
