/**
 * Callback ссылок Auth (PKCE code или token_hash). Ошибки → /login?error=expired|invalid|network|invite|revoke.
 * Fail-closed: cookies сессии выдаются только после успешной проверки приглашения (finishCallback).
 * Переход дальше только через safeRedirect. Ответ private/no-store/noindex.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { createRequestClient, privateHeaders } = await import("@/lib/auth/supabase.server");
        const { classifyCallbackError } = await import("@/lib/auth/auth-core");
        const { safeRedirect } = await import("@/lib/auth/safe-redirect");
        const { finishCallback, expireAuthCookies, sha256Hex, INVITE_NONCE_RE } =
          await import("@/lib/auth/invite-callback");
        const { parseCookieHeader } = await import("@supabase/ssr");
        const url = new URL(request.url);
        const ctx = createRequestClient(request);
        const go = (to: string, pending = ctx?.pending ?? []) =>
          new Response(null, { status: 303, headers: privateHeaders(pending, { Location: to }) });
        const reqCookieNames = () =>
          parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => c.name);
        // Отказ после exchange: никаких cookies exchange, только явное истечение auth-cookies.
        const deny = (to: string) =>
          go(
            to,
            expireAuthCookies(
              reqCookieNames(),
              (ctx?.pending ?? []).map((c) => c.name),
            ),
          );
        if (!ctx) return go("/login?error=unavailable", []);
        const next = safeRedirect(url.searchParams.get("next"), "/member");
        const allowedNext =
          next.startsWith("/auth/reset") || next.startsWith("/member") ? next : "/member";
        if (url.searchParams.get("error_code") || url.searchParams.get("error"))
          return go(
            `/login?error=${url.searchParams.get("error_code") === "otp_expired" ? "expired" : "invalid"}`,
            [],
          );
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        const nonce = url.searchParams.get("inv");
        try {
          let error: {
            message?: string | undefined;
            status?: number | undefined;
            code?: string | undefined;
          } | null = null;
          if (code) ({ error } = await ctx.supabase.auth.exchangeCodeForSession(code));
          else if (
            tokenHash &&
            (type === "recovery" || type === "email" || type === "signup" || type === "invite")
          )
            ({ error } = await ctx.supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
          else return go("/login?error=invalid", []);
          if (error) return deny(`/login?error=${classifyCallbackError(error)}`);
          const inviteHash = nonce && INVITE_NONCE_RE.test(nonce) ? await sha256Hex(nonce) : null;
          const result = await finishCallback(
            {
              getUserId: async () => {
                const { data, error: e } = await ctx.supabase.auth.getUser();
                if (e) throw e;
                return data.user?.id ?? null;
              },
              accept: async (uid, h) => {
                const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                const { data, error: e } = await supabaseAdmin.rpc("accept_invite", {
                  _user: uid,
                  ...(h ? { _token_hash: h } : {}),
                });
                if (e) throw e;
                return String(data);
              },
              revokeAsUser: async () => {
                const { error: e } = await ctx.supabase.auth.signOut({ scope: "local" });
                return !e;
              },
              revokeAsAdmin: async () => {
                const { data } = await ctx.supabase.auth.getSession();
                const jwt = data.session?.access_token;
                if (!jwt) return false;
                const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                const { error: e } = await supabaseAdmin.auth.admin.signOut(jwt, "local");
                return !e;
              },
            },
            inviteHash,
            allowedNext,
          );
          if (!result.ok) {
            if (!result.revoked) console.error("auth.callback: session revoke failed");
            return deny(result.to);
          }
          return go(allowedNext);
        } catch {
          return deny("/login?error=network");
        }
      },
    },
  },
});
