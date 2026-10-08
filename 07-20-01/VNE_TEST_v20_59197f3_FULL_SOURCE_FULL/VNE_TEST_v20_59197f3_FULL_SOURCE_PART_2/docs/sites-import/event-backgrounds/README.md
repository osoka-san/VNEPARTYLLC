# VNE V06 — event backgrounds and pass palettes

Owner requests, 2026-10-06: adapt the linked Uiverse digital rain separately for every event page; expose per-event motion/color controls in the existing admin motion section. Follow-up: fit every QR template to the hanging pass and harmonize with all card types/modes.

Base: Sites project `appgprj_6aba5314956c8191b34f93f81538f7bf`, source `cf927072e07ed349424d98eee97db3118bc12634`, version 11. Existing public platform audience and application login retained. Current source and earlier Sites import/review-access reports were read; no change to the GitHub/Lovable history, membership, ticket issuance, accounts or payment/delivery services.

## Delivered

- Two current event pages get independent deterministic digital rain configurations: mint/down/katakana for `light-study-01`; amber/up/geometric characters for `threshold-study-02`. Decorative CSS layers preserve the event content and original artwork. No canvas, external request or random hydration output. Hidden/offscreen animation pauses; system and manual reduced motion use static composition; mobile uses fewer streams.
- Motion admin has an event picker and live preview with enabled/animated controls, three colors, speed, density, glyph size, visibility, glow, direction and character set. Each event can reset independently.
- Motion schema 7 adds the nested event-background map. Older persisted settings acquire defaults; partial imports keep other events/fields. Existing immediate changes, reset, import/export, owner save-all/save-selected and reviewer refresh remain. New `Фоны событий` group joins the six existing groups; existing D1 JSON storage requires no migration.
- All 16 QR shapes now have four automatic presentation palettes: GENERAL porcelain/terracotta, VIP graphite/champagne, SECURITY forest/sage, ARTIST silver/indigo. These are a rendering option, not a change to stored patterns, payloads or authority. Original standalone QR SVGs remain byte-identical.
- Catalog shows four type selectors, 64 prebuilt WebP previews, matching title thumbnails and palette-independent shape descriptions. Type selection survives the catalog → pass → editor round trip. All thumbnails total 1,047,792 bytes, use lazy/async loading and need no runtime QR workers.
- QR frame enlarged from 190 to 204 px within the 360×570 card, with tighter surrounding spacing, matching paper/ink/border, square aspect and intact four-module quiet zone. Card, demo, issuance preview and enlarged scan view share the same palette. Verified artwork has a bounded memory cache; the hidden scan dialog no longer generates a second QR. Artistic QR is decoded at 420/280/144 px before use; a conventional QR in the same palette remains the fallback.
- Reference CSS attribution and MIT license are retained at `public/licenses/uiverse-matrix.txt`.

## Verification

Own isolated runs, Node 24.19.0, synthetic QR payloads and SQLite accounts, no external backend/network:

| Check | Result |
| --- | --- |
| `node tests/preview-defaults.test.mjs` | PASS: 67 fields/7 groups; old settings, nested import/export, preset/off behavior, per-event isolation, shared persistence, owner/reviewer, CSRF, concurrent saves |
| `node tests/qr-studio/pass-adaptation.test.mjs --write-assets` | PASS: 16 templates × 4 palettes × 2 payloads × 4 sizes = 512 exact-byte jsQR decodes; matrix preservation, deterministic output, four-module quiet zones, unchanged standalone SVGs |
| Additional smallest-card check | PASS: all 64 template/type pairs with synthetic ticket payload decode at 144 px |
| `node tests/qr-studio/worker.test.mjs` | PASS: 5 cases through the actual bundled worker message handler, including pass palette and invalid type |
| `tests/qr-studio/catalog-preview.test.ts` via esbuild + Node | PASS: 64 preview assets, type URL validation, local draft round trip, old imports and payload bounds |
| TypeScript `tsgo --noEmit` | PASS |
| Original `npm run build` and `node scripts/prepare-sites-output.mjs` | PASS; existing TanStack/Nitro, package.json and bun.lock retained. Bun is unavailable; npm runs the same original build script without dependency changes. |
| `node scripts/verify-sites-build.mjs` | PASS: 30 owner SSR routes plus reviewer/API guards, both event pages, motion controls, four pass types and VIP catalog; packaged Worker with synthetic D1, outbound network disabled |
| QR palette raster contact sheet | Inspected: four representative styles in all four palettes; this is artwork validation, not a browser screenshot |
| Browser interaction, responsive screenshots, animation smoothness, physical scans | NOT VERIFIED: mandatory managed-preview control-browser skill is unavailable; no alternative browser/server was started |

Evidence: `evidence/pass-qr-validation.json`, `evidence/mobile-qr-validation.json`. Palette ink contrast spans 10.17–12.74:1; accent contrast 5.69–9.37:1. These numerical checks and software decoders do not prove camera scanning on physical devices.

Publishing: this report belongs to the source/archive prepared by the Sites helper. Native saved-version and terminal deployment results identify the final published version. No new secrets, schema migration or shared backend changes are required.
