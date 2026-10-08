# ВНЕ / Gallery of Light — отчёт этапа 02

Дата проверки: 24 сентября 2026, 09:21–10:11 UTC  
Проект: `7e261ce4-c261-40b6-b169-b9806a6e37d7`  
Проверяемая версия до этапа: `d6ec42a55a498b944e94efc3e978962e136b3429`  
SHA проверенного приложения перед финальной правкой этого отчёта: `f91d0981e07989c00e87bf4e662d359b2f6843e5`  
Среда: Playwright Chromium, SwiftShader WebGL; физический GPU и реальные устройства не использовались.

## 1. Реализовано

- Главная содержит главы в порядке `#threshold`, `#manifesto`, `#space`, `#next-night`, `#belonging`, `#invitation` и footer.
- Сохранены исходные Flow SVG, 3D-сцена и три звена 10C11-6 отдельными слоями; ниже hero дополнительных Canvas нет.
- Четыре desktop/mobile пары подключены через единый typed media config и `<picture>` с мобильным `<source>`.
- Hero mobile использует `gallery-hero-mobile-v2.webp`.
- Исправленный `gallery-invitation-desktop-v1.png` (1 956 937 байт, 1672×941) преобразован в рабочий WebP (65 684 байта, 1672×941) без изменения композиции. Остальные семь WebP не преобразовывались.
- Все изображения декоративные: `alt=""`, `aria-hidden="true"`, `pointer-events: none`; предусмотрен CSS background fallback.
- Для мобильных `belonging`, `space` и `invitation` применены локальные тёмные градиенты только под текстом. Общей золотой/янтарной обработки invitation нет.
- Текст не содержит вымышленных дат, адресов, цен, людей или гарантии доступа. Событие обозначено «Дата будет объявлена», форма приглашения — демонстрационная.

## 2. Матрица проверок

| Проверка | Результат | Фактическое подтверждение |
| --- | --- | --- |
| 1440×900 WebGL | PASS | один Canvas 1440×900, `data-mode=interactive`, диалог работает, ошибок страницы нет |
| 1920×1080 WebGL | PASS | один Canvas 1920×1080, `data-mode=interactive`, диалог работает, ошибок страницы нет |
| 360×740 WebGL | PASS | один Canvas 360×740, desktop/mobile sources переключены на mobile, диалог работает |
| 390×844 WebGL | PASS | один Canvas 390×844, собранная эмблема видима, диалог работает |
| 430×932 WebGL | PASS | один Canvas 430×932, mobile sources, диалог работает |
| Reduced motion 1440×900 / 390×844 | PASS | Canvas отсутствует, `data-mode=static`, статичная эмблема видима |
| Принудительно недоступный WebGL 390×844 | PASS | после terminal timeout Canvas удалён, `data-mode=static` |
| Восемь responsive images | PASS | `complete=true`, natural size desktop 1672×941 и mobile 941×1672; mobile `currentSrc` указывает на mobile WebP |
| Структура и доступность | PASS | все 6 id присутствуют; доступный HTML расположен поверх декоративных изображений |
| Диалог приглашения | PASS | открыт на всех пяти ширинах; содержит честную пометку о демонстрационном режиме |

Полные метаданные: `docs/sprint/screenshots/day-02/verification.json` и `portal-dialog-verification.json`.

## 3. Композиционная оценка

| Область | Статус | Наблюдение |
| --- | --- | --- |
| Hero mobile | PASS | Flow и CTA находятся в верхней тёмной области; собранный портал расположен ниже и не пересекается с CTA или лампами |
| Belonging mobile | PASS | длинный заголовок читается поверх ветвей благодаря локальному градиенту; фон вне текстового блока не затемнён |
| Space desktop/mobile | PASS | подпись находится у тёмного нижнего/левого края, вдали от яркой линии; локальная подложка применяется только на mobile |
| Invitation desktop/mobile | PASS | графитовый характер и исходный цвет света сохранены; общая цветовая обработка не добавлялась |

Это визуальная проверка сохранённых Chromium-кадров с реальным HTML, а не вывод только по исходным иллюстрациям.

## 4. Регрессии портала и сборка

| Команда/проверка | Результат |
| --- | --- |
| `bun run test:motion` | PASS: 6 тестов, 977 assertions |
| `bun run test:acceptance` | PASS: 72 сценария; обновлены устаревший селектор `#night`, явный выбор hero CTA и ожидание полной готовности шрифтов |
| `bun run test:static-matrix` | PASS: 16 размеров × 2 режима |
| `bun run test:geometry` | PASS: G1 без изменения геометрии звеньев |
| `bun run build` | PASS |
| `bun run test:build-smoke` | PASS: живая сцена, reduced motion без чанка сцены, WebGL off со static SVG |
| `bun run typecheck` | PASS |
| `bun run tokens:check` | PASS |
| `bun run lint` | PASS: 0 ошибок, 6 прежних Fast Refresh warnings |

Первый ошибочный прогон сохранён как факт: команды с несуществующими именами scripts и запуск bun-теста через Vitest были ошибкой оператора; затем использованы реальные scripts из `package.json`. Обновлённый acceptance выявил устаревшую ссылку на удалённый `#night`, неоднозначный выбор одного из трёх CTA, а также гонку статуса шрифтов. Проверки исправлены; отдельно устранены скачок страницы при resize открытого hero-диалога и потеря места чтения при переходе WebGL → static. Финальный прогон: 72 сценария PASS.

## 5. Артефакты

- До интеграции: `docs/sprint/screenshots/day-02/before/` — 2 кадра threshold.
- После интеграции: `docs/sprint/screenshots/day-02/after/` — 42 кадра required viewports/modes/sections/dialogs.
- Логи: `regression-tests.log`, `final-gates.log`, `final-rerun.log`, `final-acceptance.log` в каталоге day-02.

## 6. NOT VERIFIED

- Физические iPhone/Safari, Android/Chrome, реальный GPU и экран 120 Гц — NOT VERIFIED.
- Сетевое поведение опубликованной production-версии — NOT VERIFIED, публикация не выполнялась.
- Pixel-read отдельного краткого viewport harness вернул прозрачный центральный пиксель; реальный WebGL подтверждён основным acceptance harness по множеству непустых пикселей и renderer SwiftShader.

## 7. Итог

**PASS этапа 02 для локальной программной и Chromium-приёмки с указанными NOT VERIFIED.** База, Auth, платежи, production, GitHub и другие проекты не изменялись; публикация не выполнялась.