# Полная система анимации VNE Gallery of Light

## Результат

Единая сдержанная motion-система будет применена ко всем существующим пользовательским страницам без изменения контента, портала, ассетов, маршрутов или backend. Текущие `MotionProvider`, `Reveal`, `AnimatedText`, `TextRoll`, `TextScramble`, Radix-компоненты и browser-local настройки останутся основой.

## Реализация

1. **Общие примитивы**
   - Добавить SSR-безопасные локальные `InView`, `TextLoop`, `AnimatedBackground` и варианты для навигации/карточек.
   - Гарантировать один главный эффект на элемент, остановку циклов вне viewport/скрытой вкладки/при hover или focus, мгновенный финальный вид при manual/system reduced motion.
   - Сохранить Text Roll `rotateX` на «Меньше шума.» (0,62 с) и текущий 520 мс Text Scramble только для меток 03–06.

2. **Общая оболочка**
   - Оставить один `PageTransition`, ключевать только pathname и сохранить служебный ряд вне него.
   - Добавить движущийся индикатор активной/hover-ссылки desktop-навигации и спокойные переходы mobile menu.
   - Перевести группы footer на одноразовый InView и короткие hover/focus-переходы.
   - Добавить короткое появление 404/error без вмешательства в обработку ошибок.

3. **Главная и события**
   - Убрать конкурирующие `Reveal` + `AnimatedText` обёртки в главах и построить логические InView-последовательности.
   - Сохранить hero/WebGL lifecycle без циклических эффектов; CTA остаются доступны сразу.
   - Добавить Text Loop Basic в «Принадлежность».
   - Добавить общий Animated Card Background для карточек главной и `/events`, с hover/focus/touch состояниями без layout shift и двойного transform.
   - На detail оставить image reveal 1.025→1, статичные факты/демо-статус и одноразовое появление тематических блоков/CTA.

4. **Контентные страницы**
   - `/about`: согласованные image/heading/body InView и один custom Text Loop «Музыка / Свет / Пространство».
   - `/faq`: доступный Radix Accordion с 240–300 мс раскрытием, активным фоном и поддержкой `#access`.
   - `/apply`: одноразовые появления групп без перемонтирования полей; успешная локальная проверка открывает доступный Radix Dialog с честным demo-текстом и возвратом фокуса.
   - `/rules`, `/contact`: спокойные блочные InView.
   - Документы: только тихое появление контейнера/шапки, основной текст всегда полностью видим в SSR.
   - `/member`, `/scan`, `/i/$code`, `/c/$code`: одно спокойное появление реального empty-state.

5. **Админ-панель и схема v4**
   - Добавить настройки Text Loop, Animated Background, FAQ, Navigation и Dialog; все новые ключи включить в типизированный `Record<keyof MotionSettings, SettingPreview>`.
   - Заменить выбор групп предпросмотра на доступный Segmented Control со скользящей подложкой и клавиатурной навигацией.
   - Добавить реальные интерактивные пробы Text Loop basic/custom, card background, FAQ, navigation и dialog с указанием мест использования.
   - Обновить JSON до v4; мигрировать v1–v3, сохранить старые значения, clamp диапазоны и отклонять null/array/будущие версии без изменения настроек.

6. **Проверка и документация**
   - Выполнить typecheck, lint, build и `test:motion`.
   - Проверить preview по семействам маршрутов, menu/FAQ/dialog/admin/settings на desktop/mobile, short viewport и 200% zoom; проверить keyboard, Back/Forward, `#access`, query события, reload, импорт/migration, off/reduced/no-JS и остановку Text Loop.
   - Не обновлять visual baseline; просмотреть намеренные различия отдельно.
   - Создать `docs/design/site-motion-map.md` и `docs/sprint/site-motion-system-report.md` с фактическими PASS/FAIL/NOT VERIFIED, SHA и путями артефактов.

## Технические ограничения

- TanStack Start, React 19, motion 12 и Radix остаются без обновления и без второго движка.
- Новых Canvas, scroll lock/snap, backend/Auth/DB/production-изменений и публикации не будет.
- Служебные `/mcp`, `/sitemap.xml`, `/.well-known` не меняются.
- Физические устройства и реальный GPU будут отмечены как NOT VERIFIED.
