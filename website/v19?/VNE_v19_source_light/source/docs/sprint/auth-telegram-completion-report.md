# Telegram, база и вход — завершение (25.09.2026)

## Сделано
- Telegram: токен бота действителен (`getMe` ok, бот `@VNE_MP_BOT`). Вход только для существующего аккаунта с привязанным Telegram; привязка/отвязка в `/member` уже реализованы и проверены кодом (подпись HMAC, срок, одноразовый nonce, уникальный telegram_id).
- БД: три предупреждения линтера устранены — `my_staff_access`, `review_application`, `revoke_staff_assignment` перенесены в `private`, в `public` остались SECURITY INVOKER обёртки. Линтер: 0 замечаний.
- Новый `grant_staff_assignment(email, role)`: owner/admin + живая MFA-сессия; owner не выдаётся, admin выдаёт только owner; журнал `staff.grant`.
- `record_membership_invite` переносит имя и Telegram из заявки в профиль приглашённого.
- `/admin` → «Команда»: назначение и отзыв ролей (owner не отзывается).
- Сотрудник без MFA уже перенаправляется на `/auth/mfa` (StaffGate).

## Проверки
- typecheck PASS; focused eslint PASS; bun 44/44 PASS (включая `tests/team.test.ts`).
- БД: anon не может вызвать назначение роли, прочитать заявки или роли — PASS. Пользователь без роли с aal2 получает `forbidden` при назначении (транзакция откатана) — PASS.
- build PASS.

## NOT VERIFIED / требует владельца
- Живой вход через Telegram: нужен `/setdomain` в @BotFather для домена превью.
- Вход владельца, MFA и раздел «Команда» в браузере: нужен первый вход по письму-приглашению.
- Storage не создавался (не требуется). Публикации не было.
