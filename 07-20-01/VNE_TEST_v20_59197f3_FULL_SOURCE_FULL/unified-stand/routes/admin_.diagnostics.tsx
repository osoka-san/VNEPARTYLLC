import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Observatory } from "@/components/diagnostics/Observatory";
import { StatusScene } from "@/components/diagnostics/StatusScene";
import { getAdminMfaState } from "@/lib/auth/admin-mfa.functions";
// The outer Worker protects document requests; this existing read also gates SPA entry.
// Do not return MFA factor metadata to this route or forward it to local telemetry.
export const Route = createFileRoute("/admin_/diagnostics")({
  staleTime: 0,
  gcTime: 0,
  loader: async () => {
    try {
      return { allowed: (await getAdminMfaState()).ok === true };
    } catch {
      return { allowed: false };
    }
  },
  component: Diagnostics,
});
function Diagnostics() {
  const { allowed } = Route.useLoaderData();
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      void router.invalidate();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);
  return allowed ? <Observatory /> : <StatusScene code={403} />;
}
