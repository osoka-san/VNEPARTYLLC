/** Public campaign codes never identify a person and never grant admission. */
const destinations: Readonly<Record<string, string>> = Object.freeze({ vne: "/" });
export function publicInvitationDestination(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(destinations, code)
    ? (destinations[code] ?? null)
    : null;
}
/** A permanent membership card is distinct from an event ticket; no active implementation. */
export type PermanentMemberCardContract = {
  kind: "member-card";
  grantsAdmission: false;
  publicIdentity: false;
  enabled: false;
};
export const PERMANENT_MEMBER_CARD: PermanentMemberCardContract = Object.freeze({
  kind: "member-card",
  grantsAdmission: false,
  publicIdentity: false,
  enabled: false,
});
