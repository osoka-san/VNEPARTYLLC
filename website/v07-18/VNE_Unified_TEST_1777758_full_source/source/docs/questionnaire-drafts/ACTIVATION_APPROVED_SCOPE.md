# Final approved TEST scope, 2026-10-07

This document supersedes the earlier review-only packet and the earlier no-purge intermediate state.

The owner confirmed storage and owner-only read/save/finalize; 67 × 24 hours from the last successfully saved change; deletion of the current draft on successful submission; TEST-only publication; and, after a separate explanation, DAILY deletion of already expired drafts. Main v20 remains out of scope.

## Exact final scope

- Storage SQL: `draft_storage_closed_proposal.sql`. One current row per authenticated owner; expired rows stay hidden until cleanup. When an owner actually saves a new draft before cleanup, the expired old row is retained as non-current, never returned by an API. Repeated reads never write or create rows. This is temporary retention between expiry and cleanup, not a history/archive product.
- Access stage: `draft_activation_stage.sql`. The same three approved public RPC wrappers gain authenticated EXECUTE. No table/private-schema, staff/admin, account, credential or other API permission is added. Existing old submit ACL stays briefly for availability.
- Cutover: `draft_activation_cutover.sql`. After successful flag-enabled TEST publication, revoke the old submit wrapper to close its version-check bypass. Record the overlap interval.
- Daily cleanup: `draft_daily_purge.sql`. The official preloaded Supabase pg_cron extension is installed only if absent; any newly available cron schema/table/function permissions are revoked from PUBLIC/anon/authenticated/service_role. A trusted-owner-only purge function deletes at most 1000 expired rows per invocation using the exact composite owner/id key. It never touches final membership requests, event applications, accounts or unexpired drafts. One job `vne-questionnaire-drafts-expiry-daily` runs `0 3 * * *`, 03:00 UTC / 06:00 Moscow. No immediate purge is run by the migration.
- Deletion is permanent through ordinary app recovery. Daily frequency normally means up to 24 hours after logical expiry; failed/skipped/locked runs or more than 1000 due rows create additional delay. Backlog and job status must be checked. Backup retention is not changed.
- Creation replay protection: a fresh read returns a non-secret creation issuance timestamp. The client keeps it unchanged with an uncertain first save. When the row is absent, issuance older than 67 days or in the future is rejected, so an unchanged old create cannot resurrect purged answers. It is not an authorization token; ownership always comes from verified auth.uid/session. A user may deliberately create a new draft with fresh issuance. No permanent identifier tombstones are retained.
- Successful final submission deletes only its own current draft ID/version in the existing R2 transaction. Failed submission leaves it; replay preserves the original membership receipt and correlation.
- Actual TEST slim routes and logout now use the same controller/finalizer; the server-function allowlist adds only getMyQuestionnaireDraft GET and saveMyQuestionnaireDraft POST. Original one-account TEST login restriction, sharing, delivery-disabled setting and main v20 remain unchanged.

## Verified preflight (read only)

Sites TEST project appgprj_6ac605807bf88191b7f2d0b5a717505d runtime revision 4 points to xrocuwlofxhxoxajukne, staging, delivery disabled, questionnaire=test. Current TEST v2 is c0ad4b246f7b5a38887c63f0a06caed986cef5ff. No real questionnaire payload was read.

Initial schema read was cancelled; one exact retry after renewed parent approval succeeded. R2 functions are owned by postgres, with expected empty search_path and SECURITY DEFINER. Draft table did not exist. pg_cron 1.6.4 is available and already listed in shared_preload_libraries, not yet installed; cron.timezone is GMT. Installing the extension is an explicit prerequisite of this job, not a database role expansion for application users.

## Release controls

All four operational SQL files need independent review and exact SHA-256 verification before use. This document alone is not proof they were applied. The final release record must contain migration names, effective ACLs, source commit, saved Site version, deployment, runtime revision and exact cron job ID. If deployment fails, keep the old working path and do not report cutover complete. Never alter the main Site or account allowlist.
