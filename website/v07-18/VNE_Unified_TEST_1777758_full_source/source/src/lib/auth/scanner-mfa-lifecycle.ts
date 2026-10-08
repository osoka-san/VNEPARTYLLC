import { MfaPrivacyFence, subscribeMfaPrivacy } from "./admin-mfa-lifecycle.ts";
export { MfaPrivacyFence };
/** Scanner setup also fences BFCache pagehide replies without changing the live admin flow. */
export function subscribeScannerMfaPrivacy(...args: Parameters<typeof subscribeMfaPrivacy>) {
  const [fence, clear, win] = args;
  const unsubscribe = subscribeMfaPrivacy(...args);
  const pagehide = () => {
    fence.invalidate();
    clear(false);
  };
  win.addEventListener("pagehide", pagehide);
  return () => {
    win.removeEventListener("pagehide", pagehide);
    unsubscribe();
  };
}
