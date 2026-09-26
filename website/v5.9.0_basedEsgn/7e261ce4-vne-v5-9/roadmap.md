# VNE stage 1.1

## Gallery of Light addon v4 — 25.09.2026

- [ ] Подключить выбранные владельцем изображения v4 и обновить официальный реестр
- [ ] Проверить все публичные страницы в desktop/mobile и сохранить полноразмерные снимки
- [ ] Передать полную актуальную библиотеку ассетов и снимки страниц в ZIP

## Расширение Text Scramble — 25.09.2026

- [x] Добавить typed registry и opt-in подключения публичных редакционных акцентов
- [x] Расширить schema v6, reusable runtime и блок управления `/admin`
- [x] Проверить unit/typecheck/lint/build и browser matrix без обновления общего baseline
- [x] Сохранить точечные evidence и итоговый отчёт

## Расширение текстовой motion-системы — 25.09.2026

- [x] Добавить Text Sections в фирменном mint/cyan и расширить настройки Text Scramble
- [x] Разделить группы Text Effect / Loop / Roll / Scramble / Sections в `/admin`
- [x] Подключить эффекты к согласованным страницам без двойных входов и анимации фактов
- [x] Провести целевой runtime-аудит, сохранить снимки и обновить motion-документацию

## Каноническое решение дизайна — 24.09.2026

- [x] Отменить прежнее предложение тонального «разбавления» и сохранить его как исторически отменённое
- [x] Зафиксировать единый дизайн-код Gallery of Light: [`docs/design/unified-design-code.md`](docs/design/unified-design-code.md)
- [x] Зафиксировать концепции и фактический статус всех страниц: [`docs/design/page-concepts.md`](docs/design/page-concepts.md)
- [x] Зафиксировать ограниченные пакеты будущей реализации: [`docs/design/unified-design-implementation-plan.md`](docs/design/unified-design-implementation-plan.md)
- [x] Реализовать презентационные пакеты 1–4 + 5A по последующему поручению владельца

## Реализация единой композиции Gallery of Light — поручение владельца

- [x] Подключить точные pine-canopy и dark-water из `VNE_Unified_About_Assets.zip`, обновить реестр и проверить 14 изображений
- [x] Реализовать общую композиционную оболочку пакета 1 без изменения портала и motion-контролов
- [x] Пересобрать `/about`, `/events` и оба detail по каноническому редакционному сценарию
- [x] Согласовать `/apply`, `/rules`, `/faq`, `/contact`, документы и кодовые/error-состояния
- [x] Согласовать демонстрационные оболочки `/member`, `/admin`, `/scan` без серверных операций
- [x] Проверить responsive, SSR/no-JS, navigation/focus, reduced/off, форму, FAQ и admin interactions
- [x] Выполнить typecheck, tokens, lint, build и релевантные тесты; сохранить отчёт и доказательства

- [x] Correct portal geometry winding, units, depth, bevel, material, and reference projection
- [x] Make intro interruption, skip, scroll, resize, and pause deterministic
- [x] Restore SSR HTML and isolate the single WebGL canvas
- [x] Fit separated and assembled states across required desktop/mobile viewports
- [x] Finish dock, typography, Russian labels, dialogs, and static fallback UX
- [x] Verify visual states, overlay, interaction, fonts, WebGL contexts, lint, and build gate
- [x] Add one frame-rate-independent displayed progress for portal, lighting, and indicator
- [x] Remove dead motion phases while preserving exact hidden and assembled endpoints
- [x] Verify real WebGL pixels, interactions, 30/60/120 Hz behavior, and frame timing
- [x] Record WebGL review video and contact sheet under public/review
- [x] Write docs/sprint/portal-premium-motion-v3-report.md
- [x] Build Stage 02 chapters with the eight Gallery of Light responsive backgrounds
- [x] Verify desktop 1440/1920 and mobile 360/390/430 in WebGL, static, and reduced-motion modes
- [x] Save before/after evidence and write docs/sprint/day-02-report.md with factual statuses

# VNE stage 03

- [x] Add public event, event detail, application, project, rules, FAQ, contact, and draft document pages
- [x] Add honest future shells for invitation/card codes, member, admin, and scanner
- [x] Preserve one WebGL canvas on the home portal and use static internal pages
- [x] Add shared navigation, footer, motion preference, focus handling, route metadata, and sitemap
- [x] Verify route states, event context, local-only form, FAQ anchor, history, mobile menu, required widths, and 200% zoom
- [x] Re-run portal acceptance, static matrix, geometry, build, build smoke, tokens, typecheck, and lint
- [x] Write docs/sprint/day-03-report.md with factual PASS and NOT VERIFIED statuses

# Visual regression audit

- [x] Replace the mobile hero v2 source with the owner-provided PNG and rebuild responsive derivatives
- [x] Add deterministic screenshots for every public HTML route at 360, 390, 430, 1440, and 1920 px
- [x] Add explicit baseline updates, pixel comparison, diff images, and a machine-readable report
- [x] Generate the reviewed baseline and verify a clean regression run
- [x] Re-run build, typecheck, lint, token, route, and portal gates

# VNE stage 03-5

- [x] Transfer the approved desktop/mobile Gallery of Light composition into the live site
- [x] Refine all internal page types while preserving honest demo and draft states
- [x] Remove duplicate gallery media requests and improve loading priority
- [x] Verify navigation, accessibility, responsive layouts, portal behavior, and visual baselines
- [x] Write docs/sprint/day-03-5-report.md with factual PASS and NOT VERIFIED statuses

## Stage 03.6 — motion layer

- [x] Motion foundation, hero sequence, chapter reveals, magnetic CTA, card tilt/glow, scramble
- [x] Complete menu stagger/progressive blur, image reveals, shimmer, dialog and page transitions

- [x] Add restrained extra text reveals to major section headings and short accents

## Full text animation and supplemental transitions

- [x] Animate all text on home, events, event detail, and admin surfaces
- [x] Add detailed text animation controls and live previews to admin
- [x] Verify mobile menu stagger, backdrop blur, shimmer, page and dialog transitions
- [x] Run motion, accessibility, portal, fallback, geometry, build, and responsive UI checks

# VNE stage 03.7 (build)

- [x] Verify Text Shatter intermediate phase in /admin and on the home Manifest, cleanup after
- [x] Inventory MotionSettings: each param affects preview and site; presets/reset/replay/import/export
- [x] Reduced motion (system/manual) + preset off: portal, scramble, magnetic, menu/page/dialog, shatter
- [x] Canvas alpha vs GalleryBackground; no render wake from scroll far below hero
- [x] Text a11y: SSR/no-JS readable, long tokens 360/zoom200, shatter layout shift, one SR read
- [x] Update docs/sprint/day-03-7-report.md

# Admin live preview and persistent access

- [x] Add the persistent root utility row with motion preference and active `/admin` access
- [x] Build typed contextual previews for every MotionSettings key without duplicating settings state
- [x] Rework `/admin` into desktop sticky and mobile collapsible live-preview layouts
- [x] Verify targeted responsive, keyboard, reduced-motion, dialog, persistence, and import/export flows
- [x] Save desktop/mobile evidence and write docs/sprint/admin-live-preview-report.md

# Targeted site-motion review

- [x] Stabilize TextLoop hydration lifecycle across direct reload and motion toggles
- [x] Move AnimatedBackground interaction handling onto its real DOM wrapper
- [x] Wire FAQ duration to the animated Radix content and chevron
- [x] Return apply-dialog focus to its submit button without clearing fields
- [x] Save targeted evidence and finalize the report with separate code/evidence SHAs
- [x] Make disabled InView transitions immediate, including mid-animation
- [x] Keep TextLoop on its current word while paused, hidden, or unfocused
- [x] Give the admin section selector complete radio-group keyboard semantics
- [x] Verify apply-dialog focus after the completed exit animation
- [x] Restore the AnimatedBackground indicator to the active item when focus leaves its group

# 03.8 — исправления по аудиту

- [x] 03.8-01…12 исправлены и проверены (см. docs/sprint/day-03-report.md)
- [ ] Приёмка 03 владельцем на физическом телефоне — блокер: нужен владелец
- [ ] Этап 04 — блокер: изолированная среда данных и утверждённая матрица ролей

## Регистрация по одобрению и первая учётка владельца — 25.09.2026

- [x] Добавить защищённую модель заявок и закрытый серверный review
- [x] Подключить реальную форму `/apply` и безопасную отправку
- [x] Добавить список/решения заявок в `/admin` и email-приглашение
- [x] Создать приглашение владельца `savik3003@gmail.com` и назначение `owner`
- [x] Проверить unit/typecheck/lint/build, браузер и живую базу; сохранить отчёт

## Дни 04–05 и подготовка 06 — 25.09.2026
- [x] Заявки на событие, модерация, кабинет, отключённая доставка, согласие с версией
- [x] Отчёты day-04 (дополнение), day-05, day-06-readiness
- [ ] Живые сценарии A/B, MFA, конкурентная модерация — ждут изолированную тестовую базу и синтетические события (решение владельца)

## Gallery of Light addon v4 — 25.09.2026
- [x] Подключить выбранные варианты Threshold, Belonging mobile, Invitation mobile, Light Interval D и About Stone B
- [x] Сохранить исходники и 54 AVIF/WebP-производные без апскейла в официальной библиотеке
- [x] Снять 14 публичных страниц в desktop/mobile на полную высоту
- [x] Подготовить полную библиотеку ассетов и набор снимков для передачи владельцу
- [x] Бесконечную прокрутку не добавлять; отложить до отдельного этапа
