# V650 → existing Sites, 2026-10-05

Owner instruction: use stable GitHub V650 as the base and port loading fixes and useful Sites adjustments. Sites is the temporary implementation environment. This replaces the earlier proposal to use the old Sites source as the base.

## Source and scope

- GitHub: `osoka-san/VNEPARTYLLC`, branch `v130_source_code+asset_lib_for0203`, commit `71a928516eb28800692b53d3a7bd26d936b86a80`.
- Application: `website/v6/7e261ce4-v650_qr_261-40b6-b169-b9806a6e37d7`.
- Verified Git blob content hashes for all 715 imported files; `.env` was excluded.
- Existing Sites project: `appgprj_6aba5314956c8191b34f93f81538f7bf`. Prior source: `19a84349bb4c022a1a91bb50f14182e1edcacd17` (version 3).
- The final checkout retains 707 V650 files byte-for-byte, including package.json, bun.lock, the 14 approved artwork originals and 88 AVIF/WebP derivatives. Eight V650 files have the intentional adjustments below.
- Stale files not present in V650 were removed from the current tree; prior history remains in Sites Git. The source manifest lists them. Existing Sites hosting configuration and import history were retained.
- No GitHub/Lovable source write, backend configuration, migration, real pass issuance, payment or external delivery was performed.

## Changes

1. Imported the V650 QR module, `/pass`, `/admin/tickets`, associated contracts, dependencies and route definitions.
2. Preserved Sites MotionProvider resilience: missing backend configuration, synchronous client failures, inaccessible storage and failed/stale requests do not prevent mounting or overwrite personal settings.
3. Preserved the password gate and Nitro-to-Sites output adapter. The existing Site audience and runtime variables remain unchanged; the Site retains its existing login.
4. Ticket administration now rechecks MFA, current staff access and the existing `staff_can({_cap: "events_manage"})` capability for each action. Missing/failed capability denies issue/get/revoke before a ticket-service request. No migration is required.
5. Long event titles, names, transfer details and ticket IDs have bounded card summaries. The complete values remain selectable in a native disclosure outside the card. Back line-height is explicit; QR dimensions remain unchanged.
6. Repaired the admin animation preview image to use the existing final-v6 mobile artwork.

## Verification

Own runs, Bun 1.3.3 and Node, 2026-10-05 UTC. Commands, exit codes and timestamps: `evidence/results.json`. Code/asset input digest: `evidence/inputs-sha256.txt`.

| Check | Result |
| --- | --- |
| Frozen V650 dependency install | PASS; lockfile unchanged |
| TypeScript check | PASS |
| Targeted Bun tests | 91 PASS, 0 FAIL (includes 27 QR contract/permission cases and full long-value content for all four card types) |
| Sites loading + password gate | 10 PASS, 0 FAIL |
| Lint on changed ticket code/tests | PASS |
| Original application build + Sites adapter | PASS |
| Built Worker SSR + synthetic login | 10 routes returned 200, no SSR error, private no-store; outbound network disabled |
| Literal source media paths | All referenced files exist |
| Permission review | Independent read-only review: no regression found |
| Layout review | Independent CSS calculation: bounded back content fits 570px at line-height 1.5; not a browser result |

The SSR smoke checks `/`, `/events`, `/about`, `/rules`, `/faq`, `/contact`, `/admin`, `/admin/tickets`, `/pass`, `/scan`. Route success does not prove client interactions, camera scanning, WebGL, or issuance. `/admin/tickets` shows synthetic design preview with issuance unavailable when the backend is unconfigured.

## Known baseline discrepancy and limits

- `tests/motion-settings.test.ts`: 3 PASS / 1 FAIL, identically reproduced against unchanged GitHub V650 and the updated checkout. The test expects `scrambleCharset=auto`; the embedded V650 default is `symbols`. No assertion, default or visual baseline was weakened/changed. Logs are retained separately.
- Browser QA is NOT VERIFIED: the mandatory Sites managed-preview `control-browser` skill is unavailable in this session. The available skill catalog and plugin search did not locate that capability. Do not substitute these SSR/tests for desktop/mobile screenshots, interaction checks, WebGL/reduced-motion checks, Safari or physical QR scanning.
- The original QR finishing-patch archive could not be downloaded (HTTP 502); the small layout correction is based on reviewed V650 code, not claimed to reproduce that archive.
- No live backend is connected. The scanner remains its existing future-feature screen; no end-to-end issuance or admission claim is made.

## Handoff

Publish this source/archive as a new version of the same Sites project. Read the actual saved version and terminal deployment status for release identifiers; do not treat an intended publish as completed.

Next: browser QA at 360/390/430 and 1440/1920 px, both card sides with long synthetic values, keyboard/focus, QR enlargement, reduced motion and WebGL failure. Then plan isolated backend integration as a separate authorized task. Keep real issuance, payments and external delivery disabled until that stage is explicitly implemented and verified.
