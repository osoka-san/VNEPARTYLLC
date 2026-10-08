import { redirect } from "@tanstack/react-router";
import { getQuestionnaireAvailability } from "@/lib/questionnaire.functions";

/** The existing availability GET is protected by Day07's exact-six-account outer guard.
 * Its handler reads configuration only: no membership data, QR calls or new auth endpoint.
 * SSR documents have already passed that same outer guard. A browser navigation must
 * revalidate rather than reusing a document's earlier session or route loader cache.
 */
export async function requireUnifiedSession({ location }: { location: { pathname: string } }) {
  if (typeof window === "undefined" || location.pathname === "/login") return;
  try {
    const availability = await getQuestionnaireAvailability();
    if (availability.enabled === true) return;
  } catch {
    // No response, expired session and denied identity all remain closed.
  }
  throw redirect({ to: "/login", replace: true });
}
