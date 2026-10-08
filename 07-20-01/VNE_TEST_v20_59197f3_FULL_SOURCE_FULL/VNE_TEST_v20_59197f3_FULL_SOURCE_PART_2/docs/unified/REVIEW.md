# Unified TEST: scoped classic + Day07 integration

## Verified sources and scope

- Target: existing TEST Site `appgprj_6ac605807bf88191b7f2d0b5a717505d`, formerly Sites build 17.
- Functional base: `b7af69ae318cd175b26f57d1fca3fddceafa8a49` (Day07 preparation budget repair).
- UI donor: `e7a999e22b1342a23755899bf87c8e887a32e249` (classic build 7, latest log follow fix).
- Both source heads were verified against their Sites repositories before editing on 2026-10-08.
- Normal source, original TEST build and Day07 build remain available. Explicit `--unified` selects this variant.
- Existing public outer Sites audience is unchanged. The gallery/editorial routes now require the same six verified TEST accounts; these are not anonymous public internet pages.
- MAIN, Ivan, classic Site, new 3D prototype, GitHub and Lovable are unchanged.
- Project-wide `00_READ_FIRST.md` / `02_CURRENT_STATE.md` were unavailable in this checkout. This report is a bounded integration review, not complete project acceptance.

## What is integrated

- Donor's actual classic menu, cancel-safe navigation, keyboard focus, cookie disclosure/acceptance transitions.
- Original Onest/Unbounded subset fonts and preload. Nonblocking motion initialization and lazy optional backend import.
- New root composes the existing loading, cookie, motion and persistent questionnaire providers. No MAIN admin imports, media loader or new server functions.
- Motion is local-only in Unified TEST. Shared defaults cannot be fetched or published from this shell.
- Real Day07 operational routes retain their source components and handlers: login/logout, questionnaires/drafts, membership, MFA, incidents/intake review, passes/scanner/tickets and staged timed QA.
- `/admin/diagnostics` contains the donor's original overview, bounded browser-only journal, status scenes 200/401/403/404/429/500/503 and latest append-only auto-follow.
- The initial candidate had a reproducible SPA-only presentation-gate bypass. It was rejected before publication. The corrected root revalidates every non-login browser transition through the existing protected `getQuestionnaireAvailability` GET, with strict `enabled === true` and fail-closed redirect. This handler is configuration-only; its outer guard verifies the same six accounts. Real TanStack/React DOM regressions cover the former login → admin → home bypass, sibling navigation and history restoration after session loss.
- Diagnostics document access requires exact ADMIN_TEST. SPA loader independently calls the existing read-only `getAdminMfaState`; only a boolean is projected. No enrollment or challenge occurs on mount.
- Telemetry accepts fixed event kinds/areas only, at most 200 in-memory entries. No URLs, query/hash, request bodies, exception strings, cookies, QR, forms, persistence, interception or remote log sink. Examples remain explicitly separate from observed browser events.
- Public-looking editorial pages use the embedded approved source content/artwork. No production content/settings backend is connected.

## Preserved boundaries

- Six TEST Auth UUIDs; no grants, accounts, roles, security setting or audience changes.
- Exactly the same 18 allowed server functions.
- Unified assets use their exact emitted-file inventory and direct ASSETS dispatch, never application SSR. Missing binding, rejected/HTML/redirect/wrong-type responses fail closed. Static responses cannot set cookies; HEAD bodies are empty. Independent review caught the initial fallback gap before publication and it was corrected with dedicated regressions.
- Existing Origin/CSRF, body limits, serializer validation, cookie refresh/logout ordering, private/no-store/no-referrer, MFA, per-action role checks, closed-registration and disabled-delivery restrictions.
- No SQL, migrations, D1/R2, Supabase function/RLS changes, activation window, operational QR POST, payment, invitation or external provider activation.
- Fresh independent read-only DB evidence at 2026-10-08 19:52:30 UTC confirms Day07 is closed after its sixth live window: both flags false, every scoped command ACL closed, 48 scoped roles and 3 admissions revoked, 4 events archived, scoped checkins/receipts both zero. This implementation does not reopen it.
- Timed QA preparation, final fresh MFA, one-arm dispatch and ten-POST bound remain unchanged. A genuine successful two-browser check-in race is still NOT VERIFIED.
- Six ticket templates / 24 palettes and the base QR/ticket/admission implementation are preserved; donor QR design changes were intentionally not copied.

## Reproduction

The unchanged existing dependencies/lockfile are used. Build/verify from the repository root:

    node scripts/build-day07-stand.mjs --unified
    node scripts/prepare-day07-output.mjs --unified
    node node_modules/@typescript/native-preview/bin/tsgo.js --noEmit
    node node_modules/@typescript/native-preview/bin/tsgo.js --noEmit -p .sites-runtime/day07-source/.sites-runtime/test-app/tsconfig.json
    node --test --test-force-exit unified-stand/tests/compiled-integration.mjs
    node --test unified-stand/tests/guard.test.mjs
    node --test --test-force-exit scripts/verify-day07-inherited.mjs
    node scripts/verify-day07-transport.mjs

Run Day07 timed-qa, timed-qa-preparation and timed-qa-ui as their documented direct `node` commands, not inside a wrapping node --test run: that altered lifecycle cancels pending simulated promises. The direct runs pass, including against the unchanged base. DOM tests use the existing external happy-dom path; no dependency changes were made.

## Own verification before independent review

- PASS: build, source and generated-route typechecks, compiled SSR integration, exact function inventory and guard identity/method/path matrix.
- PASS: inherited TEST/MFA/session/login/transport checks, Day07 functional regressions, timed QA scheduler/preparation/DOM regressions, classic UI/telemetry/follow unit and DOM tests.
- PASS: offline PGlite 44 groups. This is one local connection and does not prove real PostgreSQL race or genuine Auth.
- PASS: font subset integrity and HarfBuzz shaping (system Python has the required Brotli decoder).
- PASS: targeted ESLint (0 errors, 4 warnings). Full repository source ESLint has the same 790 baseline errors before and after the integration; no blanket cleanup or assertion weakening was performed. Unified has two extra donor fast-refresh warnings.
- NOT VERIFIED: actual Chromium layout/follow regression in this executor (browser process fails at sandbox socket creation). Cloud Chrome cannot reach the local loopback fixture (`ERR_CONNECTION_REFUSED`). Post-publication visual QA must use the actual Site URL.
- NOT VERIFIED: physical mobile/Safari, real GPU/frame pacing, physical camera, live QR/check-in race, external delivery/payment.
- Formal controller acceptance is absent. Independent security/integration verdict and owner-authorized TEST publication are separate steps.

## Artifact rules

Deploy only `dist` through the output-only TEST packaging helper. No root SQL/drizzle/migrations in deployment. Source archive is a separate manual handoff, split below 15 MiB per attachment if needed. Do not deploy the source archive.
