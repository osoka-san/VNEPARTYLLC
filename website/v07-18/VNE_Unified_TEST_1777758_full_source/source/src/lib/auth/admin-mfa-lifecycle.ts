import { DRAFT_SIGNOUT_EVENT } from "../questionnaire-draft-session.ts";

/** Invalidates asynchronous UI responses; carries no factor, code, identity or secret. */
export class MfaPrivacyFence {
  private generation = 0;
  private signedOut = false;
  ticket() {
    return this.generation;
  }
  next() {
    return this.signedOut ? null : ++this.generation;
  }
  accepts(ticket: number, hidden: boolean) {
    return !this.signedOut && !hidden && ticket === this.generation;
  }
  invalidate(signout = false) {
    this.generation++;
    if (signout) this.signedOut = true;
  }
}
type Channel = Pick<BroadcastChannel, "onmessage" | "close">;
export function subscribeMfaPrivacy(
  fence: MfaPrivacyFence,
  clear: (signout: boolean) => void,
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  doc: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
  channel: Channel | null,
) {
  const signout = () => {
    fence.invalidate(true);
    clear(true);
  };
  const hide = () => {
    if (doc.hidden) {
      fence.invalidate();
      clear(false);
    }
  };
  if (channel) channel.onmessage = signout;
  win.addEventListener(DRAFT_SIGNOUT_EVENT, signout);
  doc.addEventListener("visibilitychange", hide);
  return () => {
    fence.invalidate();
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
    win.removeEventListener(DRAFT_SIGNOUT_EVENT, signout);
    doc.removeEventListener("visibilitychange", hide);
  };
}
