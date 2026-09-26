# VNE Portal — Guidelines

## Components

The design system exports these components — import them from `@ws-562fcc98dff14865c049/7e261ce4-c261-40b6-b169-b9806a6e37d7` and compose them before building anything from scratch:

`BottomDock`, `Button`, `DemoDialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`, `Dialog`, `DockOccluder`, `InvitationDialog`, `PortalLinks`, `PortalLoadingFallback`, `PortalScene`, `QualityController`, `SiteHeader`, `StaticFallback`, `Wordmark`

Per-component details (import stanzas, props, variants, examples) live in `.lovable/rules/libraries/{slug}/components.md` — on disk, not auto-loaded. Read that file or the component source when the name alone isn't enough.

## Theme Files

The design system's theme is delivered through the following files. The author's original source files carry the full wiring the design system needs — variable declarations, framework-specific directives, provider objects, etc. — and are the canonical import target.

- `@ws-562fcc98dff14865c049/7e261ce4-c261-40b6-b169-b9806a6e37d7/styles.css` (source — preferred import)
- `@ws-562fcc98dff14865c049/7e261ce4-c261-40b6-b169-b9806a6e37d7/dist/tokens.css` (auto-generated flat list of CSS custom properties — a raw-values fallback only; does NOT carry framework-specific wiring that the source files above provide)

