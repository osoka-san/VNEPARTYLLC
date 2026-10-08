/** Explicit JSON envelope for no-argument TEST actions; never accepts user fields. */
export function emptyActionInput(input: unknown): Record<string, never> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)
    throw new Error("Invalid empty action input");
  return {};
}
