/** Observe only the status of the existing MFA GET. Never inspect tokens or response bodies. */
export async function readScannerMfaState(
  read: (options: { fetch: typeof fetch }) => Promise<unknown>,
  transport: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  let denied: "forbidden" | "unconfigured" | "unavailable" | null = null;
  try {
    const result = await read({
      fetch: async (input, init) => {
        const response = await transport(input, init);
        if (!response.ok) {
          denied =
            response.status === 401 || response.status === 403
              ? "forbidden"
              : response.status === 404
                ? "unconfigured"
                : "unavailable";
        }
        return response;
      },
    });
    return denied ? { ok: false, reason: denied } : result;
  } catch {
    return { ok: false, reason: denied ?? "unavailable" };
  }
}
