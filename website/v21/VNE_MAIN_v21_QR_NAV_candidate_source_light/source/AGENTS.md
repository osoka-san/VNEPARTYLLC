<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Text Scramble is opt-in through `src/lib/text-scramble.ts`; never infer targets from DOM or `AnimatedText` roles, because actions and statuses share accent styling.
- Registration stays closed: guests submit membership requests, and accounts are created only by server-side invitation after staff approval; roles remain exclusively in `staff_assignments`.
- Homepage threshold and belonging artwork uses dedicated desktop/mobile imported assets so each composition preserves its intended text-safe area.
- Gallery of Light final-v6 keeps all 14 supplied source PNGs in the official asset log and serves only valid supplied no-upscale AVIF/WebP derivatives from `public/media`; this preserves traceability and avoids regenerating owner-approved artwork.
- The home gallery continuation is an opt-in normal-flow runway with two reusable image slots; same-entry history restores portal fallback geometry and one saved runway-relative offset, without clones, another canvas, or scroll hijacking.
- Event applications (post-login) are separate from membership requests; guests and staff change them only via private SECURITY DEFINER RPCs with version checks, logging to application_events, audit_log and outbox(held) — keeps transitions, audit and concurrency in one transaction.
- External email/Telegram delivery is disabled unless VNE_DELIVERY_MODE=live — the shared Cloud DB is not an isolated test environment.
- Motion controls still apply immediately in the current browser. In Sites, each new preview loads the D1 site_preview_defaults baseline; only the owner can publish all or selected settings groups, and reviewers can explicitly refresh it. Supabase fallback in other environments retains its existing staff/MFA checks. System reduced-motion preferences always take precedence.
- The hero LQIP exits only after the selected hero image decodes and portal 01 is visually ready or static; this prevents blank first frames.
- Image overrides from admin live in `site_media` (public read, writes only via staff-checked server fns) and are applied to galleryMedia/editorialMedia in the root loader before render; uploads sit in private bucket `site-media`, served by `/api/public/site-media/*` — public buckets are blocked in this workspace.
- Individual passes (vne-pass-kit) live in src/components/tickets; the site only proxies a fixed allowlist of module paths via server fns with per-action staff/MFA re-check and server-only VNE_PASS_* env — the issuing service stays separate and card type never grants site rights.

- Sites review access is separate from event membership and Supabase staff access. D1 `site_accounts` holds identities, roles/permissions live only in D1 `staff_assignments`; `site_sessions` is checked against account version on every request. Never let the review gate substitute for configured Supabase staff/MFA checks. New content/event records in `site_content_drafts` are preparation only, not public announcements or admission grants.
