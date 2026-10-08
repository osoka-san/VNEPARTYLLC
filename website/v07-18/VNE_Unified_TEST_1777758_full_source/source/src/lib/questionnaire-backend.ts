/** Never fall through to the legacy membership RPC: it cannot save the questionnaire. */
export function selectQuestionnaireBackend(
  preview: { enabled: boolean; questionnaireVersion?: number },
  supabase: { configured: boolean; enabled: boolean },
): "preview" | "supabase" | "unavailable" {
  if (supabase.configured) {
    return supabase.enabled && !preview.enabled ? "supabase" : "unavailable";
  }
  return preview.enabled && preview.questionnaireVersion === 3 ? "preview" : "unavailable";
}

/** An independently readable intake never unlocks the existing event/commerce UI. */
export function showOwnedIntakeOnly(memberState: string, intakeReadable: boolean): boolean {
  return memberState === "pending" || (memberState === "error" && intakeReadable);
}
