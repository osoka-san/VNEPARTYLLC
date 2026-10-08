# R2 account-owned membership questionnaire

Status: isolated local implementation and reviewed SQL proposals. Nothing in this
folder has been applied to a live database or published site.

## Approved product order

The general acquaintance questionnaire is saved with the same membership request,
owned by the signed-in account. Its status appears in the cabinet. Event admission
remains a separate decision. There is no second questionnaire request lifecycle.
Telegram-first account creation is the intended separate Auth rollout; this slice
neither implements it nor reactivates the old invitation-based account creation.
The older invitation-only sentence in AGENTS.md is superseded narrowly by this
approved product order, not by an automatic permission to change Auth.

## Base and workspace

Base: approved v20 source copy, 901 files, source-manifest SHA-256
`e6420bcc5063163a23db0460ee35291d1039c972fedd620eef7ce1fc05cd19b5`.
No Git metadata is present; this is not a commit/PR/deployed version. Base source,
package.json and bun.lock are preserved. Bun 1.4.2 and existing locked dependencies
are reused; no install or lifecycle script was run for this slice.

SQL targets the separately verified closed TEST baseline plus ID extension.
The original migration directory is unchanged; proposals are deliberately outside
it and must not be mistaken for automatically applicable Supabase migrations.

## Implemented locally

- Strict canonical v3 questionnaire parser: all seven text questions, source of
  every answer, three integer ratings with scale labels, age, version and trusted
  labels. Current limits remain 1–3 answers including at most one custom, five
  words and 120 UTF-16 units each, ratings/age 1–100, existing details cap 4,000.
- Server adapter: explicit consent, verified Supabase account, full atomic command,
  same request ID/correlation on replay, projected own receipts. No user-supplied
  owner, role, status, correlation or membership ID is trusted.
- Request-scoped transport targets two exact proposed wrappers; no service-role
  client, private schema access or direct table DML is used by the application.
- Server functions: same-origin POST, private/no-store responses, cookie refresh
  propagation, 32 KiB decoded-and-reserialized payload cap, safe error replies.
  This cap does not claim to limit raw HTTP body parsing/allocation.
- `/apply`: D1 preview remains its separate existing flow when Supabase is absent.
  Configured Supabase never falls through to D1 or the lossy legacy submission.
  The new transport requires an explicit default-off server flag. Failure preserves
  the form; success is shown only after a valid owned persistence receipt.
- Cabinet: general membership status is independently loaded. A successful intake
  read does not unlock event applications, commerce, staff access or tickets when
  the legacy admission gate is pending/unavailable.
- SQL closed proposal: existing membership_requests extended by four nullable
  fields, immutable originals, ownership/session guards, scoped idempotency,
  metadata-only audit and protected legacy invitation fields. No new table.
- Separate SQL access proposal: only the two exact public wrappers and narrowly
  scoped authenticated EXECUTE. It is a separate access expansion requiring approval.

## Explicitly not done

No live DDL, role grants, policies, Auth hook, account creation, persistent credential,
real guest data, message delivery, GitHub upload/push, deployment or site flag change.
No automatic D1 migration or matching accounts by email/Telegram username. No event
application, invitation, ticket, payment or admission is created by this intake.

## Test scope and remaining gates

Synthetic unit/handler tests and offline PGlite exercise full structured persistence,
owner separation, effective privileges, invalid inputs, replay/conflict, immutable
originals, forced-audit rollback and legacy invite rollback. PGlite's identity stub
is not GoTrue/JWT verification; queued retries are not multi-session race proof.
A real PostgreSQL multi-connection concurrency check and actual isolated API/Auth
end-to-end verification remain necessary before operational activation.

Local browser preview URLs were blocked by the supported cloud browser with
ERR_BLOCKED_BY_CLIENT. No alternate browser/file/headless route was used to bypass
that restriction. The labelled schematic PNG is design-only; actual responsive
layout, browser interaction and published-state verification remain NOT VERIFIED.

Consent is still `draft-2026-09`. Existing intake age 1–100 is preserved, not
reinterpreted as event 18+ self-attestation. Real data collection, especially for
minors, requires the separate age/consent/purpose/retention decisions. Test-only
labels are retained. This candidate is not ready for real guest collection.

## References checked

Supabase official functions guidance:
https://supabase.com/docs/guides/database/functions

The current changelog was checked; the unrelated server-adapter deprecation does
not alter this request-scoped supabase-js/SSR contract.
