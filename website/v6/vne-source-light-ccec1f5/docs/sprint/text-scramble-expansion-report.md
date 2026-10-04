# Text Scramble expansion — отчёт

Дата: 25.09.2026  
Указанный владельцем исходный SHA: `f6933f3a3fa1b7b6291e59fb7b187845041ac807`  
Фактически наблюдаемый SHA рабочего дерева перед финальным проходом: `087766f5c475fa3c5bc5b3f698a4d5e17593bbee`  
Итоговый commit SHA: NOT VERIFIED — история и ветка не изменялись, работа находится в управляемом рабочем дереве.

## Реализация

- Схема browser-local настроек повышена до v6. Добавлены master, группы, отдельные targets, duration, tick, delay, intensity, direction, charset и repeat.
- Реестр typed и opt-in: глобального DOM selector и автоматической обработки `AnimatedText role="accent"` нет.
- SSR и первый hydration render — исходный текст. Доступное имя остаётся исходным, декоративная меняющаяся строка скрыта от accessibility tree.
- IntersectionObserver запускает только видимый узел; при его отсутствии работает безопасный однократный fallback. Скрытие вкладки и cleanup останавливают RAF/timer/observer. Reduced motion, master/text/group/target off возвращают финал.
- Админский блок расширен без дублирования: области, места, параметры, «все вкл/выкл» и отдельный reset Scramble. Общий preview, presets и JSON import/export сохранены.
- Проба принимает RU/EN/Ё/Й/цифры, имеет независимую кнопку «Повторить» и явное off-состояние.

## Реестр мест

| Группа             | Маршрут                      | Места                                                                      |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------- |
| Главная            | `/`                          | Порог, Манифест, Пространство, Ближайшая ночь, Принадлежность, Приглашение |
| О ВНЕ              | `/about`                     | page/space/community eyebrow; подписи pine/stone/water                     |
| События            | `/events`, `/events/:slug`   | page eyebrow, kicker карточек, page/program/conditions eyebrow             |
| Другие публичные   | `/faq`, `/contact`, `/rules` | только page eyebrow                                                        |
| Короткие заголовки | `/`, `/about`                | три h2, отдельная группа, по умолчанию выключена                           |

Всего: 23 стабильных target id (пересчитано из registry; about.space.heading исключён).

## Явно исключено

Hero H1, Flow, Text Roll «Меньше шума.», Text Loop, абзацы, даты, цены, «Демо / не анонс», CTA/submit/навигация, формы/ошибки/статусы, Auth/member/scan, legal routes. Также явно исключены «Художественный образ — не адрес», «Последовательность готовится» и «Участие не подтверждено». Панель управления остаётся статичной; эффект работает только в пробе.

## Проверки

- `bun test tests/motion-settings.test.ts tests/text-scramble.test.ts` — PASS, 9/9.
- `bun run typecheck` — PASS.
- Focused ESLint edited files — PASS с одним ранее существующим warning `react-refresh/only-export-components` в AdminMotionPreview, 0 errors.
- Harness build — PASS (`/tmp/observability/build-errors.log`).
- Browser Chromium: `/about`, `/events`, `/faq` — наблюдались промежуточные `playing` и финальные `final` кадры; console errors 0.
- 360/390/430/1440: `scrollWidth === clientWidth`, горизонтального overflow нет; hero H1 и CTA не получили Text Scramble.
- Browser-local master сохраняется после reload. System/manual/text/group/target off показывают `final`.
- Browser Chromium без `IntersectionObserver` сохраняет читаемый финальный текст; скрытие вкладки переводит активный эффект в `final` и очищает работу в фоне.
- «Художественный образ — не адрес», «Последовательность готовится» и «Участие не подтверждено» проверены как незарегистрированные статичные тексты.
- Unit: clamp/bad enum/null/array, v1–v5 migration, partial nested map merge, unknown target ids, target exclusions, RU/EN/Ё/Й, punctuation/digits, direction/intensity/final reveal — PASS.

Доказательства: `docs/sprint/evidence/text-scramble-expansion/browser-results.json`, `runtime-modes.json`, `runtime-active-stop.json`, `fallback-visibility.json`, `home-{360,390,430,1440}.png`, `about-mobile-playing.png`.

## NOT VERIFIED

- Админская интерактивная проба в браузере: `/admin` перенаправляет на `/login`, тестовой staff-сессии в этом проходе не было. Компоненты прошли typecheck/lint/build.
- Воспроизводимый screenshot именно промежуточного glyph-кадра и автоматическая проверка replay-кнопки ×3 внутри admin не сняты из-за guard.
- Физические устройства, настоящий browser zoom 200%, screen reader и художественная приёмка.
- Фактически связанная GitHub-ветка не видна и не менялась.

БД, Auth, Telegram и публикация не изменялись.

## Исправления качества (от HEAD 17ff8df)
1. `matchPreset` сравнивает вложенные boolean-карты по ключам и значениям; пресет распознаётся после sanitize/reload/JSON; смена одного target → не совпадает. PASS (`tests/scramble-quality.test.ts`).
2. Стабильная геометрия: исходная графема остаётся прозрачным якорем в потоке, случайный знак — абсолютный aria-hidden overlay; пробелы — обычный текст, естественные переносы сохранены, без whitespace-pre/inline-block. Браузер (/about, /events на 360/390/1440): ~30 кадров с реально заменёнными глифами на каждом, bounding rect и число строк во всех intermediate-кадрах совпадают с финалом — PASS. Единственное расхождение — кадры 0–2 до начала перебора (0 заменённых глифов) при подгрузке шрифта на /about, не связано со Scramble.
3. `event.page.eyebrow` перенесён на реальную страницу события, убран с 404; source-guard тест PASS.
- Реестр: 23 id (тест фиксирует число). /rules — только eyebrow; содержимое правил/ошибки/CTA статичны.
- typecheck PASS, bun unit PASS (10 новых + 9 прежних), focused eslint PASS.
- NOT VERIFIED: многострочные длинные RU/EN/Ё/Й в браузере (покрыто unit-контрактом кадра), админская проба (нет staff-сессии), физические устройства.

## Дополнение: конкуренция появления на /events
- Причина: EventCard в `InView` (порог 18%, fade ≤750ms), а kicker Scramble стартовал при первом пересечении и заканчивался под opacity 0.
- Решение (единое правило в TextScramble, без изменения InView/маршрутов): перед перебором проверяется произведение computed opacity узла и предков; перебор ждёт ≥0.95 (опрос 80ms, только пока элемент в viewport). Если элемент ушёл из вида до появления родителя — попытка сбрасывается и повторяется при следующем входе. Cleanup таймеров прежний.
- Browser (/events, скролл): 390×700 — 32 кадра с реально заменёнными глифами на карточке 1, минимальная opacity предков во время замен 0.98 (до исправления — 0); 1440×900 — 62 кадра на карточках 0 и 1, opacity 1. PASS.
- Повторная геометрия /about, /events 360/390/1440 после изменения: размер/строки в intermediate = final. PASS.
