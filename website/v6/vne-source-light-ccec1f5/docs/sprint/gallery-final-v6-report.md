# Gallery of Light final-v6 — итоговый отчёт

Дата проверки: 2026-09-26. Состояние: непубликованный проект.

## Итоговая реализация

- Все 14 исходных PNG сохранены в официальном asset log; утверждённый mapping hero/space/belonging/invitation, двух событий и трёх изображений About не изменён.
- Пять нулевых производных заменены точными файлами из `VNE_v6_Export_Repair.zip`. Байты и SHA256 совпали с `REPAIR_INTEGRITY.json`; `ffprobe` декодировал каждый файл с заявленными размерами. Полные AVIF/WebP width descriptors восстановлены.
- `vne-event-stone-sculpture-v5-c` остаётся резервом и не подключён как третье событие.
- Канонические главы 01–06 и единственный footer сохранены. После footer остаётся opt-in продолжение с нативной прокруткой, normal-flow runway, sticky viewport, двумя `<picture>/<img>` слотами и одним существующим Canvas.
- Желаемая сцена, responsive source key и подтверждённо установленный DOM-источник разделены. Каждый новый скрытый DOM-слот проходит собственный `img.decode()` до показа; AVIF имеет однократный WebP fallback.
- Любая смена source key инвалидирует старую загрузку, включая A→B→A. Таймер перехода отменяемый; ближайший preload ровно один, отменяется при смене состояния и отключается при Save Data.
- Async commits защищены source key, generation, active, paused, frozen и visibility. Finish синхронно помечает continuation inactive до cleanup/persist.
- Ownership каждого mounted decode дополнительно привязан к `pendingGeneration`: устаревший reject не может удалить marker, заменить fallback или изменить opacity более нового запроса с тем же source key.
- При отмене в 180-ms postdecode/precommit окне последний установленный декодированный кадр восстанавливается с сохранённой фактической opacity и без CSS-transition; неподтверждённый incoming при этом удаляется скрытым.
- Смена mobile/desktop и выбранной ширины на той же логической сцене декодирует правильный источник без изменения `sceneUnit`. Reduced/off/frozen controls используют немедленную прокрутку.
- WebGL fallback/static geometry сохраняется только для той же history entry и применяется до первого remount layout. Активный runway один раз восстанавливает сохранённый relative offset после монтирования; fresh visit/reload, обычный resize и завершённое продолжение этим не затрагиваются.
- Практический предел — 8192 сцены с явным повторным стартом; математически бесконечное поведение не заявляется.

## Фактические проверки текущей версии

| Проверка                                      | Результат                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repair bytes + SHA256                         | exit 0; 5/5 совпали                                                                                                                                             |
| Repair decode/размеры через `ffprobe`         | exit 0; 5/5 декодированы                                                                                                                                        |
| `bun test tests/gallery-continuation.test.ts` | exit 0; 4 pass, 14 assertions                                                                                                                                   |
| `bun run typecheck`                           | exit 0                                                                                                                                                          |
| `bun run lint`                                | exit 0; 0 errors, 11 прежних Fast Refresh warnings                                                                                                              |
| Preview build harness                         | последний статус `build OK`                                                                                                                                     |
| Delayed A→B→A                                 | PASS; после release видим hero mobile, 480 px, opacity 1                                                                                                        |
| Finish→Activate                               | PASS; между состояниями runway отсутствует, новый слот декодирован и видим                                                                                      |
| Route→Back                                    | PASS; active runway восстановлен с видимым декодированным source                                                                                                |
| Finish→route→Back                             | PASS; active runway не восстановлен                                                                                                                             |
| Reduced во время pending decode               | PASS; pending отменён, видимый hero/source не изменён, frozen-state показан                                                                                     |
| Same scene 390→900→390                        | PASS; mobile 480 → desktop 1280 → mobile 480, chapter остаётся hero                                                                                             |
| Deep forward/reverse после lifecycle rewrite  | PASS; allocation ≥88, постоянно 2 picture/2 img и 1 canvas                                                                                                      |
| Cancel в 180-ms postdecode/precommit окне     | PASS; hero mobile 480 px остаётся единственным видимым decoded frame; повторный measured opacity 0.844081                                                       |
| Obsolete reject после нового same-key request | PASS; `pendingGeneration` и source marker нового запроса не изменены; final space desktop 1280 px, повторный measured opacity 0.957085                          |
| Fallback belonging→About→Back, 1363×936       | PASS; static hero 936→936 px, runwayStart 4009.8125→4009.8125, local offset 2040.1875→2048.1875 px (Δ8), phase Δ0.00855; belonging 1672 px/opacity 1 до и после |
| Fresh visit с forced WebGL fallback           | PASS; первоначально обычная interactive geometry 2620.796875 px, затем terminal static 936 px; continuation не активирован                                      |
| Finish→About→Back после fallback              | PASS; continuation остаётся inactive, runway и gallery image slots отсутствуют                                                                                  |

Browser evidence хранит для каждого случая фактические `currentSrc`, `chapter`, `naturalWidth`, computed `opacity`, source key, число слоёв/Canvas и allocation. Новые desktop/mobile screenshots сделаны после decode.

## Evidence

- `docs/sprint/evidence/gallery-final-v6/corrected-lifecycle.json`
- `docs/sprint/evidence/gallery-final-v6/async-ownership-final.json`
- `docs/sprint/evidence/gallery-final-v6/history-fallback-restoration.json`
- `docs/sprint/evidence/gallery-final-v6/corrected-desktop-continuation.png`
- `docs/sprint/evidence/gallery-final-v6/corrected-mobile-continuation.png`
- `docs/sprint/evidence/gallery-final-v6/browser-matrix.json` — предыдущая 5-viewport матрица; не используется как доказательство исправленных lifecycle-кейсов.
- `docs/sprint/evidence/gallery-final-v6/avif-fallback.json` — continuation fallback; не обобщается на все обычные `<picture>` сайта.

## Ограничения проверки

- Hidden-tab pending decode не эмулировался надёжно браузерным harness; путь защищён тем же `cancelPending`, ownership marker и `canCommit`, но отмечен как code-only.
- Menu-open cancellation фактически проверен в postdecode/precommit окне на mobile; отдельный pending-decode до завершения decode в этой узкой коррекции не повторялся.
- History regression принудительно воспроизведён Chromium flags `--disable-webgl --disable-gpu`; это подтверждает terminal fallback path, но не моделирует все причины отказа GPU/контекста на реальном устройстве. Разница 8 px после Back составляет 0.00855 scene unit и не меняет главу.
- Снимки подтверждают продолжение, а не повторную полноразмерную матрицу всех публичных страниц: выбранные композиции и канонический текст в этой коррекции не менялись.
- Публикация не выполнялась. Бизнес-логика, auth, БД/RLS, заявки, email/Telegram, платежи и WebGL-геометрия не изменялись.

## Изменённые области

`src/routes/index.tsx`, `src/components/vne/GalleryContinuation.tsx`, media descriptors, пять repaired media payloads, официальный final-v6 manifest, targeted evidence/report и roadmap. История прежних ассетов сохранена.
