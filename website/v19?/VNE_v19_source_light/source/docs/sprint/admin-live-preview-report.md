# Админ-панель: постоянный доступ и живые примеры

## Результат

- В корне сайта добавлен постоянный служебный ряд: «Движение» и «Админ» доступны на всех страницах.
- Ссылка «Админ» ведёт на `/admin` и получает `aria-current="page"` на активной странице.
- Служебный ряд расположен вне `PageTransition`; декоративный `BottomDock` не менялся.
- На `/admin` текущий параметр связан с контекстным примером. На desktop пример закреплён справа,
  на mobile расположен перед настройками и может быть свёрнут.
- Изменение ползунка или переключателя сразу обновляет значение и перезапускает только пример,
  не перемонтируя элементы управления.
- Импорт, экспорт, сброс и browser-local хранение сохранены. Text Roll остаётся текущим rotateX-вариантом;
  Text Shatter не возвращён.

## Карта настроек → примеры

| Группа | Ключи |
|---|---|
| Появление | `revealStyle`, `duration`, `ease`, `distance`, `blur`, `scaleFrom`, `heroStagger` |
| Текст | `textEnabled`, `textHeadingStyle`, `textBodyStyle`, `textAccentStyle`, `textSplit`, `textDuration`, `textDelay`, `textStagger`, `textDistance`, `textBlur`, `textScaleFrom`, `textViewportAmount`, `textRepeat`, `textHeroSequence`, `textButtons`, `textCards`, `textAdmin` |
| Курсор | `magnetic`, `magneticStrength`, `magneticMaxOffset`, `tilt`, `tiltDeg`, `press`, `pressHover`, `pressTap`, `scramble`, `springStiffness`, `springDamping` |
| Акценты | `rollEnabled`, `rollDuration` |
| Дополнительно | `menuMotion`, `menuStagger`, `progressiveBlur`, `imageReveal`, `imageScaleFrom`, `glow`, `shimmer`, `dialogMotion`, `pageTransition`, `pageDuration` |

Карта объявлена как `Record<keyof MotionSettings, SettingPreview>`, поэтому пропущенный новый параметр
не проходит проверку типов.

## Проверки

| Проверка | Статус |
|---|---|
| TypeScript | PASS |
| ESLint | PASS: 0 ошибок, 8 предупреждений Fast Refresh |
| Motion tests | PASS: 6/6 |
| Основные страницы и история | PASS: 22 состояния |
| Production build | PASS |
| Preview build log | PASS |
| Desktop 1440×900, 1920×1080 | PASS |
| Mobile 360×800, 390×844, 430×932 | PASS |
| Низкий viewport 390×600 | PASS |
| Горизонтальное переполнение | PASS: отсутствует |
| Переход из постоянного ряда на `/admin` | PASS |
| Активное состояние `/admin` | PASS |
| Ползунок с клавиатуры и сохранение фокуса | PASS |
| Связанный пример и отображение нового значения | PASS |
| Невалидный импорт не меняет настройки | PASS |
| Возврат фокуса после Escape | PASS |
| Сохранение значения после reload | PASS |
| Окно выше постоянного ряда | PASS: dialog z-index 50, ряд z-index 30 |
| Физические устройства, реальный GPU, production, приёмка владельцем | NOT VERIFIED |

## Артефакты

- `docs/sprint/screenshots/admin-live-preview/admin-1440x900.png`
- `docs/sprint/screenshots/admin-live-preview/admin-1920x1080.png`
- `docs/sprint/screenshots/admin-live-preview/admin-360x800.png`
- `docs/sprint/screenshots/admin-live-preview/admin-390x844.png`
- `docs/sprint/screenshots/admin-live-preview/admin-430x932.png`
- `docs/sprint/screenshots/admin-live-preview/admin-390x600.png`

## Ревизии

- Исходная ревизия задания: `f971ec1415f8d0c98a85368c95cc2c3b467cf05c`.
- Проверенная ревизия кода перед оформлением отчёта: `6119e73143c1eaabe814fa5a1ff394f85bbec0b5`.
- Публикация не запускалась; база, права, продуктовые состояния, портал и фоновые ассеты не менялись.