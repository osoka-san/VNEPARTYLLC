# VNE — интеграция трёх editorial assets

Дата проверки: 24.09.2026. База: `f375592f72c1dd7095acddcbc7ef17e6bd3659d6`.

## Результат

- `vne-event-resonance-v2` подключён к `light-study-01` и его detail.
- `vne-event-light-interval-v1-haze` подключён к `threshold-study-02` и его detail.
- `vne-about-stone-detail-v2` встроен в существующую editorial grid `/about` перед `#community`.
- Карточки и detail используют 16:10; камень — 4:3. Focal points: 50% 55%, 60% 55%, 65% 50%.
- Используется `picture`: AVIF `source/srcset`, WebP `source` и `img` fallback, явные размеры и `sizes`.
- Detail загружается eager/high; карточки и `/about` — lazy. Исходные PNG не обслуживаются из `public`.
- Все три записи в canonical asset manifest имеют `status: INTEGRATED`; `approvedBy` и `approvedAt` остаются `null`, поскольку поручение на подключение не является формальной визуальной приёмкой.

## Особенность исходного пакета

Первоначальный ZIP содержал нулевой `vne-event-light-interval-v1-haze-800.avif`. Точный производный файл восстановлен из проверенного вложения `VNE_Editorial_800_AVIF_Repair.zip`: 800×501, 38 912 байт, SHA-256 `ad3ab4de9b03553fbfb526bd20521237726da82fe21927f4e4d44b66c71f867c`. Он добавлен в AVIF srcset и canonical manifest без изменения исходных PNG. Итоговый набор содержит 24 рабочих derivatives.

## Матрица

| Проверка | Результат |
|---|---|
| SHA-256 трёх PNG совпадает с поручением | PASS |
| Canonical manifest: 3 новых записи, старые сохранены | PASS |
| `/events`, оба detail, `/about` на 360/390/430/1440/1920 | PASS (20/20) |
| 16:10 событий, 4:3 камня, focal points | PASS |
| Горизонтальный overflow | PASS (0 px во всех 20 случаях) |
| HTML demo, факты, подпись и CTA | PASS |
| Выбор одного AVIF на `picture` в Chromium | PASS |
| Reduced motion отключает hover-transform карточки | PASS |
| Локальный `tilt: false` отключает hover-transform | PASS |
| Ошибка изображения сохраняет размер блока | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Восстановленный 800 px AVIF: SHA-256 / decode / HTTP 200 | PASS |
| `sizes` на 768/1363/1920 для карточек, detail и `/about` | PASS |
| Физические устройства / реальный GPU | NOT VERIFIED |
| Формальная визуальная приёмка владельцем | NOT VERIFIED |

## Скриншоты

- `docs/sprint/screenshots/editorial-three/360x800-events.png`
- `docs/sprint/screenshots/editorial-three/390x844-events.png`
- `docs/sprint/screenshots/editorial-three/430x932-events.png`
- `docs/sprint/screenshots/editorial-three/1440x1000-events.png`
- `docs/sprint/screenshots/editorial-three/1920x1080-events.png`
- `docs/sprint/screenshots/editorial-three/{width}x{height}-about.png` для тех же пяти ширин
- Detail image crops: `390x844-{slug}-picture.png`, `1440x1000-{slug}-picture.png`

Публикация, БД, product states, геометрия/таймлайн портала, восемь фоновых изображений и screenshot baseline не изменялись.