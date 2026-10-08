# VNE navigation and cookie notice — 2026-10-06

Base: Sites version 14, `f3f6b24fedf6f8e4b7cc512deacd549d54de5790`.

Requested reference: https://tux.co/en/work/detail/levis-summer-campaign/
The reference's public page and stylesheet were inspected. This implementation adopts the full-screen saturated menu, large type, hover reactions and the requested partially clipped acceptance word, using VNE neon coral, existing Onest/Unbounded fonts and the original Flow wordmark.

## Delivered behavior

- Shared glass navbar with desktop roll-over links, invitation action, and menu trigger on all viewport sizes.
- Full-screen coral dialog with primary links, home chapters and secondary pages. Radix supplies focus containment, Escape handling and scroll lock. The homepage callback continues to pause its gallery while the menu is open.
- Existing `menuMotion`, duration, easing and stagger settings apply. System and user reduced motion take precedence.
- Dark cookie notice above the utility dock. The large `ОК` is clipped vertically in its resting state, rises and glows on hover/keyboard focus, and accepts with one tap on touch devices.
- Explicit acceptance is persisted in `vne.cookie-notice` for up to 365 days, scoped only to technical storage. It does not enable optional tracking or change sessions, permissions or motion settings. Invalid/old/expired records require another choice. Storage events sync other tabs; storage failures still permit dismissal for the current visit.
- Footer and `/cookies` actions reopen the notice. The `/cookies` placeholder is replaced with technical information matching the current Sites implementation.
- Cookie introduction is copied exactly from the user's earlier `04_DOCUMENTS_DRAFT.md`, section 5 (2026-09-28), Library identity `libfile_bde791c8e2d08191b32e724094ef7512`. The scope sentence and implementation details reflect this implementation, not a claim that the old draft was legally approved. Increment `COOKIE_NOTICE_VERSION` when materially changing its wording or scope.
- The existing motion switch now tolerates unavailable browser storage, so that scenario cannot interrupt the cookie notice or current-view controls.

## Validation

- TypeScript: `node node_modules/@typescript/native-preview/bin/tsgo.js --noEmit` — PASS.
- `node tests/cookie-notice.test.mjs` — PASS: explicit choice, persistence, technical-only scope, version/expiry/invalid data, SSR, unavailable storage, and no changes to unrelated storage keys.
- `npm run build` and `node scripts/prepare-sites-output.mjs` — PASS.
- `node scripts/verify-sites-build.mjs` — PASS; exact route results in `ssr-check.json`. Uses synthetic accounts and an isolated SQLite fixture; network is disabled. Includes current auth boundaries, reviewer paths, public navbar, cookie-page content, and loader regressions.
- `git diff --check` — PASS.
- Font metrics were checked for the longest menu word at 360/390/430/960/1024/1440/1920 widths. The clipped OK was reduced to fit horizontally inside both mobile and desktop button columns.

## Verification limit

Browser QA was unavailable: the managed Sites environment has no `$control-browser` capability. No preview server or substitute browser was started. Actual rendered layouts, keyboard interactions, touch behavior, focus return, cross-tab events and animation smoothness remain unverified in a browser. Code/SSR checks are not a visual acceptance claim.
