# Day07 QA controls: isolated verification

These fixtures never contact the live TEST site, Supabase, Auth or admission API. No role window is opened. They import the actual React component, controller and dedicated CSS; the server-function imports are replaced during the test build. Existing server roles, forms, permission checks and QR contracts remain authoritative.

## One-arm operator flow

1. Before any live window, select Scanner A or B and optionally click «Проверить текущую сессию». This is one read-only MFA GET, works without a run UUID or window, and makes no QR POST. READY describes the current identity/MFA state only.
2. Enter the agreed run UUID, window start and rehearsal UTC 30–120 seconds ahead. Click «Запланировать репетицию» once. The controller freezes this plan and waits. Near the target it performs its own fresh MFA GET and exactly three time probes, then schedules one rehearsal POST. No near-second operator click is required.
3. Give the safe report to the coordinator. Only externally reconciled rehearsal evidence can unlock the second stage. The coordinator must prepare the fresh synthetic pass separately.
4. Enter this profile's distinct operation UUID and a common final UTC 30–120 seconds ahead. Click «Запланировать один проход» once. Race preflight starts 22 seconds before the target with an MFA GET and three time probes. A guarded wait then reaches calibrated target minus 10 seconds, obtains a new same-account/AAL2/TOTP MFA GET, verifies the pass and arms one checkin. The 22-second lead derives from existing request, clock quality and scheduling bounds; identity/clock freshness and the 10-second arm limit are unchanged. A readiness, timing or transport failure stops the stage; there is no automatic resend or re-arm.
5. After external DB reconciliation, only the accepted profile can explicitly replay its cached command. This performs one fresh MFA GET and one identical POST, with no time probes. The complete successful per-profile path uses 10 QR POSTs including the single winner replay.

Keep both profiles visible. Mere focus/blur does not cancel two visible windows; hidden, freeze, offline, navigation, signout and unmount invalidate pending work. Stop before the first POST permits a separate explicit reset. Consumed POST budget cannot be reset. A dispatched command with no confirmed result remains uncertain and requires external reconciliation.

The countdown is shown during waiting/armed phases. During asynchronous preparation the current stage is shown instead of a stale countdown. Sanitized diagnostics show each sample's RTT, wall-clock delta, quality and safe error code, plus numeric calibration/final MFA/ready durations. A new plan clears current receipt/dispatch while retaining the original rehearsal receipt, target and dispatch separately. At least two of the fixed three samples must be good. Slow network, clock changes and delayed timers can still stop the stage.

## React DOM tests

Use an existing `happy-dom` install, or install the pinned dependency outside the repository to preserve the app lockfile:

```sh
npm install --prefix /tmp/day07-ui-dom --cache /tmp/day07-ui-npm-cache --no-save --ignore-scripts --package-lock=false happy-dom@20.8.0
VNE_DOM_MODULE=/tmp/day07-ui-dom/node_modules/happy-dom/lib/index.js node tests/day07/timed-qa-ui.mjs
```

The tests mount actual React StrictMode with a deterministic monotonic/wall clock and drive native input/change/click/focus events. A 100-second lead advances without real waiting. The suite covers:

- Inert mount, independent readiness GET before run/window input, safe account/MFA projection and distinct error reasons
- Actor changes and lifecycle/remount fences against stale responses; fresh MFA is never borrowed from preflight
- Exactly one rehearsal arm, immutable disabled inputs, countdown, zero I/O until JIT, three real mocked transport probes and one rehearsal
- Local UUID/canonical UTC/lead validation, Stop/reset, late timers, hidden/signout/unmount, async MFA rejection/timeout and closed server
- One slow plus two good samples, insufficient quality with visible metrics, and no reset of consumed POST budget
- Unknown receipt fields rejected without leaking their contents; safe report allowlist, selectable copy fallback and malformed evidence
- External rehearsal proof gate, one second-stage arm, fresh MFA + three probes + ready verification + one checkin
- Explicit winner replay after stale prior MFA: one fresh GET and the exact cached command, no extra probes, duplicate controls disabled, failure/Stop fences
- Uncertain dispatched rehearsal after Stop, preserved navigation and no credential/enrollment/QR input added

This is DOM emulation, not browser layout or browser acceptance. The scheduler regression suite (`node tests/day07/timed-qa.mjs`) separately exercises clock math and transport/lifecycle bounds. HTTP status projection is tested with the installed TanStack fetch parser in `tests/scanner-mfa/read-transport.test.ts`. None establishes real Auth, roles, PostgreSQL concurrency, real device timing or live admission status.

## Optional actual-browser fixture

```sh
node tests/day07/timed-qa-browser.mjs /tmp/day07-browser-fixture --serve
```

Open the printed localhost URL in a browser that can reach this executor. The rehearsal fixture uses real Tailwind preflight, project fonts and component CSS. CSP disables network connections from JavaScript. The toolbar controls only synthetic transport and lifecycle events. `manifest.json` records source hashes and the base commit. This fixture supports the rehearsal scenarios; the complete second-stage and winner flow is covered by the DOM suite.

When an actual browser is available, check 360, 390, 430, 1440 and 1920 CSS pixels:

1. Full UUID/UTC readability, visible borders, mobile stacking, focus outline and no horizontal page overflow.
2. Empty run/window readiness GET, actor mismatch and hide/show invalidation, all with zero QR POSTs.
3. Use «Make UTC +100 seconds», enter the displayed target and click «Запланировать репетицию». Check the frozen plan, countdown and zero requests until preparation begins about ten seconds before the target.
4. In Pending MFA, wait for preparation, Stop and explicitly reset. Resolving the old mock GET must not make any QR request.
5. In Normal probes, expect three probes and one rehearsal without another click. Hiding after the probes must cancel the final dispatch with three calls and no reset.
6. In Pending rehearsal, wait for the fourth call, Stop and resolve the late reply. The result must stay uncertain with four calls.
7. In MFA refused and Closed backend, expect distinct safe errors and respectively zero and one QR call. Only the zero-POST case can reset.
8. Select/copy the safe report and inspect that no raw credentials or tokens appear.

A fixture build or DOM pass does not mean these browser checks ran. Browser acceptance remains NOT VERIFIED when no browser can reach the fixture. Live backend/concurrency acceptance remains out of scope.

## Asynchronous race regression

`node tests/day07/timed-qa-preparation.mjs` drives actual pending promises from a monotonic timer queue, including slow/instant transport, both original observed RTT cases, response deadlines, final same-account MFA, lifecycle cancellation, stale promises, clock steps/skew, immutable plans and exact tenth-POST replay. These synthetic checks are not live PostgreSQL concurrency evidence.
