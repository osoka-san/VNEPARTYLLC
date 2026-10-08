# Site Motion System — отчёт

## Контекст

- Base, указанный владельцем: `35bccbbfc18a2abc103794d5e67a8c0aeec5766d`.
- Фактический base перед реализацией: `70a249fc63ed03c194dec0288b2a6080aab0e4cf`.
- Ветка проверки: `edit/edt-ad5d2d49-df56-4dc4-a7bf-f5febebbab19`.
- Проверенный исходный code SHA перед последней рабочей правкой: `cd848b4f99ed814e5d20049b0d530903ed82d6ed`.
- Evidence SHA-256: `f4b4ab41b4669121d7249b6d736a8a90132e4e1a70ffdcf69387c33f8cc29eba` — SHA-256 файла `site-motion-review-evidence/SHA256SUMS.txt` (нет в репозитории — NOT VERIFIED), перечисляющего одиннадцать доказательств; сам отчёт в digest не входит.
- Motion Primitives: адаптация официальных Text Loop, Animated Background и In View к локальным `motion/react`, Radix и MotionProvider; Next.js/Nim не добавлялись.

## Изменения

- Добавлены SSR-безопасные `InView`, accessible `TextLoop`, `AnimatedBackground`, `SegmentedControl`.
- Text Loop подключён только к двум вторичным строкам; пауза при hover/focus, вне viewport и в скрытой вкладке.
- Card/navigation/admin indicators используют общую moving background без сдвига layout.
- FAQ остаётся Radix Accordion; `/apply` показывает честный Radix Dialog после локальной проверки.
- Motion settings обновлены до schema v4 с миграцией v1–v3, clamp и безопасным импортом.
- Portal lifecycle, Flow, фоновые/editorial assets, служебные routes и backend не изменены.
- Устранены вложенные entrance-эффекты в общих заголовках и манифесте; юридические тексты статичны.
- FAQ-шеврон, мобильный stagger и image scale теперь мгновенно переходят в финал при reduced/off.

## Проверки

| Проверка                                                        | Статус       | Доказательство                                     |
| --------------------------------------------------------------- | ------------ | -------------------------------------------------- |
| Typecheck                                                       | PASS, exit 0 | `site-motion-review-evidence/typecheck.txt` (нет в репозитории — NOT VERIFIED)        |
| Lint                                                            | PASS, exit 0 | 0 errors, 8 existing Fast Refresh warnings         |
| Production build                                                | PASS, exit 0 | `site-motion-review-evidence/build.txt` (нет в репозитории — NOT VERIFIED)            |
| Portal motion                                                   | PASS, 6/6    | `bun run test:motion`                              |
| Settings v1–v4 migration/clamp                                  | PASS         | `tests/motion-settings.test.ts`                    |
| Text Loop direct reload `/`, `/about` + reduced toggle          | PASS         | `site-motion-review-evidence/browser-results.json` (нет в репозитории — NOT VERIFIED) |
| Card background hover/focus/touch + pointer-events              | PASS         | JSON + `event-card-active.png`                     |
| FAQ enabled/off/reduced computed duration                       | PASS         | `0.26s` / `0s` / `0s` in JSON                      |
| Apply dialog Escape/button focus return + retained field values | PASS         | JSON + `apply-focus-return.png`                    |
| Animated background focus-within / Tab-out                      | PASS         | `animated-background-focus.json`                   |
| Physical iPhone/Android, device screenreader, real GPU/FPS/INP  | NOT VERIFIED | требуется физическое устройство                    |
| Production/publish                                              | NOT RUN      | по ограничению владельца                           |

Visual baseline не обновлялся. Намеренные различия: Text Loop, moving card/navigation backgrounds, admin segmented control и локальный form dialog.

Эта целевая проверка не повторяет полную матрицу маршрутов и визуальных baseline. Chromium — эмуляция viewport/input, не физический телефон; device screenreader, реальный GPU, FPS/INP и production deployment не проверялись.

## Targeted review fixes

- `TextLoop` сохраняет один root при initial reduced и после hydration, observer остаётся привязан; interval очищается при off/паузе/скрытой вкладке и больше не сбрасывает слово на hover/focus.
- `AnimatedBackground` слушает pointer/focus/click на реальном wrapper; подложка карточки не принимает pointer events, существующий `TiltGlow` не дублирован.
- FAQ duration подключена к внешнему Radix Content и chevron: enabled `260ms`, `faqMotion=false`, manual off и system reduced — `0ms`.
- Контролируемый `/apply` Dialog возвращает фокус после exit на «Проверить заполнение» при Escape и «Понятно»; значения полей сохраняются.
- Default/«Фирменное» `pageDuration` = `0.24s`; сохранённые browser-local значения и старые валидные импорты не перезаписываются.
- `InView` теперь явно останавливает текущий tween и сразу устанавливает читаемый финал при reduced/off, в том числе в промежуточном кадре.
- `TextLoop` сбрасывается только при replay или изменении набора слов; hover, focus, ручная пауза и скрытая вкладка замораживают текущий индекс.
- Переключатель разделов `/admin` оформлен как связная radio group с roving `tabIndex`; стрелки, Home и End меняют выбор и сохраняют фокус без двойного `onChange`.
- Дополнительная браузерная приёмка сохранена в `site-motion-review-evidence/addendum-results.json` (нет в репозитории — NOT VERIFIED): возврат фокуса после завершения exit подтверждён для Escape и «Понятно», значения `Тест` / `test@example.invalid` сохранены.
- `AnimatedBackground` очищает временный focus-индикатор только при выходе фокуса за пределы всей группы; переходы между её пунктами не мерцают, а после Tab наружу подложка возвращается к активному пункту.

## Финальный reduced/off аудит

- FAQ icon/content: `0.01ms` system reduced-motion, без остаточного перехода.
- Mobile navigation stagger: `0.01ms` system reduced-motion, focus return сохранён.
- Legal content и PageShell не получают вложенный entrance-transform; текст остаётся видимым.
- Главная и event detail очищены от одновременного движения родителя и `AnimatedText`.

## Расширение текстовой системы — 25.09.2026

- Добавлены управляемые группы `/admin`: `Text Effect`, `Text Loop`, `Text Roll`, `Text Scramble`, `Text Sections`; preview mapping покрывает каждый ключ `MotionSettings` schema v5.
- Cyan `TextSection` подключён к манифесту главной и редакционному тексту `/about`: один читаемый и копируемый DOM-текст, прогресс 0→1 от положения во viewport, без scroll hijack и второго Canvas.
- `TextScramble` получил настраиваемые duration/tick с прежней областью 03–06; `TextRoll` с rotateX остаётся только на «Меньше шума.»; даты и факты карточек событий статичны.
- `InView` теперь использует выбранные reveal style, blur и scale; при reduced/off сразу показывает финальное состояние.

| Целевая проверка | Статус |
| --- | --- |
| Desktop `/admin`: пять групп, sticky preview, все previews | PASS |
| Mobile `/admin`: управление и горизонтальный выбор preview | PASS, Chromium viewport |
| Реальный промежуточный Text Scramble | PASS |
| Cyan Text Sections: измеренный scroll progress | PASS, `0.000 → 1.000` |
| Изменение `sectionIntensity` и browser-local сохранение | PASS, `0.6` |
| Manual off / system reduced | PASS, статичный читаемый финал |
| No-JS читаемость | PASS |
| Runtime page errors | PASS, `[]` |
| Настройки schema v5 migration/clamp | PASS, 3/3 tests, 29 assertions |
| Physical phones, device screenreader, real GPU/FPS/INP | NOT VERIFIED |
| Publish / production | NOT RUN |

- Проверенный HEAD перед финальной документацией: `237154e43fad7a5ad877da611f96cccb24b63d81`.
- Source bundle SHA-256: `13fc55e8d9f201ec926e17aa2dc2419096a826463ac5418d54dd202e9547947f`.
- Screenshot evidence SHA-256: `100a9bd6b2e4f34dc50b510e27d1493dea4fc29af4fef11ea157ae055129110b`.
- Evidence: `admin-desktop.png`, `admin-mobile.png`, `admin-scramble-mid.png`, `admin-sections.png`, `home-text-roll.png`, `home-text-sections-mid.png`.
