export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src="/brand/wordmark/wordmark-flow-light.svg"
      alt=""
      aria-hidden="true"
      className={compact ? "h-auto w-16 sm:w-20" : "h-auto w-full"}
    />
  );
}
