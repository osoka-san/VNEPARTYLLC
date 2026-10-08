export const DRAFT_SIGNOUT_EVENT = "vne:questionnaire-signout";
/** Clears this tab and other tabs without broadcasting answers, owner IDs or tokens. */
export function clearDraftForSignout() {
  window.dispatchEvent(new Event(DRAFT_SIGNOUT_EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(DRAFT_SIGNOUT_EVENT);
    channel.postMessage("clear");
    channel.close();
  }
}
