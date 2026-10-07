import { createIssuer } from "./handler.ts";
Deno.serve(
  createIssuer({
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_PUBLISHABLE_KEY:
      Deno.env.get("VNE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY"),
    ADMIN_KEY: Deno.env.get("VNE_PASS_ADMIN_KEY"),
    TOKEN_SECRET: Deno.env.get("VNE_PASS_TOKEN_SECRET"),
    TOKEN_KEY_VERSION: Deno.env.get("VNE_PASS_TOKEN_KEY_VERSION"),
    PUBLIC_ORIGIN: Deno.env.get("VNE_SITE_URL"),
  }),
);
