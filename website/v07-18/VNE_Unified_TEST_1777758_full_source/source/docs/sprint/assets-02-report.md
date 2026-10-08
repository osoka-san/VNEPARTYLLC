# Промпт 02 — официальная библиотека ассетов VNE Gallery of Light v1

Дата: 24 сентября 2026. Baseline HEAD до работы: `74345e45025f95c26a853ee9d10b32b873a12a38`. Этапы 03–04 не начинались, публикации не было.

## Сделано
- Инвентаризация бренда (SVG портала/Flow, шрифты, лицензии, design/motion-config, portal-geometry): путь, Git blob, SHA-256 — в `asset_log/official/gallery-of-light/v1/asset-manifest.json` (`brandInventory`). Файлы бренда не изменены.
- 8 PNG набора FIN проверены: декодируются, sRGB/RGB, 1672×941 и 941×1672, без интерфейса и портала. Исходники в `asset_log/official/gallery-of-light/v1/source/`.
- hero mobile: на сайте остаётся исправленная v2 (исходник есть только в WebP). `gallery-hero-mobile-v1.png` из FIN отличается композицией — статус `candidate`, решение за владельцем.
- Производные AVIF + WebP в `public/media/gallery-of-light/v1/`: desktop 1280/1672, mobile 480/768/941. 1920/2560/1080 не созданы — это был бы апскейл.
- Бренд-производные рендером существующих SVG: контрольные PNG (`asset_log/official/brand-renders/`), `favicon.ico` 16/32/48, `icon.svg`, `apple-touch-icon.png`, `icon-192/512.png`, `og-cover.jpg` 1200×630 (фон hero + точный Flow, без сгенерированного текста).
- Сайт: `<picture>` с AVIF/WebP srcset и точками фокуса; старые CDN-указатели удалены из кода (объекты CDN сохранены).
- Сборка воспроизводима: `python3 scripts/build-gallery-assets.py`.

## Проверки
| Проверка | Статус |
|---|---|
| test:motion, typecheck, tokens:check, lint, build, build-smoke | PASS |
| test:acceptance (72 сценария), test:static-matrix, test:geometry | PASS |
| Скриншоты 1440/1920/360/390/430 (`screenshots/assets-02/`) | PASS |
| Загружаемые фоны (`loaded-media.json`): AVIF 25–92 КБ desktop, 6–40 КБ mobile | PASS |
| Favicon 16 px: три звена различимы, мелкие детали сливаются | PASS с оговоркой |
| og:image в head | NOT VERIFIED — нет опубликованного абсолютного адреса |
| Точки фокуса | оценочные |
| approvedBy/approvedAt | не заполнены — фактов утверждения нет |
| Физические устройства, реальный GPU, production | NOT VERIFIED |

## Оговорки
- CSS-подстраховка дополнительно загружает WebP 1280 для каждой главы (~30–80 КБ); оптимизация — отдельным решением.
- Репозиторий публичный: исходные PNG попадают в него.
