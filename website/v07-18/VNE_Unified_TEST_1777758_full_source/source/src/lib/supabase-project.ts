/** Pure project selection shared by Auth and server-only service-role clients. */
export type SupabaseProject =
  | { enabled: true; mode: "explicit" | "cloud"; url: string }
  | { enabled: false; reason: "not_configured" | "invalid_url" | "project_mismatch" };

export function resolveSupabaseProject(env: Record<string, string | undefined>): SupabaseProject {
  const explicit = env["VNE_SUPABASE_URL"]?.trim();
  const cloud = env["SUPABASE_URL"]?.trim();
  if (!explicit && !cloud) return { enabled: false, reason: "not_configured" };

  try {
    // Auth has always used the origin. Compare and return that same normalized
    // endpoint for privileged requests too (case, default port, trailing slash).
    const explicitUrl = explicit ? new URL(explicit) : undefined;
    const cloudUrl = cloud ? new URL(cloud) : undefined;
    // Validate the original scheme first: blob:https://... has an HTTPS
    // origin but is not an HTTP endpoint and must never become one here.
    if (
      [explicitUrl, cloudUrl].some(
        (url) => url && url.protocol !== "https:" && url.protocol !== "http:",
      )
    )
      return { enabled: false, reason: "invalid_url" };
    const explicitOrigin = explicitUrl?.origin;
    const cloudOrigin = cloudUrl?.origin;
    if (explicitOrigin === "null" || cloudOrigin === "null")
      return { enabled: false, reason: "invalid_url" };
    if (explicitOrigin && cloudOrigin && explicitOrigin !== cloudOrigin)
      return { enabled: false, reason: "project_mismatch" };
    return {
      enabled: true,
      mode: explicit ? "explicit" : "cloud",
      url: (explicitOrigin ?? cloudOrigin)!,
    };
  } catch {
    return { enabled: false, reason: "invalid_url" };
  }
}
