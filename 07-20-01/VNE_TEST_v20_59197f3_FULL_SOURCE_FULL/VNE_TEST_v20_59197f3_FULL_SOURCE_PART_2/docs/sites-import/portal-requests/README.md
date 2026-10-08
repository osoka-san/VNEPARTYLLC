# VNE portal and request queues — 2026-10-06

Base: Sites version 15, `4cb1db475151cbc424a5c1f78bab5455ce3b8e50`.

## Delivered behavior

- Every admin page now has a prominent `На сайт` link in the shared header and a persistent mint action in the bottom dock. Both navigate home without ending the signed-in session.
- Membership and event applications have separate Sites test queues. They support search, status/event filters, pagination, manual creation, detail cards, comments, versioned decisions, and an ordered decision history. The membership form saves into the membership queue, retaining an event selection only as interest.
- A prepared empty queue is shown until test data is entered; no invented guests or live applications are seeded. The UI explicitly asks for fictional data. Approval here does not create membership, an account, invitation, ticket, or message.
- New D1 tables store test requests and their history. Each state change, history record, and general audit entry is committed in one batch. CSRF/origin validation, fresh server session/permission checks, legal transitions, expected-version checks, idempotency keys, input limits, and a 30-create/hour/actor cap are enforced on the server.
- Only the owner and accounts explicitly granted `requests.manage` may moderate or manually create queue records. `requests.read` allows viewing. Migration 0003 adds read access to the existing `testrev1` review identity and owner access; other custom permissions are preserved. An authenticated site visitor may submit their own test membership form without admin mutation rights.
- The test request API is disabled when a Supabase URL is configured. Configured Supabase staff/MFA checks, private membership/event RPC flows, invitation rules and the separate pass service remain authoritative and unchanged. No Supabase migration or live delivery operation was performed.

## Portal and design reference

Reference: https://toormix.com/en/ . Its public HTML and CSS were inspected for the large brand mark, modular composition and staged reveal vocabulary. The actual browser animation was not observed; this is a VNE-specific adaptation, not a visual replication claim.

- The three WebGL shapes now use the exact full `bodyPath`, anchor and final placement from the approved `10C11-6` portal manifest. Original brand files and supplied artwork are unchanged.
- Removed the extra presentation rotation because the supplied silhouettes already contain perspective. Reduced extrusion/bevel and fog, and adjusted material roughness/clearcoat. The original left facet receives vertex shading.
- A reversible scroll sequence reveals the outer contour, middle depth and inner presence in order, then holds the assembled sign. Short restrained rotations settle into the approved geometry; a single progress-driven light accent accompanies each settling phase. There is no new idle animation loop.
- Three small brand-color progress marks and stage labels replace the numeric assembly counter. Existing one-canvas rendering, pause/offscreen handling, reduced-motion/static fallback and image-decode/portal-ready loading sequence remain in place.

## Verification

- TypeScript (`tsgo --noEmit`): PASS.
- `node --test tests/site-requests.test.mjs`: 6/6 PASS. Covers fresh authorization, CSRF, configured-backend isolation, submissions/idempotency, queue separation, moderation/versioning, filtering/pagination/rate limits, atomic audit rollback, and permissions migration.
- `tests/sites-admin-gate.test.mjs`: 5/5 PASS in the initial combined run. The new migration test initially had an incomplete account fixture; after adding its missing parent account rows, all six new queue tests passed without disabling foreign keys.
- `node tests/portal-assembly.test.mjs`: PASS. Exact master paths/anchors/final placement, 6,006 finite reversible poses, continuous bounded trajectories, final hold, light envelope, and 30/60/120 Hz-independent damping.
- `npm run build` and `node scripts/prepare-sites-output.mjs`: PASS. Existing chunk-size warning remains; no dependency or lockfile changes.
- `node scripts/verify-sites-build.mjs`: PASS. Packaged Worker SSR for 31 owner routes and 6 reviewer routes; built request API create/read/reviewer-write denial; existing gate, defaults, loading, navigation, cookies and QR checks. Uses isolated SQLite and synthetic credentials; network is disabled. Route results are in `ssr-check.json`.
- `git diff --check`: PASS.

## Verification limit

The managed Sites environment does not expose the required `$control-browser` capability. No preview server or substitute browser was started. Actual rendered layout at mobile/desktop widths, focus behavior, touch interaction, WebGL shading and perceived animation quality remain unverified in a browser. Source, mathematical, build and SSR checks are not visual acceptance.
