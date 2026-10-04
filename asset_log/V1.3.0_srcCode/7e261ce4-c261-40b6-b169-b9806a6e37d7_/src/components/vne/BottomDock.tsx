export function BottomDock() {
  return (
    <div
      data-dock
      className="pointer-events-none absolute inset-x-0 bottom-[calc(max(4.5rem,env(safe-area-inset-bottom))+2.5rem)] z-20 mx-auto flex w-[70%] max-w-xl justify-around"
      aria-hidden="true"
    >
      {["01", "02", "03"].map((label) => (
        <span
          key={label}
          className="grid h-8 w-14 place-items-center border-x border-t border-border/60 bg-surface/55 font-body text-xs text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
