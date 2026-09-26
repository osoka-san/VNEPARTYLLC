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
- Gallery of Light addon v4 keeps source PNGs in the official asset log and serves no-upscale AVIF/WebP derivatives from `public/media`; this preserves traceability and responsive delivery.
- Event applications (post-login) are separate from membership requests; guests and staff change them only via private SECURITY DEFINER RPCs with version checks, logging to application_events, audit_log and outbox(held) — keeps transitions, audit and concurrency in one transaction.
- External email/Telegram delivery is disabled unless VNE_DELIVERY_MODE=live — the shared Cloud DB is not an isolated test environment.
