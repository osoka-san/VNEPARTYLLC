# День 05 — заявка на событие → модерация → статус в кабинете

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

## Дополнение 25.09.2026, ~23:25 UTC — идемпотентность по полному исходному payload (закрыто)

Ранее открытый пункт (тот же key + то же событие + изменённое имя возвращал первый результат) закрыт миграцией `supabase/migrations/20260925231647_*.sql`:
- `applications.submit_fingerprint` — sha256 нормализованной исходной команды (event, trim(display_name), age_confirmed, consent_version), пишется только при создании; триггер запрещает менять fingerprint и idempotency_key. Legacy-строки не заполнялись (NULL → прежняя проверка только по событию).
- `submit_application_v2` → `{id, outcome: created|replay|existing, display_name, status}`. Тот же key + изменённый payload → PT422; идентичный повтор → прежний id (и после законного изменения имени — сравнение с неизменяемым fingerprint, не с текущим display_name). Новый key при существующей заявке на событие → `existing` с фактическими данными; имя не сохраняется, UI пишет «ничего не изменено».
- Старая `submit_application` (uuid) сохранена как обёртка.
- Live: `idempotency-fingerprint-live.txt` — 11 PASS, exit 0; повтор сквозного сценария `e2e-application-live.txt` — ALL PASS, exit 0; очистка по manifest, остаток 0. Git HEAD при записи: `ea175caf07ba53c341ab0afdc395504c1cadd1f2`; новые файлы попадут в следующий автокоммит.

## АКТУАЛЬНОЕ СОСТОЯНИЕ (25.09.2026, 23:10 UTC) — читать это; всё ниже — история

Git HEAD по `git rev-parse` на момент записи: `0a099d8e70f13a77d8fb9b37c6e535b3ac1a98b1` (автокоммит платформы 23:07:16Z). Файлы этой записи попадут в следующий автокоммит — его SHA здесь не угадывается.
Среда: Lovable Cloud `zguyzxobplahlxuobwaw` — одна база для preview и будущей публикации, не изолированный staging (BLOCKED). Публикации не было. Этап 06 не начат.

| Прогон (текущая версия) | Exit | Файл evidence/05 |
|---|---|---|
| Сквозной сценарий guest→mod→question→reply→approve + вторая заявка | 0 (20 PASS) | `e2e-application-live.txt` |
| audit / held outbox по успешным действиям | read-only SQL | `e2e-audit-outbox.json` |
| Приглашения (привязка ссылки), live revoke в одном JWT, guest RPC submit | 0 (13 PASS) | `invite-revoke-live.txt` |
| Матрица прав сотрудников (real Auth/TOTP/logout) | 0 (44 PASS) | `real-auth-staff-matrix.txt` |
| Локальная SQL-матрица | 0 (ALL PASS) | `db-local-matrix.txt` |
| Unit | 0 (105/105) | `unit-tests.txt` |
| Lint | **1 — FAIL**: 490 errors только в сгенерированных платформой `types.ts`/`previewAuthStorage.ts`; файлы проекта 0 errors, 11 warnings | `lint.txt` |
| Сборка | build OK | лог платформы |

Сквозной сценарий (одна гостевая published-DEMO заявка, не service-seeded): guest submit через публичную RPC → чтение после нового входа → mod (реальный TOTP aal2) take → request_info с публичным вопросом → гость видит вопрос в строке и истории → stale reply PT409 без записи → reply → история (время, вопрос, ответ) → approve → гость видит approved v5; в строке нет qr/pass/payment полей, таблиц passes/payments/orders/checkins нет. Вторая заявка: rename v2; прямые изменения owner/status/event отклонены; stale → PT409, NULL → 22023 (rename и withdraw); отказы не меняют строку и историю; withdraw +1 история; модератор другого события → 42501.
Audit/outbox: на каждое успешное действие ровно 1 audit `ok`; на каждую смену статуса ровно 1 held outbox (5 и 2); rename — только audit (не смена статуса); отказы — 0 audit/0 outbox. Held outbox этих синтетических заявок затем удалён по точным id (остаток 0), audit сохранён как история.
Очистка синтетики — только manifest точных UUID (remaining 0 во всех прогонах); sweep по домену/префиксу удалён и не запускался.

Скриншоты (штатный вход /login email+пароль, /auth/mfa TOTP; синтетика): `e2e/guest-member-form.png`, `e2e/guest_question-application.png` (вопрос + форма ответа + хронология), `e2e/guest_history-application.png`, `e2e/staff-queue.png` (очередь модератора с ответом гостя). `e2e/guest-admin-denied.png`: гость без роли на /admin получает шлюз «Второй фактор», очередь не показана — это скриншот фактического поведения, отдельного экрана «доступ закрыт» до MFA нет.

Git ls-files (после автокоммита 0a099d8e): отслеживаются real-auth-staff-matrix.txt, db-local-matrix.txt, invite-revoke-live.txt, unit-tests.txt, lint.txt, e2e/*.png, scripts/e2e_screens.py. `e2e-application-live.txt` и `e2e-audit-outbox.json` не игнорируются, войдут в следующий автокоммит.

Остаточные blockers / NOT VERIFIED:
- Изолированный staging отсутствует; бэкап/restore-площадка не настроены (день 09).
- Ручной вход и MFA **владельца** не выполнялись и не заявляются.
- Fault-path callback «БД недоступна / отзыв не удался» — только unit; rollback при внутреннем сбое — не проверялся (без fault injection).
- Team list (событие + срок) в браузере под владельцем — не снят.
- Lint FAIL в сгенерированных файлах платформы.
- GitHub-проверку веток выполнял root через коннектор; владелец её не выполнял; baseline 3e695e25 среди веток не найден (422), связанная ветка не выбиралась.
- Отменено как устаревшее: «0 событий», «audit/outbox live недоступно», «NOT VERIFIED guest submit / queue / хронология / форма ответа» — теперь PASS по файлам выше.

---

## Версия и среда
- Исходный SHA: `3e695e25ed6dd6ef00574c3733f162764b9a2412`, рабочая ветка платформы `edit/edt-2851942a…` (локально также `main`, `origin/main`). Связанная ветка GitHub в интерфейсе не проверена — **NOT VERIFIED**.
- Итоговый SHA: изменения не закоммичены вручную (git управляется платформой) — итоговый SHA не заявляется.
- Среда: подключённый Lovable Cloud (`zguyzxobplahlxuobwaw`), **одна база для предпросмотра и будущей публикации**. Это не изолированный staging. Регион/план/backup не проверены — не заявляются.
- `xrocuwlofxhxoxajukne` не используется.
- Миграция создана штатным инструментом миграций платформы (файл в `supabase/migrations/`), Supabase CLI в проекте не используется.

## Две разные сущности
| Сущность | Когда | Где |
|---|---|---|
| `membership_requests` | до аккаунта, публичная `/apply` | закрытый onboarding → приглашение |
| `applications` | после входа, на конкретное событие | `/member`, `/admin/applications` |

## Поля заявки
Имя для обращения; контакт — подтверждённый email из Auth (снимок `contact_email` берёт БД); событие; самоотметка 18+ (**не проверка возраста**); согласие: `consent_version=draft-2026-09`, `consent_at`, `consent_method=web_form_checkbox`; маркетинговое согласие отдельно, по умолчанию `false`, в UI не собирается. Документы — черновики: **реальный сбор данных BLOCKED** до финального текста.

Публичная форма членства теперь тоже хранит версию/время/способ согласия (раньше сервер не сохранял).

## Статусы и переходы
| Действие | Из | В | Кто |
|---|---|---|---|
| подать | — | submitted | гость |
| take | submitted | under_review | owner/admin/moderator события |
| request_info | submitted, under_review | needs_info (сообщение обязательно) | staff |
| reply | needs_info | under_review | гость |
| approve | submitted, under_review, waitlisted | approved | staff |
| reject | submitted, under_review, needs_info, waitlisted | rejected | staff |
| waitlist | submitted, under_review | waitlisted | staff |
| withdraw | submitted, under_review, needs_info, waitlisted | withdrawn | гость |

**Одобрение не является оплатой, правом участия или пропуском.**

## Реализация
- БД: `private.submit_application` (auth.uid, опубликованное событие, подтверждённый email, идемпотентный ключ + unique(event,user), лимит 10/час), `private.guest_application_action`, `private.moderate_application` (staff_session_ok = aal2 + живая строка auth.sessions, актуальное назначение на событие, проверка перехода, `version` — оптимистическая блокировка, ошибка `40001`). В одной транзакции: статус + `application_events` + `private.audit_log` (актор, время, объект, from/to, correlation_id) + `private.outbox` со статусом `held` (доставка отключена).
- Прямые INSERT/UPDATE/DELETE гостя на `applications` отозваны; остаются SELECT своих строк и SELECT staff назначенных событий.
- `application_events`: гостю — только статус, время, публичное сообщение.
- Приглашения членства: внешняя отправка выключена, пока `VNE_DELIVERY_MODE` не равен `live` (`src/lib/delivery.ts`). Приглашение создаётся и логируется (`delivery_disabled`), письмо не уходит. Регистрация остаётся закрытой.
- UI: `/member` — следующий шаг, мои заявки, форма заявки (кнопка неактивна до гидратации, повтор с тем же ключом не создаёт дубликат); `/member/applications/:id` — статус, сообщение команды, ответ, история, отзыв; `/admin/applications` — поиск по имени/email, фильтры статус/период, серверная пагинация по 20, карточки с действиями. Массовых действий нет.

## Файлы
`supabase/migrations/<новая>.sql`, `src/lib/applications.ts`, `src/lib/applications.functions.ts`, `src/lib/delivery.ts`, `src/lib/membership.functions.ts`, `src/components/member/MemberApplications.tsx`, `src/routes/member.tsx`, `src/routes/member_.applications.$id.tsx`, `src/routes/admin_.applications.tsx`, `src/routes/admin.tsx`, `tests/applications.test.ts`.

## Команды
- `bunx tsgo --noEmit` — PASS
- `bunx eslint --fix` (изменённые файлы) — PASS
- `bun test` — 86 PASS до добавления; `tests/applications.test.ts` 5 PASS
- `bun run build` — PASS

## Матрица
| Проверка | Результат |
|---|---|
| Живая БД, откатываемая транзакция: прямой INSERT/UPDATE гостя | PASS (отказ) |
| Гость вызывает moderate_application | PASS (42501) |
| Гость отзывает чужую/несуществующую заявку | PASS (42501) |
| Заявка на неопубликованное событие | PASS (22023) |
| Гость пишет в историю | PASS (отказ) |
| anon: submit RPC и SELECT applications | PASS (отказ) |
| /member, /member/applications/:id, /admin/applications без сессии → /login, `private, no-store` | PASS (скриншоты `docs/sprint/evidence/05/*-anon.png`) |
| Два реальных гостя A/B через Auth + PostgREST | NOT VERIFIED — нет синтетических Auth-пользователей и опубликованного события |
| Реальная MFA/logout для модератора | NOT VERIFIED |
| Два одновременных модератора (версия) | NOT VERIFIED вживую; реализовано `version` + `for update` |
| Сотрудник другого события / отозванное назначение | NOT VERIFIED вживую; логика в has_role |
| Скриншоты форм и статусов с данными | NOT VERIFIED (нет событий) |

Примечание: SQL-проверки выполнены с `set_config('request.jwt.claims')` — это **не** проверка реального Auth/MFA.

## Нерешённые вводные
Финальные тексты правил/согласия и их версия; нужна ли проверка возраста сверх самоотметки; реальные события (сейчас 0 опубликованных); отдельная staging-база.

## Критерий перехода
День 06 можно начинать только после PASS живых сценариев: два гостя A/B через реальный Auth, модератор с реальной TOTP, конкурентная модерация, сотрудник чужого события и снятое назначение — в изолированной тестовой базе.

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

## Аудит commit abfbc7f3 — gap → fix → evidence (25.09.2026)

| P | Gap | Fix | Evidence | Статус |
|---|---|---|---|---|
| P1 | Legacy `public/private.review_application` был EXECUTE для authenticated и обходил CAS/историю/held outbox | Обе функции удалены; единственный путь — `moderate_application` (версия, `application_events`, audit, outbox held). Локальные тесты переведены на новый путь | Real Cloud: moderator aal2 вызывает старую RPC → PGRST202, статус/версия/история не изменились; local SQL: approve только через take→approve с записью истории | PASS |
| P2 | MemberApplications скрывал события по `eventTitle` | DTO получил `eventId`, фильтр по id | Real Cloud: второе событие с тем же названием получает свою заявку | PASS |
| P2 | Ключ идемпотентности + смена события → SQL `key OR event_id` возвращал старую заявку | Поиск по ключу отдельно; тот же ключ с другим событием → `PT422`, «сохранено» не показывается; клиент выпускает новый ключ при смене события/имени | Real Cloud: reuse key на другом событии → PT422, строк 0 | PASS |
| P2 | В очереди нет фильтра события | Выпадающий список «Событие» из событий, видимых сотруднику по RLS (назначения + aal2), параметр `event` в адресе | Сборка OK; UI-скриншот под staff-сессией — NOT VERIFIED | PASS (код) |
| P2 | CTA `/events/:slug` вёл только в `/apply` с текстом «данные не отправляются» | Две кнопки: «Заявка на событие — войти» → `/member?event=slug` (после входа событие сохраняется через safe redirect и предвыбирается) и «Запросить членство» → `/apply`; текст правдивый | Сборка OK; браузерный проход после входа — NOT VERIFIED | PASS (код) |

Промежуточный итог этого аудита: real 31/31, local SQL 175 PASS (заменён финальным ниже) (`db-local-matrix.txt`), bun test 94/94, build OK. Ручной вход/MFA владельца — NOT VERIFIED. Синтетика удалена. Уточнение: ключ идемпотентности привязан к событию; смена только имени при повторе с тем же ключом возвращает первую заявку (имя не перезаписывается), клиент при этом выдаёт новый ключ.

## Дополнительный DB-fix: CAS и версия согласия (25.09.2026, новая миграция)

| Gap | Fix | Evidence | Статус |
|---|---|---|---|
| `guest_application_action`/`moderate_application`: `r.version <> NULL` пропускал CAS при прямом PostgREST-вызове с NULL | Версия обязательна и ≥ 1 (иначе 22023), сравнение `IS DISTINCT FROM`, конфликт → PT409 | Real Cloud: модератор NULL → 22023; гость NULL → 22023, stale → PT409. Local SQL: NULL и stale для обоих RPC denied | PASS |
| `submit_application` принимал любую строку consent_version по regex | Сверка с серверной `private.current_consent_version()` (`draft-2026-09`); в строку пишется серверное значение | Real Cloud: произвольная версия → 22023; local SQL: `arbitrary-v9` → 22023 | PASS |

**Финальный итог 04–05 после всех очередных исправлений:** real Auth/PostgREST/TOTP **43/43 PASS**, local SQL (канонический chain) **180 PASS / 0 FAIL**, bun test 94/94, build OK. Синтетика удалена (остаток 0/0). Ручной вход/MFA владельца, браузерные проходы очереди с фильтром и `/events/:slug → вход → /member` — NOT VERIFIED. Тексты согласий — черновики. Этап 06 не запускался.

## Формы (аудит abfbc7f3, последние пункты) и сводка артефактов

| Gap | Fix | Evidence | Статус |
|---|---|---|---|
| Согласие на членство могло записаться без явного подтверждения прямым same-origin вызовом | `/apply` передаёт boolean `consent`; сервер `hasExplicitConsent` принимает только строгое `true` и отказывает ДО записи; версия/время/способ пишутся только после этого. Старые строки не дозаполнялись (backfill не выполнялся; сейчас в таблице 0 запросов) | `tests/membership-consent.test.ts` (true принимается; undefined/null/false/"true"/"on"/1/{} — нет; проверка стоит до RPC) | PASS |
| Форма ответа `member_.applications.$id.tsx` без method/hydration guard: no-JS SSR мог отправить ответ GET-параметром в URL | `method="post"`, поле и кнопка неактивны до гидрации, обработчик игнорирует submit до гидрации; `/apply` тоже получил `method="post"` | `evidence/05/nojs-forms.json` (скрипт `evidence/05/scripts/nojs_forms.py`): `/apply` без JS — method=post, fieldset disabled, URL без query; unit-тест формы ответа. Сама форма ответа под сессией без JS — NOT VERIFIED (нужен вход) | PASS (код + no-JS /apply) |

**Сырые артефакты в репозитории** (контрольные суммы: `evidence/05/SHA256SUMS.txt`):
- `evidence/05/real-auth-staff-matrix.txt` — 43/43 PASS, скрипт `tests/integration/staff-matrix.integration.ts`.
- `evidence/05/db-local-matrix.txt` — 180 PASS / 0 FAIL, скрипт `scripts/db-local-test.sh` + `tests/db/*.sql`.
- `evidence/05/nojs-forms.json` — скрипт `evidence/05/scripts/nojs_forms.py`.
- `evidence/05/app-anon.png`, `member-anon.png`, `queue-anon.png` — существуют.

**Упомянуты, но НЕ сохранены (NOT VERIFIED как артефакт):** `evidence/04/db-access-matrix.log` (и «8/8» из дня 04); в `site-motion-system-report.md` — папка `site-motion-review-evidence/` (typecheck, build, browser-results, addendum-results, SHA256SUMS) в репозитории отсутствует.

**Итог 04–05 со всеми очередными исправлениями:** real 43/43, local SQL 180/0, bun test 97/97, build OK, синтетика удалена. NOT VERIFIED: ручной вход/MFA владельца, фильтр очереди и путь `/events/:slug → вход → /member` в браузере под сессией, no-JS форма ответа под сессией. 06 не запускался, публикации не было.

## Завершающий остаток аудита abfbc7f3 (25.09.2026, миграция поверх канонической цепочки)

| # | Gap | Fix | Проверка | Тип доказательства |
|---|---|---|---|---|
| 1 | Ошибка загрузки показывалась как «нет заявок / Найдено: 0» | `/member`: отдельные состояния «ошибка связи + Повторить», «сессия истекла + Войти», «события не загрузились» (подача временно недоступна, не «событий нет»), пустота только при успешном ответе. `listPublishedEvents` возвращает `ok`; `listQueue` — `reason: session/unconfigured/error`; `/admin/applications` показывает ошибку/повторный вход вместо «Найдено: 0», пустой успешный список — «Заявок по этим условиям нет» | Сборка OK | **code-only** (ошибочные состояния в браузере не воспроизводились) |
| 2 | Хронология без вопроса/ответа; новый `request_info` сохранял старый `guest_reply` | `application_events.guest_message`; ответ гостя пишется в хронологию; `request_info` очищает `guest_reply` в карточке (старый ответ остаётся в хронологии). Страница заявки: «Хронология» со временем, «Вопрос команды» / «Ваш ответ», «Текущий вопрос команды», подсказка про новый ответ | live: Q1 → A1 → Q2 в порядке, `guest_reply` = null после Q2 | **выполненный тест** (данные); отображение — code-only |
| 3 | Нет безопасного редактирования разрешённых полей | `guest_update_display_name(app, name, version)`: только владелец, только имя (1–80), только submitted/under_review/needs_info/waitlisted, CAS по версии (NULL → 22023, stale → PT409), audit `application.guest_rename`. Событие/владелец/статус/цена не меняются | live: успех + version+1, статус/событие прежние; stale PT409; чужой гость 42501; NULL 22023; финальный статус 22023 | **выполненный тест**; форма — code-only |
| 4 | Колоночные GRANT могли пережить REVOKE таблицы | снят INSERT/UPDATE/DELETE/TRUNCATE таблиц и INSERT/UPDATE каждой колонки `applications`, `application_events` у anon/authenticated | `evidence/05/column-grants-after.json` (0 строк в column_privileges); local SQL-проверка; live: прямой UPDATE колонки отклонён | **выполненный тест** |
| 5 | Границы | lost-response retry тем же ключом → тот же id; тот же ключ + другое событие → PT422, строки нет; одинаковое название, разные id → отдельная заявка; два модератора → ровно один успех, второй PT409, одна строка хронологии и один bump версии; одна строка хронологии на каждый успешный переход; отказанный переход не меняет версию/статус и не пишет историю | live 43/43 | **выполненный тест**. Audit+outbox ровно по одной записи на успех — local SQL (live-API к private-схеме нет). Rollback при сбое **внутри** транзакции после записи (fault injection) — **NOT VERIFIED**: разрушающие инъекции на общей базе не выполнялись; проверен только отказ до записи |

Исправлен флейк теста PT422: ключ берётся из реально сохранённой строки (в параллельной гонке побеждает любой из трёх запросов).

**Итог 04–05 после всех очередных сообщений:** real 43/43 PASS, local SQL 180 PASS / 0 FAIL, bun test 97/97, build OK, синтетика удалена. NOT VERIFIED: ручной вход/MFA владельца; фильтр очереди, путь `/events/:slug → вход → /member`, ошибочные состояния и хронология в браузере под сессией; no-JS форма ответа под сессией; rollback при внутреннем сбое. 06 не запускался, публикации не было.

## Коррекция по review cf258c05 (25.09.2026, ~23:00 UTC)

- **Cleanup только по manifest.** Прежний sweep `cleanup-synthetic.ts` (все `*@synthetic.invalid`, все draft `synthetic-%`) удалён и больше не запускался. Новый `tests/integration/manifest-cleanup.ts`: прогон записывает точные UUID пользователей, всех 4 событий, заявок и назначений в `/tmp/vne-synthetic/manifest-<run>.json` сразу после создания; удаление только по этим id, каждая ошибка учитывается, итог перепроверяется запросом по тем же id; «VERIFIED removed» печатается только при 0 остатков и 0 ошибок. `cleanup-synthetic.ts <manifest>` — повторная очистка прерванного run по manifest. Реальные аккаунты/owner не выбираются. Выполнено: run 18d3576e — users 8, events 4, apps 4, assignments 6, remaining 0 (см. real-auth-staff-matrix.txt).
- **Событийная роль = событие И срок.** Проверка перед миграцией: в базе единственное назначение — owner, бессрочное, глобальное; событийных без срока 0, поэтому ничего не придумывалось и не менялось. Добавлены: CHECK `event_role_scope_and_expiry` (moderator/scanner/shift_lead ⇒ event_id и valid_until не NULL), RPC `grant_staff_assignment` → 22023 без срока (будущее проверяется в RPC), валидатор и обязательное поле «Действует до» в UI. Owner/admin не затронуты. Выполнено: live 23514 при прямой вставке без срока; local SQL RPC-отказ 22023; bun-тест валидатора.
- **Evidence.** `*.log` в `.gitignore` → прежние .log не попадали в commit. Сохранён санитизированный фактический вывод: `evidence/05/real-auth-staff-matrix.txt` (44 PASS, 0 FAIL) и `evidence/05/db-local-matrix.txt` (ALL PASS), SHA256SUMS обновлён. `git check-ignore` — файлы не игнорируются; `git ls-files` до платформенного commit их ещё не показывает (git add выполняет платформа) — проверить на следующем SHA.
- **Lint.** `eslint --fix` исправил форматирование; проверка проекта не отключалась. Остаётся 1 error `prefer-const` в `src/integrations/supabase/previewAuthStorage.ts` — файл генерируется платформой и перезаписывается, правка запрещена → lint: **FAIL (1 error, platform readonly)**, 11 warnings.

## Повторный review cf258c05 — P1 callback и привязка приглашения (25.09.2026, ~23:20 UTC)

Выполнено (сохранённые выводы текущей версии, evidence/05, SHA256SUMS обновлён):
- **Callback fail-closed.** `src/lib/auth/invite-callback.ts::finishCallback`: auth cookies выдаются только при `accepted|not_required`. Любой отказ/исключение (getUser, accept_invite недоступна, verdict denied) → cookies от exchange отбрасываются, все `sb-*` явно истекают (Max-Age=0), сессия отзывается: user signOut → при ошибке admin signOut по JWT; если оба не удались → `/login?error=revoke` + серверный лог без токенов. Unit fault-path: DB unavailable, getUser throw, signOut error → admin fallback, оба revoke throw (`unit-tests.txt`, 105/105).
- **Привязка ссылки к строке.** На каждую отправку генерируется nonce (32 байта), в ссылку `…/auth/callback?inv=<nonce>`, в БД только `invites.token_hash` (SHA-256, уникальный). `mark_invite(... _token_hash)` без хэша для sent → 22023. `accept_invite(_user, _token_hash)` атомарным UPDATE принимает только строку с тем же хэшем, того же пользователя, sent, не истёкшую, не отозванную и текущую для заявки. Нет/чужой/старый/заменённый/отозванный/просроченный токен → denied; уже принявший участник → not_required (recovery/login не ломается). Существующих приглашений было 0, ничего не изменялось, письма не отправлялись.
- **Live (`invite-revoke-live.txt`, 13/13):** A) guest submit через публичную RPC `submit_application` — своя строка, серверная версия согласия; прямая вставка гостем отклонена. B) один aal2 JWT модератора: до отзыва видит заявку события и `staff_can(event_moderate)=true`; назначение отозвано; тот же JWT (сравнён) — 0 строк и `false`. C) replaced-link через настоящий `/auth/callback` (Admin generateLink, ссылки не печатались): старая ссылка → `/login?error=invite`, 0 новых auth cookies, текущее приглашение не тронуто; текущая → `/member` с сессией, приглашение accepted; повторный вход принявшего → `/member`. Очистка по manifest: remaining 0.
- **Local SQL (`db-local-matrix.txt`, ALL PASS):** нет токена, старый токен того же пользователя, отозванный, просроченный, чужой пользователь → denied; текущий → accepted; повтор → not_required; mark без хэша → 22023.
- **Team list:** у каждого назначения видно «Событие: …» или «Весь сайт» и «до … UTC» / «бессрочно».

NOT VERIFIED / code-only: fault-path «БД недоступна» и «signOut не удался» проверены только unit-тестами (разрушающая инъекция в live не делалась); отображение Team list в браузере под сессией владельца; `real-auth-staff-matrix.txt` — прогон этого же вечера до правки callback (его область не затронута).
Lint: **FAIL** — 490 errors только в сгенерированных платформой `src/integrations/supabase/types.ts` и `previewAuthStorage.ts` (перегенерированы после миграции, правка запрещена); собственные файлы проекта: 0 errors, 11 warnings (`lint.txt`).

## Коррекция утверждений harness (25.09.2026, 23:1x UTC)

Отрицательные кейсы больше не засчитывают любую сетевую ошибку как отказ:
- скрытые чужие строки (`guest B cannot read A by id`, `editor: membership requests not readable`) требуют `error === null` и пустого успешного SELECT;
- недоступная запись (`guest direct UPDATE`, `guest direct INSERT` со спуфингом, `direct column UPDATE`) требует конкретного кода прав `42501` вместо `Boolean(error)`;
- после каждого отказа записи проверяется неизменность строки (status/version/display_name) и отсутствие новых строк.

Фикстуры: все назначения на событие уже создаются с `valid_until` (staff-matrix, e2e-application, invite-revoke); отдельный негативный кейс `valid_until = null` остаётся и подтверждает ограничение БД (23514). Ограничение не ослаблялось.

Фактические прогоны (tracked вывод):
- `docs/sprint/evidence/05/real-auth-staff-matrix.txt` — ALL PASS, exit 0
- `docs/sprint/evidence/05/e2e-application-live.txt` — ALL PASS, exit 0
- `bun test` — 105 pass / 0 fail, exit 0
- коды выхода: `docs/sprint/evidence/05/run-exit-codes.txt`
Синтетика удалена по manifest, остаток 0 по всем таблицам. Этап 06 не начинался.
