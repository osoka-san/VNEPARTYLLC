# VNE V06 — review workspace verification

Date: 2026-10-06. Base source: 9895c64227fad2c3a314c6acec835719b5902d97.
The source commit created by Sites packaging contains this exact implementation and checks.

## Delivered
- D1-backed account testrev1 / Тестревью, bootstrap from a server-only secret on first request. Read permissions: admin.view, qr.read, content.read.
- Existing administrator login preserved. Account creation, individually assigned permissions, password reset and block/unblock. Owner and self-edit protections. Rights reside in staff_assignments; no Supabase membership/staff permission is conferred.
- Server-side opaque hashed sessions, PBKDF2 password hashes, account-version revocation, same-origin writes, bounded request bodies, durable failed-login limits.
- Audit of successful/failed login, logout, admin views, account and draft changes, QR saves/archive; no raw passwords, session tokens, IPs or QR payloads in audit.
- Overview with actual D1 counts; content and event draft editors with version conflicts, review/archive states. Drafts do not publish content or sell tickets.
- Accounts section and operations log. Unconfigured membership/team/applications/orders remain muted, with a styled explanatory dialog and direct-route notices.
- All 16 QR templates in four desktop columns; compact 144–195px images, adjacent thumbnails, search/filter and links to card preview. Existing generator, exports and scan validation retained.

## Evidence
- PASS: node --test tests/sites-admin-gate.test.mjs — 5 integration scenarios, real isolated SQLite, synthetic accounts; anonymous/forged/CSRF denied, reviewer read/write matrix, grants/self escalation, concurrent version conflict, password reset, revocation, block, draft archive, expiry, persistent rate limit.
- PASS: node tests/qr-studio/library-api.test.mjs — 96 checks, including reviewer read allowed/save+archive rejected and retained Supabase staff guard checks.
- PASS: node node_modules/@typescript/native-preview/bin/tsgo.js --noEmit.
- PASS: npm run build — original vite build script, retained TanStack/Nitro and bun.lock. The Sites build helper could not start because Bun is absent; the exact package build script was run via available npm without reinstalling dependencies or changing the lockfile.
- PASS: node scripts/prepare-sites-output.mjs and node scripts/verify-sites-build.mjs — packaged Worker, network disabled, synthetic D1; 22 owner routes plus reviewer admin/QR/card/account pages and packaged API deny checks.
- PASS: git diff --check.
- Browser, actual mobile/desktop interaction, screenshots and physical QR scans: NOT VERIFIED. Managed control-browser skill is unavailable; no alternative browser/server path was started.
- External delivery, membership moderation, real orders/payments, ticket issuance remain unconfigured. Existing independent staff/MFA checks preserved.

## Operational notes
Additive migration: drizzle/0001_site_review_workspace.sql. Existing qr_pattern_versions and migration history preserved.
Bootstrap runs outside migrations and never overwrites an existing account. VNE_REVIEW_PASSWORD is an environment secret, never source or client code. Subsequent resets go through the Accounts UI. Deploying this migration expires old stateless stand cookies; users sign in again with their existing administrator credentials or the new reviewer account.
Old deployment can still run after additive schema creation. Do not delete rows or rewrite applied migration history.
No external messages were sent. Public Sites audience preserved; application login remains required.

## Additional preview settings
Owner's follow-up is included: footer on every admin route with «Сохранить всё для превью», group selection and «Актуализировать настройки». All 66 current motion/text/navigation/visual settings belong to 6 disjoint groups. Saving selected groups preserves unsaved groups in the current preview and leaves their shared defaults unchanged. Only role owner can publish shared defaults; reviewer can GET/refresh. New preview mounts load the persisted baseline, while immediate control changes, reset and JSON tools remain.
Additive migration: drizzle/0002_preview_settings_defaults.sql. Site audience remains unchanged.
PASS: node tests/preview-defaults.test.mjs — complete field coverage, partial merge, owner/reviewer permissions, CSRF, input validation, concurrent version conflict, refresh across sessions, audit. Real isolated SQLite and no network. Browser interaction remains NOT VERIFIED.
