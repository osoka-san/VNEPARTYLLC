import {
  getSiteSession,
  json,
  boundedText,
  digest,
  passwordHash,
  passwordMatches,
  tokenFrom,
} from "./site-access.mjs";
import { REQUEST_STATUSES } from "../../src/lib/site-requests";

const fail = (error: string, status = 400) => json({ ok: false, error }, status);
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const profile = (a: any) => ({
  username: a.username,
  displayName: a.displayName,
  version: a.version,
  createdAt: a.createdAt,
});
// Never return moderation notes, staff identities, credentials or other guests' requests.
const item = (r: any) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  telegram: r.telegram,
  eventKey: r.event_key,
  eventTitle: r.event_title,
  details: r.details,
  status: r.status,
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function memberApi(request: Request, env: any) {
  try {
    const actor = await getSiteSession(request, env),
      url = new URL(request.url);
    if (!actor) return fail("AUTH_REQUIRED", 401);
    if (env.VNE_SUPABASE_URL || env.SUPABASE_URL) return fail("REQUESTS_MODE_DISABLED", 409);
    if (!["GET", "POST"].includes(request.method)) return fail("METHOD_NOT_ALLOWED", 405);
    if (request.headers.get("sec-fetch-site") === "cross-site") return fail("ORIGIN_REJECTED", 403);
    const path = url.pathname.slice("/api/site-member".length);
    if (request.method === "GET") {
      if (path) return fail("NOT_FOUND", 404);
      const id = url.searchParams.get("id");
      if (id) {
        if (!uuid(id)) return fail("REQUEST_INVALID_INPUT");
        const row = await env.DB.prepare(
          "SELECT * FROM site_review_requests WHERE id = ? AND created_by = ? AND source = 'form'",
        )
          .bind(id, actor.id)
          .first();
        if (!row) return fail("NOT_FOUND", 404);
        const history = await env.DB.prepare(
          "SELECT id, action, from_status AS fromStatus, to_status AS toStatus, CASE WHEN action = 'member_reply' AND actor_id = ? THEN note ELSE '' END AS reply, CASE WHEN action = 'guest_question' THEN note ELSE '' END AS message, created_at AS createdAt FROM site_review_request_history WHERE request_id = ? AND (action IN ('created', 'member_reply', 'guest_question') OR from_status != to_status) ORDER BY created_at, rowid LIMIT 500",
        )
          .bind(actor.id, id)
          .all();
        return json({ ok: true, item: item(row), history: history.results });
      }
      const page = Number(url.searchParams.get("page") || 0),
        status = url.searchParams.get("status") || "";
      if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page > 10000 ||
        (status && !Object.hasOwn(REQUEST_STATUSES, status))
      )
        return fail("REQUEST_INVALID_INPUT");
      const filter = "created_by = ? AND source = 'form' AND (? = '' OR status = ?)";
      const count = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM site_review_requests WHERE ${filter}`,
      )
        .bind(actor.id, status, status)
        .first();
      const rows = await env.DB.prepare(
        `SELECT * FROM site_review_requests WHERE ${filter} ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?`,
      )
        .bind(actor.id, status, status, page * 20)
        .all();
      return json({
        ok: true,
        profile: profile(actor),
        items: rows.results.map(item),
        total: count.total,
        page,
        pageSize: 20,
        mode: "preview",
      });
    }
    if (request.headers.get("origin") !== url.origin) return fail("ORIGIN_REJECTED", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return fail("INVALID_INPUT");
    const data = JSON.parse(await boundedText(request, 5000));
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail("INVALID_INPUT");
    const now = new Date().toISOString();
    if (path === "/profile" || path === "/password") {
      if (!Number.isSafeInteger(data.version) || data.version !== actor.version)
        return fail("VERSION_CONFLICT", 409);
      const changingPassword = path === "/password";
      const name = typeof data.displayName === "string" ? data.displayName.trim() : "";
      if (!changingPassword && (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)))
        return fail("PROFILE_INVALID_INPUT");
      let hash: string | null = null;
      if (changingPassword) {
        if (
          typeof data.currentPassword !== "string" ||
          data.currentPassword.length > 200 ||
          typeof data.password !== "string" ||
          data.password.length < 12 ||
          data.password.length > 200 ||
          data.password !== data.confirmPassword
        )
          return fail("PASSWORD_INVALID_INPUT");
        const key = await digest("member-password:" + actor.id + env.VNE_ADMIN_SESSION_SECRET),
          stamp = Date.now();
        const count = await env.DB.prepare(
          "INSERT INTO site_login_limits (key, attempts, until) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN until > ? THEN attempts + 1 ELSE 1 END, until = CASE WHEN until > ? THEN until ELSE ? END RETURNING attempts",
        )
          .bind(key, stamp + 900000, stamp, stamp, stamp + 900000)
          .first();
        if (count.attempts > 5) return fail("PASSWORD_RATE_LIMITED", 429);
        const current = await env.DB.prepare("SELECT password_hash FROM site_accounts WHERE id = ?")
          .bind(actor.id)
          .first();
        if (!(await passwordMatches(data.currentPassword, current.password_hash)))
          return fail("PASSWORD_INCORRECT", 400);
        hash = await passwordHash(data.password);
      }
      const sessionHash = await digest(tokenFrom(request) + env.VNE_ADMIN_SESSION_SECRET);
      const updated = await env.DB.batch([
        env.DB.prepare(
          "UPDATE site_accounts SET display_name = ?, password_hash = COALESCE(?, password_hash), version = version + 1 WHERE id = ? AND version = ? AND disabled = 0 RETURNING id",
        ).bind(changingPassword ? actor.displayName : name, hash, actor.id, data.version),
        changingPassword
          ? env.DB.prepare(
              "UPDATE site_sessions SET account_version = account_version + 1 WHERE token_hash = ? AND account_id = ? AND account_version = ? AND changes() > 0",
            ).bind(sessionHash, actor.id, data.version)
          : env.DB.prepare(
              "UPDATE site_sessions SET account_version = account_version + 1 WHERE account_id = ? AND account_version = ? AND changes() > 0",
            ).bind(actor.id, data.version),
        env.DB.prepare(
          "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
        ).bind(
          crypto.randomUUID(),
          actor.id,
          actor.displayName,
          changingPassword ? "member.password_changed" : "member.profile_updated",
          actor.id,
          now,
        ),
      ]);
      if (!updated[0].results?.length) return fail("VERSION_CONFLICT", 409);
      return json({
        ok: true,
        profile: {
          ...profile(actor),
          displayName: changingPassword ? actor.displayName : name,
          version: data.version + 1,
        },
      });
    }
    if (path !== "/reply") return fail("NOT_FOUND", 404);
    const reply = typeof data.reply === "string" ? data.reply.trim() : "";
    if (
      !uuid(data.id) ||
      !uuid(data.operationId) ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      reply.length < 3 ||
      reply.length > 1000
    )
      return fail("REPLY_INVALID_INPUT");
    const row = await env.DB.prepare(
      "SELECT id, version, status FROM site_review_requests WHERE id = ? AND created_by = ? AND source = 'form'",
    )
      .bind(data.id, actor.id)
      .first();
    if (!row) return fail("NOT_FOUND", 404);
    const fingerprint = await digest(
      JSON.stringify({ action: "member_reply", id: data.id, version: data.version, reply }),
    );
    const duplicate = await env.DB.prepare(
      "SELECT fingerprint, actor_id FROM site_review_request_history WHERE operation_id = ?",
    )
      .bind(data.operationId)
      .first();
    if (duplicate)
      return duplicate.fingerprint === fingerprint && duplicate.actor_id === actor.id
        ? json({ ok: true })
        : fail("VERSION_CONFLICT", 409);
    if (row.version !== data.version) return fail("VERSION_CONFLICT", 409);
    if (row.status !== "needs_info") return fail("REQUEST_TRANSITION_INVALID", 409);
    const changed = await env.DB.batch([
      env.DB.prepare(
        "UPDATE site_review_requests SET status = 'under_review', version = version + 1, updated_at = ? WHERE id = ? AND created_by = ? AND source = 'form' AND status = 'needs_info' AND version = ? RETURNING id",
      ).bind(now, data.id, actor.id, data.version),
      env.DB.prepare(
        "INSERT INTO site_review_request_history (id, request_id, operation_id, fingerprint, action, from_status, to_status, note, actor_id, actor_name, created_at) SELECT ?, ?, ?, ?, 'member_reply', 'needs_info', 'under_review', ?, ?, ?, ? WHERE changes() > 0",
      ).bind(
        crypto.randomUUID(),
        data.id,
        data.operationId,
        fingerprint,
        reply,
        actor.id,
        actor.displayName,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, 'request.member_reply', ?, ? WHERE changes() > 0",
      ).bind(crypto.randomUUID(), actor.id, actor.displayName, data.id, now),
    ]);
    if (changed[0].results?.length) return json({ ok: true });
    const retry = await env.DB.prepare(
      "SELECT fingerprint, actor_id FROM site_review_request_history WHERE operation_id = ?",
    )
      .bind(data.operationId)
      .first();
    return retry?.fingerprint === fingerprint && retry.actor_id === actor.id
      ? json({ ok: true })
      : fail("VERSION_CONFLICT", 409);
  } catch (e: any) {
    if (e instanceof SyntaxError || e?.message === "INVALID_INPUT") return fail("INVALID_INPUT");
    if (e?.message === "BODY_TOO_LARGE") return fail("BODY_TOO_LARGE", 413);
    if (String(e).includes("UNIQUE constraint")) return fail("VERSION_CONFLICT", 409);
    return fail("STORAGE_UNAVAILABLE", 503);
  }
}
export default function withMember(worker: {
  fetch: (r: Request, env: any, ctx: any) => Promise<Response>;
}) {
  return {
    fetch(request: Request, env: any, ctx: any) {
      const path = new URL(request.url).pathname;
      return path === "/api/site-member" || path.startsWith("/api/site-member/")
        ? memberApi(request, env)
        : worker.fetch(request, env, ctx);
    },
  };
}
