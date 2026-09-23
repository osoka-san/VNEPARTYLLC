export function PortalLoadingFallback() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 bg-background"
      aria-hidden="true"
      data-portal-loading
    />
  );
}
