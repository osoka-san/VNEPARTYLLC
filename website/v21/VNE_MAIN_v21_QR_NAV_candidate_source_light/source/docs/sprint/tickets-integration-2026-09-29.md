# Интеграция индивидуальных билетов ВНЕ — 2026-09-29

Исходный HEAD: `ccec1f5691dfd33725d48bf4b19cb78457caa16f`. Промежуточный автокоммит платформы: `fb127c5735af4ba47438139cc23fd76ef20783c2`. Итоговый SHA — следующий автокоммит после этого отчёта (платформа создаёт его сама).
Публикации нет. Изменений, миграций и записей в Cloud DB нет. Платежи и рассылки не подключались.

## Файлы
- `src/components/tickets/`: types.ts, ticket-designs.ts, QrCode.tsx, BrandMark.tsx (маска из существующего `/brand/wordmark/wordmark-flow-light.svg`, он совпадает с ассетом kit байт в байт, кроме финального перевода строки), BadgeCard.tsx, LanyardRibbon.tsx, MetalClasp.tsx, HangingBadge.tsx (физика перенесена без изменений, добавлены только типы), PassView.tsx (PassView, TicketStage, DesignSheet), TicketAdminPanel.tsx.
- `src/styles/tickets/`: pass.css и admin.css (скопированы из kit как есть, там только классы `.vne-*`), base.css — изолированная замена shell.css без html/body/reset.
- `src/lib/tickets/`: contract.ts (валидация, allowlist, sanitize), pass-proxy.server.ts (fetch с таймаутом 8 с, `redirect:error`, fail-closed, повторная проверка staff), tickets.functions.ts (серверные функции).
- Страницы: `/admin/tickets` (`src/routes/admin_.tickets.tsx`) и `/pass` (`src/routes/pass.tsx`). В `/admin` добавлен пункт «Билеты» и ссылка на раздел.
- Тесты: `tests/tickets-contract.test.ts`. Доказательства: `docs/sprint/evidence/tickets/`.
- Зависимости: `qrcode@1.5.4` (та же версия, что в ZIP) и dev-пакет `@types/qrcode`; обновлён bun.lock.

## Env (только на сервере, сейчас НЕ настроены)
`VNE_PASS_SERVICE_URL` — только https; http://localhost допускается лишь при NODE_ENV=development. `VNE_PASS_ADMIN_KEY` — не короче 32 символов.

## Что подключено в коде
- Разрешённые пути: `/api/admin/issue` (с Idempotency-Key), `/api/admin/get`, `/api/admin/revoke`, `/api/pass/read` (без ключа администратора). `retry-delivery` не подключён.
- Каждое админ-действие проверяет по порядку: Origin → входные данные → актуальный guard (`aal2` + `my_staff_access('admin')`) → конфигурацию. Только после этого идёт запрос к модулю.
- Ответы помечены private/no-store, noindex и Referrer-Policy no-referrer. Коды ошибок отдаются только из списка разрешённых. Ключ не попадает ни в ответы, ни в логи.
- `/pass`: токен берётся только из `#`, страница не рендерит его на сервере, чтение идёт через POST. Отдельные состояния: нет токена, не найден, не подключено, недоступно, отозван, истёк, использован. У неактивного пропуска QR не показывается. Просмотр ничего не погашает.
- Тип карты SECURITY/ARTIST не даёт никаких прав на сайте.

## Что НЕ подключено в runtime
Сервер выдачи и его env, доставка сообщений, автоматическая выдача после оплаты, сканер.

## Результаты
| Проверка | Итог |
|---|---|
| typecheck (tsgo) | PASS |
| build (vite/nitro) | PASS |
| lint изменённых файлов | PASS (0 ошибок, 2 предупреждения react-refresh) |
| контрактные тесты (21): нет конфига / unauthorized / cross-origin / неверное действие / неверный ввод / allowlist / без утечки ключа / revoked без QR / сбой сети ≠ допуск | PASS |
| в клиентской сборке нет имён VNE_PASS_* | PASS |
| UI: 4 типа, flip на 1440; VIP flip на 390 | PASS (временный изолированный harness на синтетике, удалён) |
| drag и инерция (карта продолжает движение после отпускания) | PASS |
| пауза стабильна; reduced motion — карта неподвижна, «Качнуть» отключено; увеличенный QR | PASS |
| unconfigured: кнопки выдачи нет, показано «Выдача не подключена» | PASS (harness) |
| `/pass` без токена, с плохим токеном, с валидным форматом без конфигурации | PASS |
| `/admin/tickets` без входа → /login | PASS |
| `/admin/tickets` под staff с MFA | NOT VERIFIED (auth не ослаблялась) |
| реальная выдача через модуль | NOT VERIFIED (модуль не подключён) |
