# Day07 · восстановленный TEST-кандидат, 8 октября 2026

Проверенный runtime code: bba4e659e339a572e4a89309ae6d5c31b1f9de04. Сохраняется TEST v11 9c7a15d88e945e7b869cfefd66bf523bb21960d5, runtime8, ADMIN_TEST модуль, шесть аккаунтов и четыре synthetic preview страницы. Следующий documentation/test-only commit не меняет build inputs. Точная итоговая версия и архивы находятся в PACKAGE.json внешнего пакета. MAIN не менялся.

Исходный локальный44c633 исчез после сброса среды и не был опубликован/сохранён в Library. Новая реализация не наследует его результаты автоматически. Read-only история Supabase восстановила побайтово applied closed schema298b3d437b15b66b04771e7a894ef59ed59c119dd48b44830317c58e45aae0a0 и correctionbc19ed77f9f983397d61c9c82c3a032ede460872cd1f474c37a7b46cdd701e19; command prosrc остаётся ad5e6d8a373ad9a93bcce234e3a7d640bd423717966c821837485357acc2f5bf. Их повторно не применять.

## Контракт

VNE2 bearer содержит только256 случайных серверных бит, без PII. В БД остаётся SHA-256. Принят единственный режим explicit-rotation-v2: секрет виден только в one-time ответе и памяти текущей owner страницы. Потерянный ответ повторяется той же immutable operationId без возвращения секрета; новая выдача требует явного подтверждённого rotate. Render/GET/вторая вкладка/переворот карты не ротируют QR. После первичного прохода generation не восстанавливает entitlement; re-entry OFF. Адрес выдаётся отдельным ownership-checked GET после reveal, не попадает в SSR/QR.

Членская карта отделена от event pass; /i/vne направляет только на/. SQL проверяет текущие session/admission/MFA factor/назначение, approved application, paid sandbox order, active participation, synthetic event и три временных окна. Canonical locks event→order→participation→pass; UNIQUE(participation_id), immutable positive/negative receipts, per-actor rate limit30/min, audit и held outbox без QR. Private функции закрыты; будущий wrapper дополнительно ограничивает3UUID/4event-participation пары и одно20-минутное окно.

## Свежая проверка

| Объём | Результат и предел |
|---|---|
| Настоящие TEST metadata07:48–07:51 UTC | PASS: config false/false, public RPC отсутствует, private body совпадает,9 QR-таблиц RLS/closed select+insert,7 private функций closed EXECUTE, primary UNIQUE/FK RESTRICT |
| Настройка MFA двух scanners08:24:38 UTC | PASS LIVE metadata + owner confirmation: по1 verified TOTP и1 связанной AAL2 session; staff roles0 |
| Recovered DB suite |44 groups PASS; одна PGlite connection, synthetic Auth и host CSPRNG adapter. Включены оба observer SQL пути без второго backend |
| Scoped activation/seed/cleanup |17 groups PASS: price/currency/null reason/provenance/held outbox, scope rollback, sequential accepted/used+replay, exact cleanup retention |
| Timed scheduler |18 PASS, включая4 независимых reproducer cases; реальные latency/clock/overlap не проверены |
| Owner/regular scanner/transport |Independent APPROVE: lifecycle/address fencing, actual React SSR, decoded Q-level QR, strict serializer envelopes, constant errors, no secret SSR/storage/URL |
| Typecheck/lint/build |Source+generated typecheck, scoped lint,18-function build/compiled transport PASS; Auth/RPC network mocked |
| Inherited TEST |15 existing handlers preserved inside18; v11 login/MFA/admin-return suites PASS;4 previews byte-identical v8 |
| Native package |139 prepared files byte-identical,0 SQL/drizzle/D1; SHA4f415b44660b6f5cb1ee0c17d6c2508926eb8e8867f0a6bc9f8d47401fd0486f |
| Genuine QR calls/concurrent PostgreSQL |NOT VERIFIED, ждут согласованного live запуска |
| Real issuer entropy/device camera/browser lifecycle |NOT VERIFIED; публичный seed не проверяет защищённую выдачу |
| Formal controller/Day08 |CONTROLLER_NOT_CONNECTED / BLOCKED |

В review исправлены реальные blockers: два probe литерала ранее отклонялись транспортом; observer использовал cached activity snapshot; throttled timeout мог принять поздний ответ; устаревший address reply мог восстановить закрытый адрес; immutable Seroval envelope доходил до framework logging; nested /admin layout скрывал MFA screen. Все исправления имеют повторные независимые проверки. Probe exception узкий: только verify, ровно два публичных литерала и exact primary event, без обхода Auth/MFA/RPC.

Новая actual race требует двух owner-held видимых браузеров. Timed QA на /scan?qa=timed inert до явной кнопки. Не более10 QR POST/profile/run, response4s, RTT250ms, identity15s, clock30s, timer gap200ms, lateness100ms. Hidden/logout/offline/pagehide отменяют; late reply fenced. Observer делает pg_stat_clear_snapshot в каждом poll, удерживает только synthetic event row максимум2s, освобождает через subtransaction rollback до вывода. PASS требует двух actor+operation-bound PID, соответствия receipt backend_pid/statement_started_at, одного accepted/одного used/одного primary и immutable replay. Импорт metadata не удостоверяет их источник. Повтор/продление окна автоматически не выполняется.

## Разрешение и следующий шаг

Owner approval Sentinel_ae22efd58c1c8191ad5b657a0a0d11be («да») дан на публикацию TEST и четыре synthetic события, три допуска, восемь event-scoped scanner assignments на20минут, narrow QR API, primary proof/replay и последующее закрытие/отзыв/архивацию с сохранением evidence. Реальных платежей/доставки/Auth mutations/purge нет. T ещё не выбрана: после публикации и финальной проверки требуется свежая готовность двух браузеров. Существующие ADMIN_TEST права сохраняются.

Cleanup закрывает DB config/RPC, отзывает8assignments и3admissions, архивирует4events. Runtime QR flags сохраняются, пока full build live, чтобы формы/previews продолжали работать. Questionnaire-only rollback требует paired compatible source.

Источники: https://supabase.com/docs/guides/auth/server-side ; https://supabase.com/docs/guides/auth/auth-mfa ; https://www.postgresql.org/docs/current/pgcrypto.html ; https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-STATS-VIEWS . Актуальные live определения/миграции сохранены в docs/day07/recovery. Все proposal SQL — отдельный разрешаемый объём; timestamps/operation IDs пока не материализованы.
