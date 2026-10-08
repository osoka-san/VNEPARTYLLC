import { getSiteSession, json, can, boundedText, digest } from "./site-access.mjs";
import {
  parseQuestionnaireSubmission,
  QUESTIONNAIRE_DETAILS_MAX_LENGTH,
} from "../../src/lib/questionnaire-submission";
import {
  REQUEST_ACTIONS,
  REQUEST_STATUSES,
  REVIEW_EVENTS,
  type RequestAction,
} from "../../src/lib/site-requests";

const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = (error: string, status = 400) => json({ ok: false, error }, status);
const dto = (r: any) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  email: r.email,
  telegram: r.telegram,
  eventKey: r.event_key,
  eventTitle: r.event_title,
  details: r.details,
  status: r.status,
  note: r.note,
  version: r.version,
  source: r.source,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const enabled = (env: any) => !env.VNE_SUPABASE_URL && !env.SUPABASE_URL;

export async function requestsApi(request: Request, env: any) {
  try {
    const url = new URL(request.url);
    const actor = await getSiteSession(request, env);
    if (!actor) return fail("AUTH_REQUIRED", 401);
    if (!["GET", "POST"].includes(request.method)) return fail("METHOD_NOT_ALLOWED", 405);
    if (request.headers.get("sec-fetch-site") === "cross-site") return fail("ORIGIN_REJECTED", 403);
    const path = url.pathname.slice("/api/site-admin/requests".length);
    if (path === "/config" && request.method === "GET")
      return json({ ok: true, enabled: enabled(env), mode: "preview", questionnaireVersion: 3 });
    if (!enabled(env)) return fail("REQUESTS_MODE_DISABLED", 409);
    const manage = actor.role === "owner" || can(actor, "requests.manage");
    const read = manage || can(actor, "requests.read");
    if (request.method === "GET") {
      if (path || !read) return fail(path ? "NOT_FOUND" : "PERMISSION_DENIED", path ? 404 : 403);
      const id = url.searchParams.get("id");
      if (id) {
        if (!uuid(id)) return fail("REQUEST_INVALID_INPUT");
        const row = await env.DB.prepare("SELECT * FROM site_review_requests WHERE id = ?")
          .bind(id)
          .first();
        if (!row) return fail("NOT_FOUND", 404);
        const history = await env.DB.prepare(
          "SELECT id, action, from_status AS fromStatus, to_status AS toStatus, note, actor_name AS actorName, created_at AS createdAt FROM site_review_request_history WHERE request_id = ? ORDER BY created_at, rowid LIMIT 500",
        )
          .bind(id)
          .all();
        return json({ ok: true, item: dto(row), history: history.results });
      }
      const kind = url.searchParams.get("kind") || "membership";
      const status = url.searchParams.get("status") || "";
      const event = url.searchParams.get("event") || "";
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const page = Number(url.searchParams.get("page") || "0");
      if (
        !["membership", "event"].includes(kind) ||
        (status && !Object.hasOwn(REQUEST_STATUSES, status)) ||
        q.length > 100 ||
        event.length > 80 ||
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page > 10000
      )
        return fail("REQUEST_INVALID_INPUT");
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const where = "kind = ? AND search_text LIKE ? ESCAPE '\\' AND (? = '' OR event_key = ?)";
      const counts = await env.DB.prepare(
        `SELECT status, COUNT(*) AS n FROM site_review_requests WHERE ${where} GROUP BY status`,
      )
        .bind(kind, pattern, event, event)
        .all();
      const countMap = Object.fromEntries(Object.keys(REQUEST_STATUSES).map((k) => [k, 0]));
      for (const row of counts.results) countMap[row.status] = row.n;
      const total = status
        ? countMap[status]
        : Object.values(countMap).reduce((a: number, b: any) => a + b, 0);
      const rows = await env.DB.prepare(
        `SELECT * FROM site_review_requests WHERE ${where} AND (? = '' OR status = ?) ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?`,
      )
        .bind(kind, pattern, event, event, status, status, page * 20)
        .all();
      return json({
        ok: true,
        items: rows.results.map(dto),
        total,
        counts: countMap,
        page,
        pageSize: 20,
      });
    }
    if (request.headers.get("origin") !== url.origin) return fail("ORIGIN_REJECTED", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return fail("REQUEST_INVALID_INPUT");
    if (!["", "/submit"].includes(path)) return fail("NOT_FOUND", 404);
    if (!path && !manage) return fail("PERMISSION_DENIED", 403);
    const data = JSON.parse(await boundedText(request, 12000));
    if (!data || typeof data !== "object" || Array.isArray(data))
      return fail("REQUEST_INVALID_INPUT");
    const now = new Date().toISOString();
    if (path === "/submit" || data.action === "create") {
      const kind = path === "/submit" ? "membership" : data.kind;
      const source = path === "/submit" ? "form" : "manual";
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const telegram =
        typeof data.telegram === "string" ? data.telegram.trim().replace(/^@/, "") : "";
      const questionnaire = parseQuestionnaireSubmission(
        data.questionnaire,
        data.ratings,
        data.age,
        path === "/submit",
      );
      if (!questionnaire.ok) return fail("QUESTIONNAIRE_INVALID_INPUT");
      const details =
        questionnaire.details ?? (typeof data.details === "string" ? data.details.trim() : "");
      const eventKey = typeof data.event === "string" ? data.event : "";
      const event = REVIEW_EVENTS.find((e) => e.id === eventKey);
      if (
        !uuid(data.id) ||
        !["membership", "event"].includes(kind) ||
        !name ||
        name.length > 80 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram) ||
        details.length > QUESTIONNAIRE_DETAILS_MAX_LENGTH ||
        (eventKey && !event) ||
        (kind === "event" && !event)
      )
        return fail("REQUEST_INVALID_INPUT");
      if (path === "/submit" && data.consent !== true) return fail("CONSENT_REQUIRED");
      if (path === "/submit" && typeof data.website === "string" && data.website.trim())
        return json({ ok: true, message: "Заявка получена." });
      const fingerprint = await digest(
        JSON.stringify({ kind, name, email, telegram, eventKey, details, source }),
      );
      const existing = await env.DB.prepare(
        "SELECT id, fingerprint, created_by FROM site_review_requests WHERE id = ?",
      )
        .bind(data.id)
        .first();
      if (existing)
        return existing.fingerprint === fingerprint && existing.created_by === actor.id
          ? json({
              ok: true,
              id: data.id,
              message: "Тестовая заявка сохранена. Письма не отправляются.",
            })
          : fail("VERSION_CONFLICT", 409);
      // Bound creation per authenticated actor, including simultaneous submissions.
      const cutoff = new Date(Date.now() - 3600000).toISOString();
      const op = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO site_review_requests (id, kind, name, email, telegram, event_key, event_title, details, search_text, status, note, version, source, consent_version, fingerprint, created_by, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', '', 1, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM site_review_requests WHERE created_by = ? AND created_at > ?) < 30 ON CONFLICT DO NOTHING RETURNING id",
        ).bind(
          data.id,
          kind,
          name,
          email,
          telegram,
          eventKey,
          event?.title || "",
          details,
          `${name} ${email} ${telegram} ${data.id}`.toLowerCase(),
          source,
          source === "form" ? "preview-membership-1" : "manual-test-entry",
          fingerprint,
          actor.id,
          now,
          now,
          actor.id,
          cutoff,
        ),
        env.DB.prepare(
          "INSERT INTO site_review_request_history (id, request_id, operation_id, fingerprint, action, from_status, to_status, note, actor_id, actor_name, created_at) SELECT ?, ?, ?, ?, 'created', NULL, 'submitted', ?, ?, ?, ? WHERE changes() > 0",
        ).bind(
          crypto.randomUUID(),
          data.id,
          data.id,
          fingerprint,
          source === "form" ? "Получена из тестовой формы" : "Добавлена администратором",
          actor.id,
          actor.displayName,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, 'request.created', ?, ? WHERE changes() > 0",
        ).bind(crypto.randomUUID(), actor.id, actor.displayName, `${kind}:${data.id}`, now),
      ]);
      if (!op[0].results?.length) {
        const retry = await env.DB.prepare(
          "SELECT fingerprint, created_by FROM site_review_requests WHERE id = ?",
        )
          .bind(data.id)
          .first();
        if (retry)
          return retry.fingerprint === fingerprint && retry.created_by === actor.id
            ? json({ ok: true, id: data.id, message: "Тестовая заявка сохранена." })
            : fail("VERSION_CONFLICT", 409);
        return fail("REQUEST_RATE_LIMITED", 429);
      }
      return json({
        ok: true,
        id: data.id,
        message:
          "Тестовая заявка сохранена. Она появится у администратора; письма не отправляются.",
      });
    }
    if (
      !uuid(data.id) ||
      !uuid(data.operationId) ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      !Object.hasOwn(REQUEST_ACTIONS, data.action) ||
      typeof data.note !== "string" ||
      data.note.length > 2000
    )
      return fail("REQUEST_INVALID_INPUT");
    const action = data.action as RequestAction;
    const guestMessage =
      action === "request_info" && typeof data.guestMessage === "string"
        ? data.guestMessage.trim()
        : "";
    if (guestMessage && (guestMessage.length < 3 || guestMessage.length > 1000))
      return fail("REQUEST_INVALID_INPUT");
    const note = data.note.trim() || (guestMessage ? "Запрошено уточнение через кабинет" : "");
    if (["request_info", "resume", "reject", "reopen", "note"].includes(action) && note.length < 3)
      return fail("REQUEST_NOTE_REQUIRED");
    const fingerprint = await digest(
      JSON.stringify({
        id: data.id,
        action,
        note,
        version: data.version,
        ...(guestMessage ? { guestMessage } : {}),
      }),
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
    const row = await env.DB.prepare(
      "SELECT kind, status, version FROM site_review_requests WHERE id = ?",
    )
      .bind(data.id)
      .first();
    if (!row) return fail("NOT_FOUND", 404);
    if (row.version !== data.version) return fail("VERSION_CONFLICT", 409);
    const rule = REQUEST_ACTIONS[action];
    if (!(rule.from as readonly string[]).includes(row.status))
      return fail("REQUEST_TRANSITION_INVALID", 409);
    const target = rule.to || row.status;
    const changed = await env.DB.batch([
      env.DB.prepare(
        "UPDATE site_review_requests SET status = ?, note = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? RETURNING id",
      ).bind(target, note, now, data.id, data.version),
      env.DB.prepare(
        "INSERT INTO site_review_request_history (id, request_id, operation_id, fingerprint, action, from_status, to_status, note, actor_id, actor_name, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0",
      ).bind(
        crypto.randomUUID(),
        data.id,
        data.operationId,
        fingerprint,
        action,
        row.status,
        target,
        note,
        actor.id,
        actor.displayName,
        now,
      ),
      ...(guestMessage
        ? [
            env.DB.prepare(
              "INSERT INTO site_review_request_history (id, request_id, operation_id, fingerprint, action, from_status, to_status, note, actor_id, actor_name, created_at) SELECT ?, ?, ?, ?, 'guest_question', ?, ?, ?, ?, ?, ? WHERE changes() > 0",
            ).bind(
              crypto.randomUUID(),
              data.id,
              crypto.randomUUID(),
              fingerprint,
              target,
              target,
              guestMessage,
              actor.id,
              actor.displayName,
              now,
            ),
          ]
        : []),
      env.DB.prepare(
        "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
      ).bind(
        crypto.randomUUID(),
        actor.id,
        actor.displayName,
        "request." + action,
        `${row.kind}:${data.id}`,
        now,
      ),
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
  } catch (error: any) {
    if (error instanceof SyntaxError || error?.message === "INVALID_INPUT")
      return fail("REQUEST_INVALID_INPUT");
    if (error?.message === "BODY_TOO_LARGE") return fail("BODY_TOO_LARGE", 413);
    if (String(error).includes("UNIQUE constraint")) return fail("VERSION_CONFLICT", 409);
    return fail("STORAGE_UNAVAILABLE", 503);
  }
}

export default function withRequests(worker: {
  fetch: (request: Request, env: any, ctx: any) => Promise<Response>;
}) {
  return {
    fetch(request: Request, env: any, ctx: any) {
      const path = new URL(request.url).pathname;
      return path === "/api/site-admin/requests" || path.startsWith("/api/site-admin/requests/")
        ? requestsApi(request, env)
        : worker.fetch(request, env, ctx);
    },
  };
}
