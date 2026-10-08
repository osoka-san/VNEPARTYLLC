# TEST: отдельный bootstrap MFA для двух сканеров

Дата: 2026-10-07. Только локальный кандидат. Публикация и новый runtime flag ещё требуют точного разрешения владельца.

## Цель и версия

- Точная live-база: v5 `4bb8ff2df6ec1741e22c76559aea517864ec372d`, runtime 6.
- Проверенный code commit: `eef5d69bfce7cd1c84cbb9fbb1642a74d19c2dcb`. Ветка `candidate/test-scanner-mfa-bootstrap`.
- Только TEST Site `appgprj_6ac605807bf88191b7f2d0b5a717505d`, URL https://vne-test-20261007.can-avci48.chatgpt.site; Supabase `xrocuwlofxhxoxajukne`.
- Этот пакет не включает Day07 admission UI/SQL/RPC/fixture. Старый Day07 candidate нельзя публиковать поверх этого bootstrap без новой локальной интеграции.

## Три новые разрешённые учётные записи

Владелец создал пароли лично. Отдельная read-only проверка подтвердила email_confirmed=true, is_anonymous=false, banned=false, отсутствие staff assignments и verified TOTP на момент проверки.

| Назначение | UUID |
|---|---|
| Synthetic member | 15cbc7a4-92f6-48d8-abb2-ed68f7612271 |
| Synthetic scanner A | 1e7259c2-ad13-43a1-b34b-cba71533e844 |
| Synthetic scanner B | ed2433cb-bc6e-4b23-aa57-000839292ec4 |

Login allowlist становится ровно из шести UUID: эти три и три существующих v5 QA. Доступ к анкетам остаётся self-only. Нет wildcard, нового alias или выдачи membership/staff/admission прав. ADMIN_TEST server-only alias и существующая MFA реализация не изменены.

## Минимальное изменение публикации

1. Опубликовать reviewed source только в указанном TEST Site с существующим Supabase и `VNE_TEST_VARIANT=questionnaire-only`.
2. Добавить единственный флаг `VNE_TEST_SCANNER_MFA=enabled`. Остальные runtime settings сохранить, включая `VNE_TEST_ADMIN_MFA=enabled`, `VNE_AUTH_ENV=staging`, `VNE_DELIVERY_MODE=disabled`.
3. Разрешить маршрут `/scanner/mfa` и ровно три server handlers: `getScannerMfaState` GET; `beginScannerMfaEnrollment` POST; `completeScannerMfaChallenge` POST. Вся package allowlist содержит 14 функций, остальные 11 уже существовали в v5.
4. Маршрут и handlers доступны только двум scanner UUID после серверного getUser, nonanonymous проверки и точного совпадения claims subject. Member, ADMIN_TEST и остальные QA отклоняются. ADMIN_TEST MFA, наоборот, недоступна двум scanners.

Никаких QR RPC/grants/ролей/admission/fixtures/DB flags/secrets/env keys в этом шаге нет. Закрытая Day07 schema, уже установленная ранее, остаётся выключенной.

## Защита TOTP и workflow

- GET/status не создаёт фактор и не возвращает QR, secret, code или JWT. Начало enrollment происходит только по нажатию владельца в собственном аккаунте.
- Secret/QR показаны в памяти страницы; отсутствуют URL/storage/log exports. Страница запрещает кэширование, referrer и framing. Same-origin POST обязателен.
- Сервер выбирает фактор только из списка текущего пользователя. Любой уже verified factor запрещает enrollment нового через этот bootstrap; existing TOTP можно только challenge/verify. Удаление/замена/recovery не реализованы.
- Hidden, pagehide, logout и unmount очищают секреты/код и инвалидируют поздние async ответы. Logout блокирует дальнейшие UI mutations до повторного входа.
- Supabase challengeAndVerify обновляет session cookies; это не выдаёт scanner role. Успешная регистрация нового TOTP может завершить другие сеансы этого же synthetic account.
- Повторные прерванные настройки могут оставить несколько unverified факторов. Сервер не угадывает между ними, не удаляет и не восстанавливает их; при затруднении требуется отдельный пользовательский security handoff, а не автоматическая очистка.
- При lost QR пользователь сам решает следующий шаг; помощник не извлекает secret/JWT из браузера и не просит их в чате.

## Пользовательский handoff после разрешённой публикации

Открыть https://vne-test-20261007.can-avci48.chatgpt.site/login?next=/scanner/mfa в отдельном браузерном профиле для scanner A, затем аналогично для scanner B. Для одновременной проверки нужны разные cookie stores, например два разных браузера или два изолированных профиля; две вкладки или два private окна одного профиля не гарантируют две личности.

Владелец самостоятельно вводит известный ему пароль, нажимает подключение приложения, сканирует личный TOTP QR и вводит шестизначный код. Не отправлять QR/ключ/пароли/JWT и screenshots в чат. После подтверждения экран должен показывать AAL2. Сообщить только готовность двух аккаунтов; состояние verified factor можно затем подтвердить read-only без secret columns.

Существующий ADMIN_TEST профиль не использовать для этих двух входов, чтобы не прерывать текущую own-draft QA. Третьему synthetic member MFA этим пакетом не открывается.

## Доказательства на code commit

- 61/61 node tests: существующие и новые core/guard/session/privacy suites, включая anonymous/foreign subject/foreign factor, default-off, wrong route, frame headers, pagehide late replies.
- Packaged scanner transport: оба scanner own enrollment/challenge, шесть login IDs, alias collision denial, member/original QA denial, read-only GET, refreshed cookies, отсутствие DB/Admin API: PASS, полностью mocked network.
- Существующие packaged ADMIN_TEST и session-lifecycle проверки: PASS, полностью mocked network.
- Source + generated TEST typecheck, scoped lint, TEST build/prepare: PASS.
- Реальные пароли/MFA enrollment/challenge: NOT EXECUTED. Browser/device/real-session acceptance: NOT VERIFIED.
- Независимый review: bounded APPROVE на точном eef5d69. Дополнительная packaged negative matrix подтвердила scanner→ADMIN denial, default-off/incorrect flags, wrong target, cross-site POST, anonymous/claims mismatch и foreign/pending-factor rejection. Это не разрешение публикации.

## Точная проверка после разрешённой публикации

1. Confirm source/version/runtime и живой TEST origin.
2. Anonymous `/scanner/mfa` даёт только login redirect; unknown routes/QR endpoints не открылись; существующие own-draft и ADMIN_TEST flow сохранены.
3. Оба scanner выполняют собственный handoff. Остальные четыре QA получают 403 на scanner route/API; scanner не получает доступ к ADMIN_TEST MFA.
4. Read-only подтвердить verified TOTP для двух scanner UUID, не читая secret columns и не меняя Auth tables вручную.
5. Только после этого отдельно обсуждать временные роли/admission, synthetic fixture, Day07 runtime/API и настоящую concurrency.

Rollback-предложение: выключить новый флаг либо вернуть предыдущий v5 source при отдельном разрешении. Факторы/аккаунты/данные не удалять. Восстановление source не отменяет уже добровольно настроенный пользователем TOTP.

## Официальные источники

- Supabase TOTP enrollment/challenge/verification: https://supabase.com/docs/guides/auth/auth-mfa/totp
- challengeAndVerify SDK: https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify
- Changelog проверен 2026-10-07: https://supabase.com/changelog. Используется существующий @supabase/ssr, не deprecated @supabase/server adapters; зависимости не обновлялись.

## Коррекция возврата после входа

См. REDIRECT_FIX.md: initial bootstrap опубликован как v6/runtime7. Новый narrow correction проверен на5e527b2; exact/scanner/mfa возвращается после входа. Runtime/доступ не расширяется.
