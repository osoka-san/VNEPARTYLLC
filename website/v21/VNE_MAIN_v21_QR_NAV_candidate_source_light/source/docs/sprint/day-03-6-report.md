# Этап 03.6 — слой движения Motion-Primitives (24.09.2026)

## Audit
TanStack Start, React 19.2, Tailwind 4.3.3, three 0.186 + @react-three/fiber 9.7. `motion`/`framer-motion` отсутствовали — дублирования нет. Существующее движение: CSS transitions, scroll-сборка портала (не менялась), ручной `data-reduce-motion`.

## Installed
- `motion` ^12 (Motion for React). Больше зависимостей нет; Nim и Motion-Primitives не клонировались — примитивы переписаны минимально.

## Custom primitives
- `src/lib/motion.ts` — токены: fast 160 мс, standard 400, cinematic 800, atmospheric 1400; ease/spring; hero-тайминги; magnetic ≤6 px; tilt ≤3°; hover 1.015 / tap 0.98.
- `MotionProvider` — системный prefers-reduced-motion + ручной переключатель → `MotionConfig`; флаг мыши (`hover: hover and pointer: fine`).
- `Reveal` — opacity/translateY 16/blur 8, один раз; скрытая поза назначается только блокам ниже экрана при монтировании (SSR-текст видим, без flash/гидратационных ошибок).
- `Magnetic`, `TiltGlow`, `TextScramble` (в `Interactive.tsx`).

## Pages
- Главная: последовательность hero на CSS (подпись 0.3 с → заголовок 0.5 → подзаголовок 0.75 → CTA 0.95), независимо от портала; Magnetic на двух основных CTA; Reveal у глав 02, 03, 06.
- /events: TiltGlow (≤3°, свечение mint) у карточек, однократный scramble метки «Демо / не анонс».

## Mobile
Magnetic, наклон и свечение отключены (нет fine pointer). Остаются только короткие проявления.

## Accessibility
Reduced motion (системный или ручной) — hero без анимации, Reveal мгновенный, scramble не запускается; экранный диктор читает исходный текст метки.

## Performance
Портал, `PortalScene`, `motion-config`, `StaticFallback`, `GalleryBackground` не изменены; DOM-анимации не связаны с кадрами Canvas. FPS/INP на устройствах — NOT VERIFIED.

## Проверки
| Проверка | Статус |
|---|---|
| typecheck, lint (0 ошибок, 7 warning прежнего типа) | PASS |
| test:motion 6/6 | PASS |
| site-pages 22 сценария | PASS |
| visual-regression 95/95, 0 регрессий (reduced motion) | PASS |
| acceptance 72 сценария | PASS |
| Полное движение 1440/390: заголовок виден, глава 06 проявляется, консольных ошибок 0 | PASS |
| Физические устройства, GPU, production | NOT VERIFIED |

## Дополнительный проход
- Добавлены `Stagger`, `TextReveal`, `Glow`, `TextShimmer` и `ImageReveal` с единым набором настроек и полным отключением в reduced-motion.
- Пункты меню проявляются каскадом; фон меню получает управляемое размытие.
- Галерейные изображения мягко проявляются без второй загрузки источника.
- Диалоги, боковая панель и переходы страниц получили короткие согласованные состояния входа/выхода.
- Заголовки страниц, заголовки секций и короткие акценты проявляются при прокрутке; содержимое первого экрана остаётся видимым при SSR и не вспыхивает.
- Shimmer ограничен короткой демонстрационной меткой, glow — точечными интерактивными состояниями; бесконечные декоративные циклы не добавлены.
- Панель `/admin` управляет всеми дополнительными эффектами, позволяет выбрать пресет, настроить параметры, сбросить, импортировать и экспортировать JSON. Настройки остаются только в браузере.

## Итоговая проверка дополнительного прохода
| Проверка | Статус |
|---|---|
| production build + build smoke | PASS |
| typecheck, lint (0 ошибок, 7 прежних warning) | PASS |
| motion 6/6, acceptance 72, static matrix, geometry G1, tokens | PASS |
| visual regression 95/95 после намеренного обновления baseline | PASS |
| Физические устройства, GPU, опубликованная версия | NOT VERIFIED |

## Files changed
package.json, bun.lock, src/lib/{motion,motion-settings}.ts, src/components/motion/{MotionProvider,Reveal,Interactive,Primitives,PageTransition}.tsx, src/components/admin/MotionControlPanel.tsx, src/components/app/{AppHeader,EventCard,GalleryBackground,PageShell}.tsx, src/components/ui/{dialog,sheet}.tsx, src/routes/{__root,index,admin}.tsx, src/styles.css, visual baseline/report, roadmap.md, этот отчёт.

## Revisions
- Исходный commit до дополнительного прохода: `e55120c3dfdd2031362d4330d1abffa00514a4f8`.
- Итоговый commit создаётся владельцем проекта после визуальной приёмки; рабочая версия проверена без публикации.

## Text system completion — 2026-09-24

- Added semantic text motion across the home page, events listing, event detail, admin shell, header and footer.
- Added independent heading, body and accent styles: fade, rise, blur, mask, scale and off.
- Added block, line, word and character sequencing with duration, delay, stagger, distance, blur, scale, viewport and repeat controls.
- Added hero sequencing and switches for button/link, event-card and admin text.
- Added three replayable live samples in the admin motion panel; presets, reset and JSON transfer include text settings.
- Confirmed existing controls for staggered mobile-menu items, menu backdrop blur, short accent shimmer, page transitions and dialog transitions.
- Reduced motion bypasses text splitting and movement, leaving server-rendered text immediately visible.

### Verification

- Typecheck: PASS
- Lint: PASS (0 errors; 7 existing Fast Refresh warnings)
- Motion unit tests: 6/6 PASS
- Portal acceptance: 72 scenarios PASS
- Static fallback matrix: 16/16 PASS
- Portal geometry G1: PASS
- Production build smoke: PASS
- Browser checks at live `/`, `/events`, `/events/light-study-01`, `/admin`: PASS; no console errors or horizontal overflow
- Physical iPhone/Safari, Android/Chrome, GPU/120 Hz and owner visual sign-off: NOT VERIFIED
- Visual regression after intentional baseline update: 95/95 PASS; 0 runtime errors
