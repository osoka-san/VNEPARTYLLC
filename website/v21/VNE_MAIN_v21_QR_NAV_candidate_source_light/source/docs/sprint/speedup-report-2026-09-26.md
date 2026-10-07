# Ускорение загрузки фонов — 2026-09-26

HEAD: fb758aa8103959fc1be07ee9d79f70dd25335443. Без публикации. Новых библиотек не добавлено — измерения показали, что узкие места решаются без них.

## Что изменено

1. **Долгий кеш медиа** — `public/_headers`: `/media/*` получает `Cache-Control: public, max-age=31536000, immutable`. Имена файлов версионные (v5/v6 в stem), поэтому бессрочный кеш безопасен. Проверено на production-сборке: заголовок применяется (ранее было `max-age=0, must-revalidate`). Серверная обёртка в `src/server.ts` оказалась нерабочей (статика отдаётся платформой до серверного кода, `dist/server/index.mjs:2445`) и удалена.
2. **Мгновенная превью-заглушка первого экрана (LQIP)** — `src/content/gallery-media.ts` (`heroLqip`, data-URI 32×32 из утверждённых ассетов, 152/188 байт) + `src/components/vne/GalleryBackground.tsx` (два слоя desktop/mobile под `<picture>`, blur 12px, aria-hidden). Видна с первого кадра SSR, до прихода полного файла. Проверено скриншотами (`hero-fast-early.png`, `hero-4g-*.png`).
3. **LCP `/events` не тронут** — задержка ~1.1–1.6 с вызвана задуманной анимацией появления картинки (файл готов за ~80 мс). Менять — только с согласия владельца, это визуальное решение.

## Измерения (production-сборка, wrangler dev, headless Chromium)

| Сценарий | Hero ready | Медиа при старте | Тёплый reload |
|---|---|---|---|
| 1440×900, без троттлинга | 731 мс | threshold 205 КБ + space 235 КБ | — |
| 390×844, 4G (9 Мбит/с, RTT 170, CPU×4) | 1969–2273 мс | только threshold mobile 165 КБ | hero 3830 мс, все 4 фона из кэша, **0 байт по сети** |
| 1440×900, 4G, reduced | 1874 мс | только threshold desktop | — |

- Все картинки `complete`, `naturalWidth > 0` после скролла; дублей desktop+mobile нет.
- LQIP: 2 узла в DOM, мобильный видим (409×886, opacity 1), десктопный скрыт на mobile — PASS.

## Проверки

- `bun run typecheck` — 0 ошибок; `bun run lint` — 12 предупреждений (все прежние), 0 ошибок; `bun run build` — exit 0.

## Ограничения

- Замеры на локальной production-сборке (wrangler dev), не на CDN опубликованного сайта — TTFB не показателен.
- Физические iOS/Android — NOT VERIFIED.
- Ранний кадр 4G (900 мс) ещё тёмный из-за CPU×4 — до первой отрисовки CSS/JS; LQIP появляется с первым отрисованным кадром.

Evidence: `docs/sprint/evidence/speedup/` (result.json, скриншоты).
