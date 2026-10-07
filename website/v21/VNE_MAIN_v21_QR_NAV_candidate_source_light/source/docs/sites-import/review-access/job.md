# VNE V06 — review access and admin workspace

Job: VNE-2026-10-06-review-access / requirements v1 / requested by owner in this turn.
Base: 9895c64227fad2c3a314c6acec835719b5902d97, /workspace/sites/vne-v06.
Sites project: appgprj_6aba5314956c8191b34f93f81538f7bf; public platform audience, application login required.

Goal: named test reviewer can inspect site/admin; owner manages accounts/permissions and audit; 16 QR styles are presented in a compact four-column gallery; unavailable sections are muted and explain their status.

Scope: Sites stand authentication, D1 accounts/staff_assignments/sessions/audit/content drafts, admin components, catalog presentation, migration, tests, publishing this existing Site. This task does not grant event admission or Supabase staff rights.
Preserve: existing admin login, fixed Site identity/audience, approved artwork/fonts, QR generation/validation, Supabase staff/MFA guards, disabled external delivery and ticket issuing until their services are configured.
Interpretation: display name Тестревью, login testrev1, generated password; reviewer gets read access, no data mutation. Four columns on desktop, responsive on mobile.
Risk: elevated (authentication and role enforcement). Verify against isolated SQLite with synthetic accounts and network disabled before deployment. No shared Supabase writes, payments, message sending, QR algorithm replacement, history rewriting, or new paid services.
Authorization: current owner request plus Sites workflow for publishing requested edits. Budget: UNKNOWN; no new paid operations. No automatic controller or unattended run is claimed. Single interactive writer uses isolated Site checkout.

| Criterion | Check |
|---|---|
| Reviewer login, persistent named account and session audit | isolated integration + hosted metadata/rows if reachable |
| Server rejects reviewer writes and revoked sessions | integration permissions/CSRF/revocation matrix |
| Account create, permission update, block, password reset | integration with synthetic users |
| Menu mute/dialog; direct unavailable route notice | build/SSR; browser if supported |
| QR 4-column grid, image beside name, card preview links | source/SSR checks; browser if supported |
| Useful overview, content drafts, audit operations | integration CRUD/permissions, typecheck/build |

State: IMPLEMENTED / CHECKS PASS / RELEASE PENDING. Browser QA unavailable: control-browser skill is absent from available executor skills; per Sites managed preview rules no replacement browser path is started. Typecheck, tests and SSR remain required. Historical Library context from September 24 is treated as historical; current Sites source is authoritative.

## Requirements v2 — owner addition during implementation
Add bottom-of-admin save-all / save-selected settings controls, owner-only global writes; reviewer button «Актуализировать настройки». Keep immediate local preview changes and existing reset/import/export tools. Publish 66 settings in 6 disjoint groups via durable D1 baseline with optimistic versioning, shared across users and subsequent previews. Update implementation before publication.
