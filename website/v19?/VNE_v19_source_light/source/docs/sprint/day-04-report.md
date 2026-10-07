# День 04 — доступ, роли, права (подготовка)

## Дополнение 25.09.2026, ~23:30 UTC — закрыт обход приглашения через прямой Auth→PostgREST (P1)

Проблема: проверка приглашения была только в /auth/callback; тот же токен можно было погасить напрямую (verifyOtp) и с настоящим JWT читать личные данные и вызывать гостевые RPC.
Исправление — миграция `supabase/migrations/20260925232007_*.sql`:
- Доверенный допуск в БД `private.member_admission` (pending|admitted|exempt|revoked), не JWT/user_metadata. Новый аккаунт → `pending` (триггер). `admitted` выдаёт только `accept_invite` в той же операции, что принимает конкретное текущее привязанное приглашение. Правила «нет приглашений → можно» нет.
- Проверка `private.is_admitted()` в: SSR кабинета (`getMemberState` → состояние «Доступ ещё не подтверждён», сбой → закрыто), RLS profiles/applications/application_events (свои строки), Storage private-docs, публичных гостевых RPC (submit_application[_v2], guest_application_action, guest_update_display_name → 42501), `staff_session_ok` (все staff-операции).
- Backfill перед применением проверен: в базе 1 аккаунт — владелец; ему явная запись `exempt/legacy_owner`; пароль, роли, данные не менялись; писем нет (`admission-state.json`).
- `set_admission_service` — только service_role (тестовая подготовка по точным id текущего прогона); гость вызвать не может (проверено). `my_admission()` — только чтение своего статуса (security definer намеренно; линтер предупреждает, данные чужих не отдаёт).
- Live (`invite-revoke-live.txt`, 32 PASS, exit 0): заменённый и отозванный токены, погашенные напрямую в Auth, → my_admission=pending, profiles/applications 0 строк при успешном SELECT, submit → 42501, загрузка в private-docs отклонена, самовыдача отклонена, заявок не создано; callback для них → отказ без новых cookies; текущее привязанное приглашение → admitted, профиль виден, заявка подаётся; повторный вход принятого работает.
- Регрессии: staff-matrix exit 0, e2e exit 0, idempotency exit 0, unit 105/105 exit 0 (включая сбой callback без выдачи cookies). Lint exit 1 — ошибки только в файлах платформы.
- NOT VERIFIED: вход самого владельца в браузере (пароль у нас отсутствует; проверено только состояние exempt в БД). Git HEAD при записи: `6ee5b93fa860612c38b1fcf9cf39c0ef46514739`; новые файлы — в следующем автокоммите.

## АКТУАЛЬНОЕ СОСТОЯНИЕ (25.09.2026, 23:10 UTC) — всё ниже — история

Верхние строки этого файла про «Lovable Cloud выключен», `xrocuwlofxhxoxajukne`, «облачных записей не было», «0 events» — **устарели**. Фактически: Lovable Cloud `zguyzxobplahlxuobwaw`, канон схемы `supabase/migrations`; реальный Auth (email+пароль), TOTP aal2, logout и отзыв доступа проверены на синтетике: `evidence/05/real-auth-staff-matrix.txt` (44 PASS), `evidence/05/invite-revoke-live.txt` (13 PASS). Событийные роли moderator/scanner/shift_lead требуют событие и срок (CHECK + RPC + UI); бессрочное только одно назначение owner — не менялось. Регистрация закрыта, роли только в `staff_assignments`.
NOT VERIFIED: ручной вход/MFA владельца; изолированный staging (BLOCKED). GitHub-проверку веток выполнял root через коннектор, не владелец. Git HEAD на момент записи: `0a099d8e70f13a77d8fb9b37c6e535b3ac1a98b1`. Подробности и exit codes — day-05-report.md, раздел «АКТУАЛЬНОЕ СОСТОЯНИЕ».

---

Статус дня: **PARTIAL** (код Auth/SSR/MFA/guard реализован fail-closed; реальная среда не проверена). Модель данных и права проверены на локальном PostgreSQL с упрощённой заменой служб Supabase. Облачная база, реальный вход, MFA и SSR-сессии: **NOT VERIFIED / BLOCKED** — нет подтверждённой тестовой среды (коннектор Supabase доступен, но назначение проекта как тестового не подтверждено; облачных записей не было).
Художественная приёмка этапа 03 по-прежнему **открыта** (см. day-03-report.md); здесь она не пересматривается.

## Версии
- Исходный SHA (git HEAD при старте): `591769d170446622ebf7f42508f5daa6edba65aa`. Совпадает с вводными.
- К моменту проверок HEAD сменился на `6374231afba75435ec6067511d0d7e75e83d0c02` (промежуточный автокоммит платформы). Итоговый SHA появится после следующего автокоммита: **не зафиксирован**.
- Ветки: локальная `edit/edt-b97dfff8…`, удалённая `origin/main` во внутреннем git Lovable. Привязанная ветка GitHub `osoka-san/VNEPARTYLLC` — **NOT VERIFIED**: в песочнице нет remote на GitHub, а платформа не показывает привязку.

## Фактическая среда
- Lovable Cloud выключен и не включался. Приложение к Supabase не подключено.
- Supabase через коннектор (указание владельца). Read-only проверка root: проект `VNEINFRASTRUCTURE_MAIN_COMM`, ref `xrocuwlofxhxoxajukne`, eu-central-1, PostgreSQL 17.6.1.166; public tables = [], migrations = [], auth.users = 0, storage buckets = 0, objects = 0, несистемных прикладных схем нет; security advisors lints = [].
- `list_branches`: только default `main`, git_branch=`supabase`, project_ref = parent_project_ref = `xrocuwlofxhxoxajukne`. Это **не** отдельная staging-среда и **не** доказательство связанной ветки Lovable.
- Облачных записей (миграции, seed, Auth-настройки) **не выполнялось**: тестовое назначение проекта не подтверждено.
- Локальный Supabase (`supabase start`): **невозможен** — нет Docker. Supabase CLI 2.117.0 доступен через bunx; команды сверены по `--help`.
- Использован временный PostgreSQL 17.9 из песочницы (`scripts/db-local-test.sh`) с заглушкой `tests/db/supabase-stub.sql`: роли anon/authenticated/service_role, `auth.users`, `auth.uid()` и `auth.jwt()` из `request.jwt.claims` (как в Supabase). GoTrue, PostgREST, Storage и реальные MFA-факторы **не эмулируются**.
- Среды: отдельных dev/staging/prod нет. Для каждой нужны свой проект, URL, publishable key, секреты и данные. Одна база не считается двумя средами. Регион и размещение production выбирает владелец.
- Документация: прочитан changelog Supabase (2026-09). Для этой модели существенны: игнорирование версии в `CREATE EXTENSION` (здесь не используется) и запрет на изменения схемы realtime (не затрагиваем). Явные GRANT для public-таблиц в миграции есть.
- Платформенное ограничение: папка `supabase/migrations` в Lovable управляется инструментом миграций, который недоступен без включённой базы. Поэтому миграции лежат в `db/migrations/`. После утверждения среды их переносят в штатный процесс (`supabase migration new` / инструмент Lovable) без изменения SQL.

## Файлы
- `db/migrations/20260925120000_day04_access_foundation.sql` — схема, GRANT, RLS, функции.
- `db/migrations/20260925120100_day04_storage.sql` — бакеты `public-media` (публичный, 5 МБ, изображения) и `private-docs` (закрытый, 2 МБ, папка = user id). Шаг пропускается, если нет схемы storage.
- `db/seed.sql` — только вымышленные записи (`*.invalid`).
- `tests/db/supabase-stub.sql`, `tests/db/access.test.sql`, `scripts/db-local-test.sh` — исполняемая матрица.
- `src/lib/auth/safe-redirect.ts` + `tests/safe-redirect.test.ts` — проверка адреса возврата после входа.
- `docs/sprint/evidence/04/db-access-matrix.log` — фактический вывод.
Интерфейс (/member, /admin, /scan), визуальная панель /admin, MCP и зависимости **не менялись**.

## Модель
```text
auth.users 1─1 profiles (только display_name; полей полномочий нет)
auth.users 1─* staff_assignments(role, event_id?, valid_from/until, revoked_at, granted_by)
events 1─* applications(user_id, status) ──> [будущее] participation → order → payment_event → pass → check_in
private.audit_log (actor, at, object, result, correlation_id)   private.outbox (pending, отправщика нет)
```
Роли: owner/admin/editor — глобальные; moderator/scanner/shift_lead — только с event_id (ограничение CHECK). Права всегда считаются по актуальным строкам назначений: JWT-роли и user_metadata не используются. Отзыв действует сразу, в пределах того же JWT (проверено).
- Сотрудник: `private.staff_session_ok()` = `aal = aal2` **И** `session_id` из JWT существует в `auth.sessions`. Эта проверка всегда стоит в одном выражении с `has_role` через AND (в политике и в RPC), никогда не отдельной permissive-политикой, которая OR-ом открыла бы доступ. Logout/отзыв сессии удаляет строку, и старый JWT с aal2 теряет права (проверено на заглушке auth.sessions; на реальном Supabase — NOT VERIFIED).
- Посетитель: только опубликованные события.
- Участник: свой профиль и свои заявки; может создать заявку `submitted` на опубликованное событие и отозвать её (`submitted→withdrawn`, проверка через USING/WITH CHECK; UPDATE разрешён только для колонки status).
- Модератор: заявки назначенного события, только при MFA (`aal2`); решение — через RPC `review_application`.
- Scanner, старший смены, редактор: роли заведены, операций пока нет (проход/исключения/контент — будущие этапы; по умолчанию доступ закрыт).
- Owner/admin: чтение назначений, `revoke_staff_assignment`, только при aal2.
- Первый владелец: `private.bootstrap_first_owner(uuid)`. EXECUTE отозван у всех API-ролей, включая service_role. Вызывает только оператор БД вручную; если владелец уже есть — отказ.
- SECURITY DEFINER: `has_role`, `review_application`, `revoke_staff_assignment`, `bootstrap_first_owner`, `handle_new_user`. У каждой `search_path=''`, узкие аргументы, `REVOKE … FROM PUBLIC, anon`. Схема `private` не публикуется через Data API.
- Аудит: успешные привилегированные действия пишутся с correlation ID. Отказ делает `raise exception`, транзакция откатывается, поэтому запись об отказе в БД **не сохраняется**; в миграции её нет, и сохранённый аудит отказа не заявляется. Отказы нужно фиксировать в серверном журнале вызывающего кода (этап с серверными функциями). Это ограничение, не PASS.
- Заказы, платежи, пропуска, check-in: таблиц нет; прямой доступ отсутствует по построению. Отрицательные тесты на подмену цены: **N/A** до этапа платежей.

## Команды и результаты
| Проверка | Команда | Результат | Уровень доказательства |
|---|---|---|---|
| Чистая миграция + seed | `bash scripts/db-local-test.sh` | PASS | локальный PG 17.9 + заглушка auth |
| Матрица доступа, 42 проверки: anon, гость A/B, модератор своего/чужого события, снятое назначение, отзыв, подмена user_id/роли/статуса, привилегированный RPC, logout со старым aal2 JWT, отозванная роль со старым JWT, аудит, outbox, GRANT/search_path/RLS. После каждой отказанной записи отдельно проверяется, что строки в БД не изменились (UPDATE может вернуть 0 строк без ошибки) | то же | 42/42 PASS | то же |
| Безопасный redirect | `bun test tests/safe-redirect.test.ts` | 10/10 PASS | unit |
| Типы | `bun run typecheck` | PASS | tsgo |
| Облачное применение, PostgREST, Storage-политики | — | NOT VERIFIED | нет среды |
| Вход/выход/восстановление/просроченная ссылка | — | NOT VERIFIED — BLOCKED | нет Auth |
| MFA /admin и /scan (aal2 на сервере) | проверено только условие в SQL | SQL PASS; приёмка административного доступа **BLOCKED** | — |
| SSR без частных данных, отсутствие service_role в браузере | код не добавлялся, ключей нет | NOT VERIFIED | — |

Снимков экрана нет: интерфейс не менялся, реальный вход не показываем.

## Auth/SSR — реализовано в коде (продолжение дня 04), fail-closed
- Пакеты зафиксированы точно: `@supabase/supabase-js 2.117.1`, `@supabase/ssr 0.12.7` (lockfile обновлён). 2.117.2 отклонён политикой минимального возраста релиза (24 ч). Node песочницы 22.22.0, требование supabase-js `>=22`. TanStack Start не менялся.
- Конфигурация (`src/lib/auth/config.ts`): бэкенд включается только при всех `VNE_AUTH_ENV` (development|staging), `VNE_SUPABASE_URL`, `VNE_SUPABASE_PUBLISHABLE_KEY`, `VNE_SITE_URL`. production не принимается; http только localhost в development; `sb_secret_*` отвергается; ref `xrocuwlofxhxoxajukne` заблокирован до подтверждения. Иначе: сеть не используется, писем нет, сессии нет, UI показывает «Вход недоступен».
- `src/lib/auth/supabase.server.ts`: `createServerClient` на каждый запрос, cookies из заголовка запроса, все `setAll` переносятся в `Set-Cookie`; `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `Vary: Cookie`.
- `src/lib/auth/auth.functions.ts`: подлинность через `getUser()` (/member) и `getClaims()` (staff guard); наружу только `state/displayName/aal/decision` — без токенов, claims и объекта user. Мутации (signIn, signOut, recovery, updatePassword, MFA enroll/verify) проверяют Origin поверх CSRF-middleware TanStack.
- Маршруты: `/login`, `/auth/recover`, `/auth/reset`, `/auth/mfa`, серверный `/auth/callback` (code/token_hash; ошибки → `expired|invalid|network`; без конфигурации → `unavailable`). `safeRedirect` применяется в search, после входа, после MFA и в callback. Неверный пароль/нет пользователя/не подтверждён → одно сообщение; восстановление всегда отвечает одинаково.
- Формы: `method=post`, fieldset `disabled` до гидратации и без конфигурации, `<noscript>`-пояснение.
- `/member`: серверный loader; без сессии → redirect `/login?redirect=/member`; без конфигурации — честное недоступное состояние.
- `/admin`, `/scan`: loader вызывает узкую RPC `public.my_staff_access(area)` (миграция `20260925130000`), где aal2 И живая сессия И актуальное назначение проверяются в БД; решение `signin→/login`, `mfa→/auth/mfa`, `denied/error→Доступ закрыт`. Без конфигурации `/admin` остаётся панелью внешнего вида с пометкой «Только внешний вид» (без данных и прав), локальная панель движения сохранена. Операции дней 05–08 не добавлялись.

## Проверки (продолжение)
| Проверка | Результат |
|---|---|
| typecheck (`tsgo`) | PASS |
| lint | 0 errors, 11 warnings |
| build | PASS; в `dist/client` нет `sb_secret`/`SERVICE_ROLE` |
| unit `bun run test:unit` (синтетический контракт, не реальный Auth) | 46/46 PASS |
| DB матрица `bash scripts/db-local-test.sh` (PG + заглушка, не Supabase) | ALL PASS, включая `staff-rpc.test.sql`: admin aal2 allowed; aal1, мёртвая/завершённая сессия, гость, модератор события для scan, отозванное назначение, неизвестная зона, anon execute — отказ |
| интеграция `bun run test:integration:auth` (Auth/PostgREST/MFA/logout) | **NOT VERIFIED — skip, exit 77**: нет локального Supabase (нет Docker) |
| браузер (preview, без конфигурации) | `evidence/04/browser-auth-unavailable.json` + скриншоты: все зоны private/no-store/noindex, формы disabled, no-JS `method=post`, внешних запросов 0, ошибок страниц 0; `/auth/callback` → 303 `/login?error=unavailable` |
| реальный вход, письма, MFA, Set-Cookie refresh, logout с настоящим JWT | NOT VERIFIED — нет подтверждённой тестовой среды |

## Резервные копии (регламент, не выполнялся)
БД: **целевой регламент** — ежедневные бэкапы (наличие и частота в плане проекта не проверены, как существующая настройка не заявляются) плюс перед каждой миграцией `supabase db dump` в закрытое хранилище владельца. Бэкап и дамп БД содержат только метаданные `storage.objects`, **не байты файлов**: объекты Storage копируются отдельной процедурой. Ответственного назначает владелец. Восстановление — только в изолированный проект, никогда не reset удалённой базы. Репетиция — день 09.

## Блокеры и критерий перехода
1. Владелец подтверждает тестовое назначение проекта через коннектор (или выделяет отдельный dev/staging; текущая ветка `main` staging не является). Тогда: включить подключение, перенести миграции в штатный процесс, повторить матрицу через PostgREST.
2. После этого: Auth (email + восстановление), `/member` с серверной проверкой `getUser/getClaims`, MFA для сотрудников, `safeRedirect` в форме входа.
3. Переход к дню 05 — только после PASS пунктов 1–2 на реальной тестовой среде. День 05 не запускался. Публикации не было.

## Исправления по независимому review SQL (день 04)
Все проверки ниже — **stub PostgreSQL** (`tests/db/supabase-stub.sql`), не настоящий Supabase/PostgREST/GoTrue/MFA. Storage — **NOT VERIFIED**.
- **P1 права таблиц.** Stub теперь воспроизводит худший случай legacy `ALTER DEFAULT PRIVILEGES … GRANT ALL` для anon/authenticated. Для каждой новой таблицы (`profiles`, `events`, `staff_assignments`, `applications`) миграция сначала делает `REVOKE ALL FROM public, anon, authenticated`, затем точный allowlist: `applications` — SELECT, INSERT только `(event_id, note)`, UPDATE только `(status)`; `profiles` — SELECT, UPDATE `(display_name)`. Последовательности private отозваны. Старые сервисные схемы не трогались. `tests/db/hardening.test.sql` проверяет, что default privileges действительно активны, и effective privileges через `has_column_privilege/has_table_privilege`; гость при submitted→withdrawn не может изменить `event_id/id/reviewed_by/created_at/updated_at` (42501), строка побайтно неизменна; вставка `id/reviewed_by/created_at` запрещена. Мутационная проверка: без REVOKE матрица падает.
- **P2 revoke_staff_assignment.** Возвращает `revoked` | `already_revoked` (аудит `noop`). Несуществующее → `P0002`, owner → `42501`: исключение, ложного `ok` в аудите нет. Тест: ровно один `ok`, один `noop`, owner активен.
- **P2 bootstrap_first_owner.** `pg_advisory_xact_lock` + проверка под блокировкой. Тест двух параллельных операторов: первый успешен, второй ждал и отклонён, owner = 1; повторный вызов отклонён. Глобального ограничения «один owner навсегда» не добавлено.
- **staff_session_ok.** Сессия должна принадлежать `auth.uid()` и `not_after` (колонка реальной Supabase Auth; в stub добавлена) должен быть пуст или в будущем; aal2 по-прежнему обязателен. Тесты: чужая сессия, истёкшая, aal1 на валидной — отказ; aal2 на своей — доступ.
- **review_application.** Порядок: MFA/сессия → назначение по событию без блокировки → `FOR UPDATE` с повторной проверкой события и статуса. Тест: при чужой удерживаемой блокировке неавторизованный вызов получает `forbidden` сразу (lock_timeout не срабатывает).
- Итог матрицы: `bash scripts/db-local-test.sh` — 134 PASS, ALL PASS (`evidence/04/db-access-matrix.log` (файл НЕ сохранён в репозитории — NOT VERIFIED; актуальный сырой лог: `evidence/05/db-local-matrix.txt`)). typecheck/build PASS, unit 46/46, интеграция с реальным Supabase — NOT VERIFIED (skip, exit 77). Операций дней 05–08 не добавлено; облако не менялось.

## SHA
Исходный: `591769d170446622ebf7f42508f5daa6edba65aa`. HEAD перед финальными правками этого прохода: `553a82a6538def79eb94caa67fa9115e33bc8a6d`; итоговый SHA — после автокоммита платформы, здесь не фиксируется.
GitHub: независимая проверка — SHA 591769… и d9a05fc… дают 422 в `osoka-san/VNEPARTYLLC`, 7 веток не совпадают; связанная ветка **NOT VERIFIED**. git sync/merge/push не выполнялись. Облако `xrocuwlofxhxoxajukne` не менялось, Lovable Cloud не включался, публикации не было, день 05 не запускался.
Инструкции по среде и бэкапам: `docs/ops/env-and-backup.md`.

## Решение владельца 25.09.2026 (после plan mode)
- `xrocuwlofxhxoxajukne` назначен тестовой (staging) средой дня 04. Реальные данные в нём не хранятся.
- Статус: **BLOCKED**. Supabase-коннектора среди доступных агенту подключений нет (есть только GitHub), поэтому проверки только на чтение, применение миграций и живые тесты Auth/MFA не выполнялись.
- Блокировка ref в `config.ts` пока не снята: её снимут отдельным коммитом, когда появится доступ.
- Все результаты пока получены на заглушке PostgreSQL. Живой Supabase: NOT VERIFIED.

## Продолжение 25.09.2026 — живая проверка (план одобрен)
- Шаг 1 выполнен: блокировка `xrocuwlofxhxoxajukne` в `src/lib/auth/config.ts` снята по решению владельца; production, http и `sb_secret_*` по-прежнему отвергаются. Unit 47/47 (синтетический контракт).
- Шаги 2–6 ЗАБЛОКИРОВАНЫ: у агента нет доступа к проекту (в подключениях только GitHub), переменные `VNE_*` в среде не заданы. Миграции не применялись, облако не менялось. Живой Supabase Auth/PostgREST/MFA/Storage — NOT VERIFIED.

## 25.09.2026 — перенос на подключённый бэкенд Lovable Cloud (решение владельца)
Среда дня 04 — бэкенд Lovable Cloud проекта (общий для предпросмотра и будущей публикации). xrocuwlofxhxoxajukne больше не цель.

- Миграция основы доступа (20260925120000 + 20260925130000) применена на живом бэкенде. Seed не применялся.
- Проверено на живой БД (has_table_privilege / has_column_privilege): anon — только SELECT events; authenticated — SELECT на 4 таблицах, INSERT только event_id/note в applications, UPDATE только status (event_id, reviewed_by, id — нет), DELETE нигде; RLS включена везде; auth.sessions.not_after существует.
- Linter: 3 предупреждения «SECURITY DEFINER доступна вошедшим» — review_application, revoke_staff_assignment, my_staff_access. Принято намеренно: это узкие RPC, каждая сама проверяет aal2, живую сессию и назначение.
- Настройки входа: регистрация отключена (закрытый клуб), анонимные — нет, автоподтверждение — нет, проверка утёкших паролей — да.
- config.ts: при отсутствии VNE_SUPABASE_URL берёт SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY, среда staging; production и sb_secret_* по-прежнему отклоняются. Unit 51/51.
- Браузер (живой бэкенд): неверный пароль → «Неверный email или пароль.» (без раскрытия аккаунта); /member и /admin без сессии → /login?redirect=… Скриншот evidence/04/cloud-login-invalid.png.
- Storage: бакет не создан — файловых сценариев в дне 04 нет. NOT VERIFIED.

NOT VERIFIED (блокер — нет тестового пользователя: регистрация закрыта): успешный вход, выход, MFA TOTP, staff guard с назначением, попытки подмены полей заявки через API.

## Дополнение 25.09.2026 (проход 04+05)
- Среда: Lovable Cloud `zguyzxobplahlxuobwaw`, общая для preview и будущей публикации — **не** две изолированные среды; deployment blocker до отдельного staging.
- Внешняя доставка писем выключена по умолчанию (`VNE_DELIVERY_MODE` ≠ `live`); одобрение членства создаёт и логирует приглашение без отправки.
- Согласие публичной формы теперь хранит версию/время/способ.
- Живые отрицательные SQL-проверки (откат, claims через set_config): «8/8 PASS» — сырой вывод не сохранён, NOT VERIFIED как артефакт; актуальная замена — `evidence/05/db-local-matrix.txt` (180 PASS). Это не проверка реального Auth/MFA.
- Гости A/B, сотрудники своего/чужого/отозванного события через реальный Auth — NOT VERIFIED. Итоговый SHA не заявляется.

## Аудит baseline 3e695e25 — gap → fix → evidence (25.09.2026)

Исходный SHA `3e695e25ed6dd6ef00574c3733f162764b9a2412`. Итоговый SHA — NOT VERIFIED. Связанная ветка GitHub — NOT VERIFIED (см. «Финальная проверка»).
Среда: подключённый Lovable Cloud — одна база для preview и будущей публикации (не staging). Внешняя доставка выключена (`VNE_DELIVERY_MODE` ≠ live), писем/Telegram не отправлялось.

| # | Gap | Fix | Evidence | Статус |
|---|-----|-----|----------|--------|
| P1 | `getAuthorizedStaff` = общий `my_staff_access('admin')` (включая editor) перед service_role-операциями | `private.staff_can(cap, event)`: membership/team = owner/admin, content = +editor, event_moderate = только своё событие; каждая membership-операция (list/review/revoke/history) проверяет `staff_can('membership')` + aal2 | SQL `audit-fixes`: editor membership/team denied, moderator membership denied | PASS (SQL-claims) |
| P1 | `my_staff_access(null)` отрезал event-модератора | shell = любое текущее назначение; данные/команды — конкретное событие + aal2 + живая сессия | SQL: moderator shell allowed, null/чужое событие denied; revoked/aal1 denied | PASS (SQL-claims) |
| P1 | `grant_staff_assignment` без event/expiry | RPC требует event для moderator/scanner/shift_lead, запрещает его у admin/editor, срок только в будущем, owner не выдаётся; UI «Команда» получил поля «Событие» и «Действует до» | SQL 6 кейсов; `tests/team.test.ts` 3 кейса | PASS |
| P1 | Отозванный/заменённый invite-link проходил callback | `accept_invite` → accepted/not_required/denied (current, sent, не истёк); callback при denied делает local signOut и показывает ошибку; пользователи без приглашений (recovery/login) — not_required | SQL: revoked/expired denied, current accepted, recovery not_required | PASS (SQL); живой клик по ссылке NOT VERIFIED (письма выключены) |
| P1 | `signOut` всегда ok | правдивый результат + сообщение в UI, навигация только после успеха | real Auth: signOut ok, затем старый ещё не истёкший aal2 JWT модератора → 42501 | PASS (real Auth) |
| P1 | membership/team/sections не отдавали обновлённые cookies | `flushCookies(ctx.pending)` на всех ветках helper'ов | code review | PASS (review), браузерный refresh NOT VERIFIED |
| P1 | Согласие membership только в UI; direct INSERT applications обходил требования | согласие (версия/время/метод) передаётся и хранится; прямые INSERT/UPDATE applications отозваны, только `submit_application` (возраст, версия согласия, лимит) | SQL: age/consent rejected; real PostgREST: direct INSERT со spoofed user_id/status и UPDATE denied | PASS |
| P2 | Конкурентные membership-решения, отдельная отправка | `membership_decide`: row lock, noop при повторе, решение+invite+audit+outbox(held) в одной транзакции, `invites_one_active` | SQL: 2-е решение noop, ровно 1 активный invite, 1 held outbox, noop в аудите, 2-й active invite → 23505 | PASS (SQL) |
| P2 | `submitMembershipRequest` ok:true при сбое | общая ошибка сервиса без раскрытия email; duplicate/rate-limit отдельно | unit + review | PASS |
| P2 | Очередь грузила 5000 строк | SQL count(head) + страница, фильтры | review | PASS |
| — | **Найдено в ходе проверки:** конфликт версии `40001` PostgREST повторяет автоматически → запрос зависал >100 с | новая миграция: код `PT409` (HTTP 409), логика функций без изменений; UI-текст «Карточку уже изменили» | real Auth: stale version → PT409 мгновенно | PASS |
| — | `db-local-test.sh` читал 3 старых `db/migrations` | применяет канонические `supabase/migrations/*.sql` по порядку, закрывает открытые транзакции, падает при ошибке миграции | `docs/sprint/evidence/05/db-local-matrix.txt`: 180 PASS, 0 FAIL — финальный прогон (старые 134 PASS не переносятся) | PASS |

### Реальный Auth/PostgREST/TOTP (не set_config)
`tests/integration/staff-matrix.integration.ts` (guard `VNE_INTEGRATION=cloud-synthetic`, иначе exit 77). Синтетика: 6 пользователей `*@synthetic.invalid` через admin.createUser без писем, 2 draft-события (не публичны); всё удалено после прогона (`cleanup-synthetic.ts`: остаток 0/0). Лог: `docs/sprint/evidence/05/real-auth-staff-matrix.txt` — 16/16 PASS (промежуточный прогон; заменён финальным 43/43 ниже): два гостя (чтение/отзыв/UPDATE/INSERT чужого), гость → moderation RPC, модератор aal1 denied, неверный TOTP отклонён, **верный реальный TOTP → aal2**, свой модератор берёт заявку, stale version, чужое событие/отозванный/истёкший модератор с реальным aal2 denied, реальный logout → старый JWT denied.

### Команды
`bash scripts/db-local-test.sh` → ALL PASS (172) · `bun test tests` → 94 pass · `bunx tsgo --noEmit` → 0 · `bun run build` → OK · `bun run lint` → 1 error в автогенерируемом `src/integrations/supabase/previewAuthStorage.ts` (prefer-const, файл не редактируется) + 11 warnings.

### Остаётся NOT VERIFIED / BLOCKED
- Отдельной staging-базы нет: preview и будущая публикация делят одну базу → **deployment blocker** для реального сбора данных.
- Живой invite-link/recovery в браузере (доставка выключена намеренно).
- Две одновременные сессии модераторов в интерфейсе браузера (на уровне реального API доказано, см. ниже).
- Скриншоты: прежние ссылки на скриншоты в отчётах не подтверждены артефактами — считать NOT VERIFIED.
- Тексты согласий — черновики; юридическая готовность не заявляется.

### Финальная проверка (25.09.2026, 22:30 UTC) — фактические результаты
**Реальный Auth/Data API/RPC на финальной схеме:** `tests/integration/staff-matrix.integration.ts`, лог `docs/sprint/evidence/05/real-auth-staff-matrix.txt` — **43/43 PASS** (финальный прогон после всех исправлений аудита abfbc7f3 и CAS/consent). DEMO-набор создан через Auth Admin `createUser` (email_confirm, без писем): 8 пользователей `*@synthetic.invalid` (2 гостя, свой модератор ×2, модератор чужого события, отозванный, истёкший, editor), все назначения с expiry, 2 draft- и 2 published DEMO-события (одинаковое название). Пароли и TOTP-секреты существовали только в памяти прогона, в вывод не попадали. После прогона всё удалено: остаток 0 пользователей / 0 событий. Существующие реальные записи не затрагивались.
Покрыто: `signInWithPassword`; неверный TOTP отклонён, верный реальный TOTP → aal2; два гостя (чтение/отзыв/UPDATE/INSERT чужого с подменой user_id/status); own/other/revoked/expired модератор; editor (content — да; membership, модерация, чтение заявок на вступление, membership_decide — нет); **два модератора одновременно**: ровно один выигрывает, второй PT409, версия +1; **повторные/параллельные отправки** → один id и одна строка, контакт берётся из Auth; без подтверждения возраста — отказ; реальный logout → ещё не истёкший staff aal2 JWT → 42501.
**GitHub (проверка владельца):** репозиторий VNEPARTYLLC доступен; baseline `3e695e25` отсутствует среди 7 веток, получение коммита вернуло 422. Связанная ветка **не выбрана и не угадывается** — NOT VERIFIED. Итоговый SHA — NOT VERIFIED.
**Сверка документации Supabase:** прямое чтение `changelog.md` не удалось из-за content-type; прочитан официальный https://supabase.com/changelog (25.09.2026): анонсирован Postgres 17.11, критичных изменений API/Auth для нашей Cloud-интеграции не обнаружено. Обновление БД не выполнялось.
**Изоляция dev/staging — BLOCKED:** preview и будущая публикация используют одну базу; это не две среды.
