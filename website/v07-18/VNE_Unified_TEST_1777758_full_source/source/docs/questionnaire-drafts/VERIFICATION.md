> Historical pre-activation review. Final approved operational scope is in ACTIVATION_APPROVED_SCOPE.md; do not use the old five-minute or no-purge proposal as the activation instructions.

# Verification, 2026-10-07

Scope: isolated, unpublished candidate on TEST v2 base `c0ad4b246f7b5a38887c63f0a06caed986cef5ff`. Source is an uncommitted candidate, identified by the accompanying manifest and immutable delivery archive. No remote database was contacted. All fixtures are synthetic adults. No password/key was needed.

Runtime: Node.js v24.19.0. Reused the pre-existing project dependency directory; no dependency installation or lockfile change. This is not a claim that a fresh immutable Bun install was run. Bun itself is unavailable in this execution shell, so Bun-only suites were not rerun; relevant executable Node/PGlite suites below were run instead, without editing the old tests.

## Final checks

- `node node_modules/@typescript/native-preview/bin/tsgo.js --noEmit`: PASS, exit 0.
- Focused ESLint on every changed TS/TSX implementation file: PASS, exit 0; zero errors. One `react-refresh/only-export-components` warning remains for the existing provider/hook export pattern.
- `node node_modules/vite/bin/vite.js build`: PASS, exit 0. Existing Vite adapter warning is not a draft failure.
- `node tests/questionnaire-drafts.test.mjs`: PASS, 11 controller/server groups. Includes debounce; partial/both-mode round-trip; refreshed controller; multidevice stale version; focus after uncertain commit; correction after invalid input; edits during save; logout completion/late responses; retry identity; expiry; owner/foreign-response guards.
- `node --test tests/questionnaire-draft-handlers.test.mjs tests/questionnaire.test.mjs tests/questionnaire-handlers.test.mjs`: PASS, 22 tests, zero fail/skip. Six new request-boundary cases plus sixteen existing questionnaire/handler regressions.
- `node tests/db/questionnaire-drafts.mjs`: PASS, 12 offline SQL groups. Includes closed DDL/ACL rollback; owner/RLS boundary; validator parity; real partial round-trip; replay TTL; stale version conflicts; foreign owner/session switch; final validation; forced-audit atomic rollback; expiry/purge; revoked sessions; re-login through replacement session.
- `node tests/db/questionnaire-persistence.mjs`: PASS, 17 existing R2 groups and 64 invalid commands.
- `node tests/db/questionnaire-activation.mjs`: PASS, 7 existing R2 activation groups.
- `git diff --check`: PASS.

Detailed sanitized command output is in the corresponding `evidence/*.log`; SQL evidence includes proposal SHA-256 and explicit limitations in `evidence/offline-db.json`. Legacy R2 scripts regenerated their existing evidence with identical repository content; no legacy evidence changed in the candidate diff.

## Independent read-only review

An independent reviewer examined the implementation and SQL, reproduced three recovery defects, and verified their fixes:
1. Focus following a committed save with lost response no longer discards later local edits via a false conflict.
2. A definite invalid-input rejection no longer traps corrected input behind the rejected mutation.
3. Completion of logout sends a second cross-tab invalidation, preventing an in-flight old-session reload from surviving logout.

Final independent result: no remaining blocking source-level findings. Independent scope: 11 controller/server groups, 6 handler tests, 11 SQL groups, two original reproduction programs and whitespace check. The twelfth SQL case (replacement session for same owner) was added afterward; implementation did not change after the review. This is a review result, not a merge/deploy authorization or formal end-to-end acceptance.

## Not verified / blocked

- Supported cloud browser rejected `http://localhost:5187/apply` with `net::ERR_BLOCKED_BY_CLIENT`. No alternative browser, file, headless or direct transport was used to bypass that denial. Local dev server was stopped.
- Desktop/mobile visual states, keyboard/focus, actual cross-tab navigation and BFCache remain NOT VERIFIED.
- PGlite runs one session and has synthetic auth tables/claims. It does not prove real JWT validation, GoTrue, PostgREST, cookie transport or deployed ACLs.
- True PostgreSQL multiconnection races remain NOT VERIFIED: simultaneous saves, save versus final submission, logout versus save/read, purge versus save.
- The closed proposal, separate activation, environment flag, deployment and purge scheduler have not been applied. Physical retention enforcement is not operational.
- User confirmation of the exact 67-day start point, physical-purge tolerance and backup retention remains a product/operations gate.

## Required next verification after separate authorization

On the exact isolated TEST deployment, use synthetic accounts A/B: save incomplete answers; reload; log out/in; restore in another device; race two tabs; interrupt a save response; revoke a session; submit after another device saves; force a controlled transient failure; verify final receipt and absence of draft in the same successful transaction. Exercise the agreed expiry boundary, authorized purge job and backlog monitor. Do not use the existing real user's answer contents to produce QA evidence.

## Final TEST daily-purge candidate, after owner approval

Supersedes the earlier no-purge state. Actual slim TEST generated build, slim typecheck, allowlist generation, packaged SSR smoke and packaged login/logout lifecycle smoke all PASS. Final Node regression command runs 33 tests (six new HTTP handlers, sixteen old questionnaire/handler tests and eleven TEST guard/session tests); controller/server harness passes eleven scenario groups. Revised DB suite passes fifteen groups, including staged/cutover ACLs, retained-expired row handling, expired-only daily purge and stale first-create issuance rejection. pg_cron registration is stubbed offline; the exact purge/ACL SQL is executed. Actual extension/schedule activation remains to be verified separately.

No code claims formal acceptance by a protected controller. This is a user-authorized TEST rollout with independent source/SQL review and explicit verification limits. No main v20 publication is authorized.
