# Этап 03.7 — кнопки админки, текст, Text Shatter

База: 9e2570e. Реализация по утверждённому плану.

## Исправлено
- A1/A2 «Повторить»: проп `replay` в Reveal и AnimatedText — проба проигрывается по клику независимо от положения и `textHeroSequence`. PASS (промежуточная opacity 0.88 через 60 мс).
- A3 «Скопировать JSON»: await, статус в aria-live, при отказе буфера JSON выделяется в поле для ручного копирования. PASS (эмуляция отсутствия Clipboard API).
- A4/A9 импорт: диалог с подписанной textarea вместо window.prompt; проверка структуры до санитизации, `schemaVersion`, миграция старого объекта поверх текущих значений. PASS: `{bad`, `null`, `[]`, `{"foo":1}`, версия 9 — отказ без изменений; `{"duration":1.1}` — применено.
- A5: аnimated text — sr-only копия + aria-hidden визуал. PASS: heading «Меньше шума. Больше присутствия.» читается один раз.
- A6: режим «буква» группирует буквы в слово (`inline-flex flex-wrap max-w-full`) — длинный токен переносится внутри, без переполнения. 360 px: overflow нет.
- A7: «Строка» переименована в «Строка из текста».
- A8: Switch/Slider получили доступные имена, описания и `aria-valuetext`. PASS (18 switch, 25 slider с именами).

## Text Shatter
`src/components/motion/TextShatter.tsx`, применён к «Меньше шума.» в главе «Манифест». Intl.Segmenter по графемам, клинья clip-path с запасом −40%/140% по высоте и перекрытием 1.5%, детерминированные сиды, один Motion-переход, после сборки — обычный текст. SSR/первый render — обычный текст; эффект взводится только после fonts.ready и если фраза вне экрана; resize/выключение/reduced motion — сразу обычный текст. Лимит 24 графемы. Настройки в /admin: включение, разлёт, длительность, осколков на букву (≤3 на телефоне), «Проиграть пробу».

## Проверки
typecheck PASS, eslint 0 ошибок, test:motion 6/6 PASS, visual-regression 95/95 PASS без обновления эталонов, console без ошибок.

## NOT VERIFIED
Плавность и замер производительности shatter, физические iPhone/Android, 200% zoom вручную, скринридер на устройстве, открытие window.prompt в preview (заменён, вопрос снят), риски прошлого аудита из раздела B плана — не перепроверялись в этом ходе.

## Finish pass — risk verification (2026-09-24, headless Chromium)

| Risk / check | Result |
|---|---|
| Canvas opaque over GalleryBackground | FIXED: alpha canvas + clearAlpha 0; hero photo visible under emblem (ready) — PASS |
| Portal render woken by scroll far below hero | FIXED: 0 wake events across 3600 px below hero; scroll back to top wakes and reverses — PASS |
| Manual reduced motion → portal | FIXED: `data-reduce-motion=true` → mode static, 0 canvas; back → interactive — PASS |
| Preset «Без движения» | PASS: portal static, no canvas, shatter plain |
| Hero CTA hidden during delay | PASS: opacity 1 at 80 ms |
| Magnetic offset on disable mid-hover | FIXED (source motion values reset): transform → `scale(1.015)` only — PASS |
| Scramble on disable | PASS: original text |
| 6 text styles × 4 splits in admin probe, textHeroSequence=false | PASS: each shows its own intermediate property (opacity / translate / blur / inset / scale; none = static) |
| Slider keyboard: focus kept, value persists after reload | PASS |
| Back/Forward, reload, no-JS H1 readable (/, /events, both slugs, /admin) | PASS |
| Overflow with character split, 360/390/430/1920, zoom 1 & 2, all public + document routes | PASS (0 px) |
| typecheck / eslint (0 errors) / motion 6/6 / acceptance 72 / static matrix / G1 / visual 95/95 (baseline not updated) | PASS |

NOT VERIFIED: physical phones and GPUs, smoothness/FPS/INP (no measurements), real screen readers, owner visual acceptance.

## Owner addendum (independent read of 6594201) — 2026-09-24

1. Replay: hidden pose applied instantly (duration 0), visible started after 2 RAF; off → no hide/delay. Evidence: admin probe opacity sampled every 16 ms reaches 0 then 1 (107 samples). PASS
2. matchPreset compares known fields by value, independent of key order; presets expose aria-pressed. All 6 presets pressed after click + reload. PASS
3. Manifest heading no longer wrapped in Reveal; Text Shatter is the sole owner (parent opacity chain unset; armed → playing 44 shards → plain). PASS
4. Off/disabled: explicit zero delayChildren/stagger/duration in AnimatedText, zero duration/delay in Reveal; hidden pose instant. PASS (typecheck + probe)
5. Text Shatter honours textEnabled (textEnabled=false → plain). Hero CTAs contain no AnimatedText by design (always visible); textButtons governs header/nav text. PASS
6. «Строка из текста»: explicit \n rendered as <br> (SSR render test). PASS
7. Import dialog returns focus to «Вставить JSON» after Cancel, Escape and Apply; null → validation error. PASS

Checks: typecheck, eslint 0 errors, motion 6/6, visual 95/95 (baseline not updated).

## Проверка «кнопки в /admin не прожимаются» — 2026-09-24

Метод: Playwright, Chromium, без force clicks. Ширины 390 (touch) и 1440 (мышь).
Нажата каждая из 56 кнопок/переключателей панели «Движение» настоящим tap/click.

Результат воспроизведения:
- 56/56 контролов принимают нажатие, 0 отказов, 0 ошибок страницы (обе ширины).
- Перекрытий нет: elementFromPoint по центру и углам каждого контрола попадает в сам контрол на 360/390/430/1440/1920.
- После закрытия диалога импорта: dialogs 0, overlays 0, body pointer-events auto, inert 0 — залипшей блокировки нет.
- Вкладки «Обзор/Разделы/Операции/Движение» переключаются tap и click; Switch реагирует на Space.
- Полной блокировки нажатий в чистом профиле воспроизвести не удалось — это отделено от исправленных ниже дефектов UI.

Исправленные дефекты отклика (причина ощущения «не прожимается»):
- «Применить» в диалоге импорта была disabled при пустом поле — кнопка выглядела нерабочей. Теперь нажимается всегда и сообщает: «Поле пустое. Вставьте JSON, скопированный в этой панели.»
- «Сбросить» не давала подтверждения — добавлен статус «Настройки сброшены к исходным.» в role=status.
- Кнопки выбора стиля/разбиения/кривой не сообщали состояние — добавлен aria-pressed (проверено: true после нажатия, false после сброса).
- Нет тактильной обратной связи при нажатии — в базовом стиле Button добавлены active:scale-[0.98] active:opacity-90 и touch-manipulation.
- Возврат фокуса на «Вставить JSON» после «Отмена» подтверждён (после завершения анимации закрытия).

Проверки: tsgo 0 ошибок, eslint 0 ошибок (7 прежних предупреждений Fast Refresh), test:motion 6/6, test:visual 95/95 без обновления эталонов, build OK.

NOT VERIFIED: физические устройства (iOS Safari, Android Chrome), реальный GPU, ручной 200% zoom, скринридер на устройстве.
Замечание: страница /admin не связана ни одной ссылкой в меню или подвале — попасть на неё можно только по прямому адресу. Изменение навигации не делалось, требуется решение владельца.

## Уточнение владельца: пробная кнопка «Получить приглашение» — 2026-09-24

Причина: в aside «Проба» оранжевый элемент был декоративным <span> внутри Magnetic — выглядел кнопкой, но не имел role=button, onClick, tabIndex и не нажимался (м mouse, клавиатурой и касанием — никакой реакции).

Исправление (тот же UI-объём, без нового дизайна):
- Заменён на настоящий <Button type="button"> с доступным именем «Проба кнопки», видимым текстом «Получить приглашение» и прежним видом (оранжевый, min-h-11, rounded-sm).
- Реакция на нажатие: активное вдавливание active:scale-[0.98] (базовый стиль Button), клавиатура Enter/Space, касание на телефоне; внутри Magnetic и Reveal как прежде (off/reduced сохранены — при «Без движения» и системном reduce кнопка статична, но нажимается).
- Локальный статус «Нажатие зарегистрировано» (role=status, aria-live=polite) под кнопкой; без перехода со страницы настроек и без отправки заявки — это проба анимации и клика.
- Блок статуса рендерится только после нажатия — пустое состояние не меняет разметку (эталоны не сдвинуты).

Проверки (Playwright, без force clicks):
- elementFromPoint по центру кнопки попадает в саму кнопку на 1440 и 390; высота 44 px.
- Мышь (1440), касание (390, has_touch), Enter и Space — статус появляется во всех четырёх случаях.
- Пресет «Без движения»: кнопка остаётся рабочей, статус появляется, анимации отключены.
- Ранние «промахи» в прогонках были гонкой запуска до завершения гидратации страницы (клики до 500–800 мс после загрузки) — не дефект кнопки; после networkidle + 1.5 с все нажатия проходят стабильно.
- tsgo 0 ошибок, eslint 0 ошибок, test:motion 6/6, test:visual 95/95 без обновления эталонов.

## Регрессия: безусловный active:scale в Button — FIXED
Из базового `Button` убраны `active:scale-[0.98]` и `transform` из transition; остались мгновенные opacity/цвет/focus. Масштаб нажатия управляется только motion-примитивом (`settings.press`, reduced, «Без движения»). Проверка: getComputedStyle при :active — transform `none` в off/reduced/press=false; scale через примитив только при press=true. Полная матрица не перезапускалась (изменение одной CSS-строки).

## Дополнение — точечный Text Scramble (метки глав)

**Исходный SHA:** ecb29498e8cc8bc18ddf16bdeed0ea4a16bfa076 (HEAD на момент правки; проверенный владельцем 7f3cdde уже содержался в истории).
**Итоговый SHA:** формируется коммитом платформы после этого хода.

**Изменённые файлы**
- `src/components/motion/Interactive.tsx` — TextScramble переписан.
- `src/routes/index.tsx` — перебор на метках глав 03/04/05/06.
- `src/components/app/EventCard.tsx` — StatusBadge полностью статичен.

**Что сделано**
- Перебор только по буквам: цифры, пробелы и `/` не искажаются; графемы через `Intl.Segmenter` с запасным `Array.from`; пул с Ё/Й, регистр сохраняется.
- Время реальное: `performance.now()`, 520 мс, смена подставного знака не чаще 55 мс — одинаково на 60 и 120 Hz.
- SSR и первый клиентский render отдают исходный текст; эффект стартует однократно по IntersectionObserver, повтор при чтении исключён (`done`).
- Во время перебора ширина зафиксирована невидимой копией исходной строки — без рывка переносов.
- Доступное имя не меняется: подменный текст `aria-hidden`, исходный текст в `sr-only`.
- Учитываются `reduced`, глобальный `textEnabled`, тумблер `scramble` из /admin и пресет «Без движения»; RAF и observer снимаются в cleanup.
- StatusBadge («Демо / не анонс» и прочие) — без scramble, shimmer и AnimatedText, читается с первого кадра и присутствует в SSR-разметке.

**Наблюдения о реальном движении** (Chromium, эмуляция)
- Метка 03: 6 мутаций, размах 521,8 мс; промежуточные кадры вида `03 / ПЯНДСЙЁБХФЩИ` → `03 / ПРОСТРАНСТВО`; цифры и `/` неподвижны.
- Выключение `scramble` посреди перебора возвращает исходный текст в пределах ~90 мс.
- `textEnabled=false` и системный reduced-motion: исходный текст сразу, ни одной мутации.

**Результат**
- PASS: typecheck (0), eslint (0 ошибок, 7 прежних предупреждений), build OK, test:motion 6/6, tests/day03/site-pages.py 22/22, test:visual 95/95 без обновления эталонов (геометрия, портал и шесть глав не изменились).
- PASS: ширины 360 / 390 / 430 / 1440 — финальный текст корректен, 0 ошибок страницы.
- NOT VERIFIED: физические устройства, реальный GPU, ручной зум 200%, экранный диктор на устройстве.

**Уточнение владельца: доступное имя пробной кнопки — 2026-09-24**
- PASS: `aria-label` кнопки «Получить приглашение» заменён на «Получить приглашение — проба кнопки» (видимый текст в начале имени, label-in-name соблюдён); видимая надпись, стили и размеры не менялись.
- PASS: клик, Enter и Space по кнопке по-прежнему ставят статус «Нажатие зарегистрировано» (role=status), pageerrors 0; typecheck 0.

## Замена Text Shatter на Text Roll + Text Scramble меток — 2026-09-24
- Text Shatter удалён (компонент, стили, проба и ручки в /admin). «Меньше шума.» — TextRoll: одна вертикальная прокрутка букв 0.5–0.75 с (по умолчанию 0.62), без цикла; знаки статичны; SSR/no-JS и финал — обычный текст; sr-only оригинал один раз.
- /admin: «Акцент Text Roll» — вкл/выкл, длительность, проба. Схема 3; старый JSON: shatterEnabled → rollEnabled, прочие shatter-поля игнорируются; null/массивы отклоняются.
- Scramble меток 03–06 (520 мс по времени, номер и «/» статичны) уже был; «Демо / не анонс» статична.
- PASS: 360/390/430/1440, reduced (roll не армируется), выключение roll/scramble посреди — мгновенно финальный текст, tsgo, eslint, build, test:motion 6/6. Эталоны 95 снимков не перезапускались.
- NOT VERIFIED: физические устройства, реальный GPU, скринридер.
- Коррекция Text Roll (55f6f12 → итог в чате): вместо подъёма — вращение каждой буквы rotateX −90°→0° в перспективе, ступенчатый старт, без отскока, 0.5–0.75 с. PASS: промежуточный кадр 390/1440 содержит rotateX (matrix3d), финал без transform, reduced/rollEnabled=false/выключение посреди — обычный текст; tsgo, build. 95 снимков не повторялись.
