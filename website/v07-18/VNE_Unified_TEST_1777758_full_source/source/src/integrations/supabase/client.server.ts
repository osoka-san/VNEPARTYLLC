// Project consistency guard is maintained locally; preserve it when regenerating.
// Server-side Supabase client with service role key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveSupabaseProject } from "../../lib/supabase-project";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function readSupabaseAdminConfig() {
  const project = resolveSupabaseProject(process.env);
  if (!project.enabled) {
    // Do not include URLs or credentials in errors/logs.
    throw new Error(`Supabase project configuration rejected: ${project.reason}`);
  }
  // The service-role credential belongs to SUPABASE_URL. Never silently bind
  // it to a VNE-only override, even when Auth is otherwise configured.
  const cloudUrl = process.env["SUPABASE_URL"]?.trim();
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!cloudUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase server configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  return { url: project.url, serviceRoleKey };
}

function createSupabaseAdminClient({
  url,
  serviceRoleKey,
}: ReturnType<typeof readSupabaseAdminConfig>) {
  return createClient<Database>(url, serviceRoleKey, {
    global: {
      fetch: createSupabaseFetch(serviceRoleKey),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _adminConfig: ReturnType<typeof readSupabaseAdminConfig> | undefined;
let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
// Load inside server handlers: const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Top-level import is safe only in other .server.ts modules - route files and *.functions.ts ship to the client bundle.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    // Auth reads current env on each request. Revalidate before using even a
    // cached privileged client so runtime changes cannot split the projects.
    const config = readSupabaseAdminConfig();
    if (
      !_supabaseAdmin ||
      _adminConfig?.url !== config.url ||
      _adminConfig?.serviceRoleKey !== config.serviceRoleKey
    ) {
      _supabaseAdmin = createSupabaseAdminClient(config);
      _adminConfig = config;
    }
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
