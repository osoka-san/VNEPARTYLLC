# Hero: удаление декоративных линий — 26.09.2026

## Причина

Линии создавались не фоновым изображением, а декоративной геометрией `Atmosphere()` в interactive WebGL: 13 вертикальными `boxGeometry` и непрозрачной нижней `planeGeometry`. Удаление прежнего DOM-дока не затрагивало этот источник.

## Изменения

- `src/components/vne/PortalScene.tsx`
  - удалены 13 декоративных брусьев и ground plane;
  - сохранены `Environment`, освещение и три цветных П-звена 10C11-6;
  - `ReadySignal` подтверждает состоявшийся пригодный render pass по номеру кадра, ненулевому canvas и живому контексту, не требуя draw call от видимой геометрии;
  - стартовая скрытая позиция вычисляется от нижнего края canvas с запасом 40 px, без удалённого `DockOccluder`.
- `src/config/motion-config.ts`
  - удалён неактуальный `dockOccluderPx`; сохранён `concealSafetyPx: 40`.
- `roadmap.md`
  - зафиксировано завершение узкой правки и целевых проверок.

Исходные PNG/AVIF/WebP, тексты, CTA, продолжение галереи, история Back/Forward, backend и другие страницы не менялись.

## Реальные проверки

### Interactive WebGL

Источник: `docs/sprint/evidence/hero-lines-fix/hero-lines-browser.json`.

| Viewport | Начало | Промежуточно | Собранная поза | Возврат |
| --- | --- | --- | --- | --- |
| 390×844 | progress 0; `СБОРКА 00`; canvas 390×844; context live | progress 0.4801; `СБОРКА 33` | scroll progress 1; отображаемый progress 1; `СБОРКА 100`, стабильно 400 мс | progress 0; `СБОРКА 00` |
| 1440×900 | progress 0; `СБОРКА 00`; canvas 1440×900; context live | progress 0.4802; `СБОРКА 33` | scroll progress 1; отображаемый progress 1; `СБОРКА 100`, стабильно 400 мс | progress 0; `СБОРКА 00` |

На каждом interactive шаге: `mode=interactive`, `canvasCount=1`, `contextLive=true`, loading/static отсутствуют, console/page errors отсутствуют. Кадры `mid` — переходные (`СБОРКА 33`), а `assembled` сняты только после достижения holdStart 0.82 и стабилизации отображаемого значения на `СБОРКА 100` в течение 400 мс. Стартовые и возвратные снимки визуально не содержат WebGL-брусьев, искусственного пола или цветных полос портала.

Снимки:

- `docs/sprint/evidence/hero-lines-fix/mobile-interactive-0.png`
- `docs/sprint/evidence/hero-lines-fix/mobile-interactive-mid.png`
- `docs/sprint/evidence/hero-lines-fix/mobile-interactive-assembled.png`
- `docs/sprint/evidence/hero-lines-fix/mobile-interactive-return-0.png`
- `docs/sprint/evidence/hero-lines-fix/desktop-interactive-0.png`
- `docs/sprint/evidence/hero-lines-fix/desktop-interactive-mid.png`
- `docs/sprint/evidence/hero-lines-fix/desktop-interactive-assembled.png`
- `docs/sprint/evidence/hero-lines-fix/desktop-interactive-return-0.png`

### Static smoke

- Reduced motion, 390×844: `mode=static`, `data-static-portal` видим, canvas отсутствует.
- Принудительная ошибка WebGL, 1440×900: `mode=static`, `data-static-portal` видим, canvas отсутствует.
- Снимки: `mobile-reduced-static.png`, `desktop-webgl-failure-static.png` в той же evidence-папке.

### Команды

- `bun run typecheck` — exit 0.
- `bun run test:motion` — exit 0, 6 pass / 0 fail.
- `bun run build` — exit 0.

## Ограничения

Проверка выполнена в headless Chromium с рабочим WebGL-контекстом и отдельно с принудительно отключённым WebGL. Physical iOS NOT VERIFIED; desktop Safari/Firefox также не проверялись. Полный visual suite намеренно не запускался согласно ограничению задачи.