export function DockOccluder() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] bg-dock shadow-[0_-12px_34px_color-mix(in_oklab,var(--mint)_6%,transparent)]">
      <div className="h-2 border-y border-border/60 bg-surface" />
      <div className="mx-auto mt-3 h-px w-[70%] bg-border/50" />
    </div>
  );
}
