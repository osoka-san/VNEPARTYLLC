# Подключение и запуск билетов

## Текущий блокер

В исходниках задан Supabase project ref `zguyzxobplahlxuobwaw`. Доступ к нему через подключённый Supabase отклонён. Доступный `xrocuwlofxhxoxajukne` — другой, неактивный проект. Миграция и Edge Function в общей/рабочей базе не применялись. Пароль стенда Sites не заменяет служебный аккаунт и MFA.

## Порядок активации

1. Подключить разрешённый аккаунт к правильному проекту. Проверить текущую историю миграций, резервную копию и соответствие схемы checkout. Сначала применять в отдельной тестовой базе, не использовать общую базу как fixture.
2. Применить `supabase/migrations/20261005132540_ticket_issuer.sql`. Она создаёт билетные таблицы/RPC и согласует вместимость с существующей обработкой оплаты. Не выполнять reset/seed в общей базе.
3. Развернуть `supabase/functions/vne-ticket-issuer`. Пример команд после проверки цели:

   ```sh
   supabase db push --linked --dry-run
   supabase db push --linked
   supabase functions deploy vne-ticket-issuer --project-ref <подтверждённый-project-ref>
   ```

   `verify_jwt=false` нужен для гостевого чтения. Административные запросы внутри функции требуют секрет issuer и JWT сотрудника; PostgREST и RPC проверяют JWT/права. Не удалять эти проверки.
4. Настроить секреты через хранилище платформы. Значения не коммитить и не передавать в переписке.

   | Среда | Переменная | Значение |
   |---|---|---|
   | Issuer | SUPABASE_URL | Адрес подтверждённого проекта |
   | Issuer | VNE_SUPABASE_PUBLISHABLE_KEY | Publishable/anon ключ того же проекта |
   | Issuer | VNE_PASS_ADMIN_KEY | Случайный секрет не короче 32 символов |
   | Issuer | VNE_PASS_TOKEN_SECRET | Криптографически случайный секрет, минимум 32 байта в base64url (43 символа) |
   | Issuer | VNE_PASS_TOKEN_KEY_VERSION | Например k1, неизменно на срок жизни билетов |
   | Issuer | VNE_SITE_URL | HTTPS origin этого сайта, без пути |
   | Site | VNE_PASS_SERVICE_URL | https://<ref>.supabase.co/functions/v1/vne-ticket-issuer |
   | Site | VNE_PASS_ADMIN_KEY | Тот же VNE_PASS_ADMIN_KEY |
   | Site | VNE_SUPABASE_URL / VNE_SUPABASE_PUBLISHABLE_KEY | Тот же разрешённый backend |
   | Site | VNE_AUTH_ENV | staging для поддерживаемой текущей auth-конфигурации |
   | Site | VNE_SITE_URL | HTTPS origin сайта |
   | Site | VNE_TICKETS_PUBLIC_PASS | 1 только после успешной проверки гостевого чтения |

   Рабочий режим auth вне development/staging в текущей архитектуре ещё не включён; не обходить этот gate переименованием среды. Сначала завершить существующую приёмку авторизации.
5. Подтвердить служебную сессию: приглашённый аккаунт, допуск, MFA, активное owner/admin назначение. Для входа назначить scanner/shift_lead на конкретное событие. Регистрация остаётся закрытой.
6. В мероприятии задать capacity, published, qr_release_at, entry_opens_at, entry_closes_at; release ≤ открытие < закрытие. Тестовое событие должно иметь is_synthetic=true.
7. Пройти в изолированной среде весь путь: ручная выдача, повтор при потерянном ответе, ссылка в приватном окне, выпуск QR по времени, камера, verify, checkin, повторный checkin, отзыв, отмена события и возврат участия.
8. Проверить две реальные параллельные PostgreSQL-сессии: гонка последнего места manual/reserve/payment, одновременный checkin, отзыв во время verify. Локальный PGlite эти сценарии с независимыми соединениями не доказывает.
9. Только после этих проверок включать реальную выдачу. Доставка сообщений остаётся выключенной; ссылки копирует администратор.

## Эксплуатация

- Хранить резервные копии БД и TOKEN_SECRET вместе в защищённом хранилище. Потеря ключа делает прежние QR/ссылки невосстановимыми. Восстановление backup после фактического прохода требует сверки журнала checkin, иначе может вернуть использованные билеты в active.
- Не менять токенный ключ на ходу. При ротации сначала внедрить несколько версий ключей; текущий код при несовпадении закрывает доступ с token_key_unavailable.
- Аварийно выключить выдачу: убрать VNE_PASS_ADMIN_KEY на Site. Закрыть публичную карточку: VNE_TICKETS_PUBLIC_PASS=0. Уже открытая карточка не гарантирует вход: сервер каждый раз проверяет состояние.
- Ошибка связи не означает отсутствие выполненной операции. Повторять исходный запрос с прежним operationId.
- Не логировать Authorization, X-VNE-User-JWT, тела read/scan, fragment ссылки и QR. Контролировать только коды результата, request ID, задержки.
- Нагрузка на публичный read ограничивается инфраструктурными лимитами проекта; нагрузочный тест и мониторинг выполняются перед массовой рассылкой ссылок.

## Воспроизводимые локальные проверки

```sh
node tests/tickets/database.test.mjs
node tests/tickets/issuer.test.mjs
node tests/tickets/public-boundary.test.mjs
node tests/qr-studio/library-api.test.mjs
node tests/qr-studio/worker.test.mjs
node node_modules/@typescript/native-preview/bin/tsgo.js --noEmit
node node_modules/vite/bin/vite.js build
node scripts/prepare-sites-output.mjs
node scripts/verify-sites-build.mjs
```

База тестов — изолированный PostgreSQL WASM, реальные domain/commerce миграции и RPC с синтетическими auth claims/sessions. HTTP issuer тестируется на контролируемом PostgREST-адаптере. Это не живой Supabase Auth и не browser E2E.
