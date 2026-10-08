# Этап 02 — сборка официальной библиотеки ассетов VNE Gallery of Light v1

Только промпт 02 (`02_Official_Assets_Assembly_Prompt_RU.md`). Этапы 03–04 не начинаются, публикации нет, Supabase/Auth/платежи/GitHub-история не трогаются.

## Входные данные
- `VNE_Gallery_of_Light_Backgrounds_FIN.zip` — 8 PNG `gallery-{hero|space|belonging|invitation}-{desktop|mobile}-v1.png` + README.
- Сейчас сайт использует 8 WebP через CDN-указатели, hero mobile — `v2`. В новом наборе hero mobile — `v1`: сверю по хэшу/изображению; если отличается от v2, v2 остаётся на сайте, новый кадр помечается `candidate` (без выдуманного утверждения).

## Шаги
1. Зафиксировать фактический HEAD и baseline; прочитать AGENTS.md.
2. Инвентаризация бренда: SVG портала и Flow, шрифты и лицензии, design-config, motion-config — путь, Git blob SHA, SHA-256. Файлы не меняются.
3. Проверка 8 PNG: число, декодирование, размеры, цветовое пространство, ориентация, нет интерфейса/портала в кадре.
4. Исходники PNG + contact sheet → `asset_log/official/gallery-of-light/v1/source/` (вне public; репозиторий публичный — только эти разрешённые фоны).
5. Производные → `public/media/gallery-of-light/v1/`: desktop 1280/1920/2560, mobile 480/768/1080 (без апскейла сверх источника), AVIF + WebP, sRGB, имена `gallery-hero-desktop-v1-1920.webp`. Если AVIF недоступен — только WebP с пометкой.
6. Focal point для каждого кадра (desktop и mobile отдельно).
7. Производные бренда рендером существующих SVG: контрольные PNG портала/Flow (прозрачный/чёрный/светлый), favicon SVG + ICO 16/32/48, apple-touch 180, иконки 192/512, OG 1200×630 (фон + точный Flow + настоящий шрифт). Если знак не читается в 16 px — показать результат и вынести submark на решение владельца.
8. `asset-manifest.json` по шаблону: реальные размеры/байты/SHA-256, статус, role, происхождение; approvedBy/approvedAt только по факту. README «глава → asset id → версии».
9. Подключение: `gallery-media.ts` переходит на `<picture>` с AVIF/WebP `srcset`/`sizes` и focal point; поведение глав, Canvas, fallback, reduced motion без изменений. Favicon/OG — в head корневого и главного маршрутов.
10. Проверки: все прежние гейты (motion, acceptance, static-matrix, geometry, build, build-smoke, typecheck, tokens, lint), скриншоты 1440/1920 и 360/390/430, вес загружаемых фонов.
11. Отчёт `docs/sprint/assets-02-report.md` с SHA и PASS/FAIL/NOT VERIFIED.

## Технические детали
- Инструменты: `cwebp`/`avifenc` или Pillow через nix; `rsvg-convert`/resvg для SVG.
- Старые CDN-указатели остаются до зелёной проверки, затем удаляются из кода (объекты CDN не удаляются — нужны прежним превью).
- motion-config.ts и PortalLinks.tsx не меняются.
