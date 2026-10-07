import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { readAuthConfig } from "../../src/lib/auth/config";
import { getSiteSession, can, audit } from "../auth/site-access.mjs";
import {
  ENGINE_VERSION,
  NEW_RENDERER_ENGINES,
  supportsPatternEngine,
  parsePattern,
  type Pattern,
} from "../../src/lib/qr-studio/pattern";

type Row = {
  pattern_id: string;
  version: number;
  recipe: string;
  engine_version: string;
  archived: number;
  created_at: string;
  operation_id: string;
};
type Statement = {
  bind(...args: unknown[]): Statement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
};
type Env = Record<string, unknown> & { DB?: { prepare(sql: string): Statement } };
const BASE = "/api/qr-studio/patterns";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const AUTH_SIGNALS = [
  "VNE_SUPABASE_URL",
  "VNE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "VNE_AUTH_ENV",
];
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE });
const mapped = (r: Row) => ({
  id: r.pattern_id,
  version: r.version,
  pattern: parsePattern(JSON.parse(r.recipe)),
  engineVersion: r.engine_version,
  archived: !!r.archived,
  createdAt: r.created_at,
});
const fail = (error: string, status: number) => json({ ok: false, error }, status);
function db(env: Env) {
  if (!env.DB?.prepare) throw new Error("STORAGE_UNAVAILABLE");
  return env.DB;
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new Error("UNSUPPORTED_CONTENT_TYPE");
  if (Number(request.headers.get("content-length")) > 12000) throw new Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const v = await reader.read();
    if (v.done) break;
    bytes += v.value.length;
    if (bytes > 12000) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(v.value);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
  } catch {
    throw new Error("INVALID_INPUT");
  }
}
function input(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (k) =>
        !["id", "expectedVersion", "operationId", "pattern", "archived", "engineVersion"].includes(
          k,
        ),
    ) ||
    typeof p.id !== "string" ||
    !UUID.test(p.id) ||
    typeof p.operationId !== "string" ||
    !UUID.test(p.operationId) ||
    !Number.isSafeInteger(p.expectedVersion) ||
    Number(p.expectedVersion) < 0 ||
    Number(p.expectedVersion) > 100000 ||
    typeof p.archived !== "boolean" ||
    ![ENGINE_VERSION, ...Object.values(NEW_RENDERER_ENGINES)].includes(String(p.engineVersion))
  )
    throw new Error("INVALID_INPUT");
  const raw = p.pattern;
  if (
    !raw ||
    typeof raw !== "object" ||
    Object.keys(raw).some(
      (k) =>
        ![
          "schema",
          "name",
          "event",
          "geometry",
          "palette",
          "rounding",
          "accents",
          "template",
        ].includes(k),
    )
  )
    throw new Error("INVALID_INPUT");
  let pattern: Pattern;
  try {
    pattern = parsePattern(raw);
    if (!supportsPatternEngine(p.engineVersion, pattern)) throw new Error("INVALID_INPUT");
  } catch {
    throw new Error("INVALID_INPUT");
  }
  return {
    id: p.id,
    expectedVersion: Number(p.expectedVersion),
    operationId: p.operationId,
    pattern,
    archived: p.archived,
    engineVersion: String(p.engineVersion),
  };
}
export async function libraryApi(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname !== BASE) return fail("NOT_FOUND", 404);
  if (!["GET", "POST"].includes(request.method)) return fail("METHOD_NOT_ALLOWED", 405);
  if (!env.DB?.prepare) return fail("STORAGE_UNAVAILABLE", 503);
  let actor;
  try {
    actor = await getSiteSession(request, env);
  } catch {
    return fail("STORAGE_UNAVAILABLE", 503);
  }
  if (!actor) return fail("AUTH_REQUIRED", 401);
  if (!can(actor, request.method === "GET" ? "qr.read" : "qr.write"))
    return fail("PERMISSION_DENIED", 403);
  // Temporary stand password is never a fallback around real staff/MFA authorization.
  const runtime = typeof process !== "undefined" ? process.env : {};
  if (AUTH_SIGNALS.some((k) => String(env[k] ?? "").trim() || String(runtime[k] ?? "").trim())) {
    const config = readAuthConfig({ ...runtime, ...env } as Record<string, string | undefined>);
    if (!config.enabled) return fail("STAFF_GUARD_REQUIRED", 503);
    try {
      // Never falls back to the temporary password once staff auth is configured.
      const client = createServerClient(config.url, config.publishableKey, {
        cookies: {
          getAll: () =>
            parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({
              name: c.name,
              value: c.value ?? "",
            })),
          setAll: () => {},
        },
      });
      const claims = await client.auth.getClaims();
      if (claims.error || !claims.data?.claims?.sub || claims.data.claims.aal !== "aal2")
        return fail("STAFF_GUARD_REQUIRED", 403);
      const access = await client.rpc("staff_can", { _cap: "events_manage" });
      if (access.error || access.data !== true) return fail("STAFF_GUARD_REQUIRED", 403);
    } catch {
      return fail("STAFF_GUARD_REQUIRED", 503);
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail("ORIGIN_REJECTED", 403);
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    return fail("ORIGIN_REJECTED", 403);
  try {
    const store = db(env);
    if (request.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        if (!UUID.test(id)) return fail("INVALID_INPUT", 400);
        const rows = await store
          .prepare(
            "SELECT * FROM qr_pattern_versions WHERE pattern_id = ? ORDER BY version DESC LIMIT 50",
          )
          .bind(id)
          .all<Row>();
        return json({ ok: true, items: rows.results.map(mapped) });
      }
      const rawPage = url.searchParams.get("page") ?? "0",
        page = Number(rawPage);
      if (!/^\d{1,5}$/.test(rawPage) || page > 10000) return fail("INVALID_INPUT", 400);
      const archive = url.searchParams.get("archived") === "1" ? 1 : 0;
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length > 100) return fail("INVALID_INPUT", 400);
      const rows = await store
        .prepare(
          `SELECT v.* FROM qr_pattern_versions v
        WHERE v.version = (SELECT MAX(w.version) FROM qr_pattern_versions w WHERE w.pattern_id = v.pattern_id)
        AND v.archived = ? AND (? = '' OR instr(v.search_text, ?) > 0)
        ORDER BY v.created_at DESC, v.pattern_id ASC LIMIT 25 OFFSET ?`,
        )
        .bind(archive, q, q.toLowerCase(), page * 24)
        .all<Row>();
      return json({
        ok: true,
        items: rows.results.slice(0, 24).map(mapped),
        hasMore: rows.results.length > 24,
        page,
      });
    }
    const p = input(await body(request));
    const recipe = JSON.stringify(p.pattern);
    const archived = p.archived ? 1 : 0;
    const replay = await store
      .prepare("SELECT * FROM qr_pattern_versions WHERE operation_id = ?")
      .bind(p.operationId)
      .first<Row>();
    if (replay) {
      if (
        replay.pattern_id !== p.id ||
        replay.version !== p.expectedVersion + 1 ||
        replay.recipe !== recipe ||
        replay.archived !== archived ||
        replay.engine_version !== p.engineVersion
      )
        return fail("OPERATION_REUSED", 409);
      return json({ ok: true, item: mapped(replay), replayed: true });
    }
    // One atomic statement creates the full immutable revision iff the caller's base is current.
    const row = await store
      .prepare(
        `INSERT INTO qr_pattern_versions
      (pattern_id, version, recipe, engine_version, archived, created_at, operation_id, search_text)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE
      COALESCE((SELECT MAX(version) FROM qr_pattern_versions WHERE pattern_id = ?), 0) = ?
      ON CONFLICT(operation_id) DO NOTHING RETURNING *`,
      )
      .bind(
        p.id,
        p.expectedVersion + 1,
        recipe,
        p.engineVersion,
        archived,
        new Date().toISOString(),
        p.operationId,
        (p.pattern.name + " " + p.pattern.event).toLowerCase(),
        p.id,
        p.expectedVersion,
      )
      .first<Row>();
    if (row) {
      await audit(env, actor, p.archived ? "qr.archived" : "qr.saved", p.id);
      return json({ ok: true, item: mapped(row) }, 201);
    }
    // Concurrent identical retries may both miss the first lookup; reconcile by operation id.
    const retry = await store
      .prepare("SELECT * FROM qr_pattern_versions WHERE operation_id = ?")
      .bind(p.operationId)
      .first<Row>();
    if (
      retry &&
      retry.pattern_id === p.id &&
      retry.version === p.expectedVersion + 1 &&
      retry.recipe === recipe &&
      retry.archived === archived &&
      retry.engine_version === p.engineVersion
    )
      return json({ ok: true, item: mapped(retry), replayed: true });
    return fail("VERSION_CONFLICT", 409);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (["INVALID_INPUT", "UNSUPPORTED_CONTENT_TYPE"].includes(code)) return fail(code, 400);
    if (code === "BODY_TOO_LARGE") return fail(code, 413);
    return fail("STORAGE_UNAVAILABLE", 503);
  }
}
export default function withLibrary(worker: {
  fetch(request: Request, env: Env, ctx: unknown): Promise<Response>;
}) {
  return {
    fetch(request: Request, env: Env, ctx: unknown) {
      return new URL(request.url).pathname.startsWith("/api/qr-studio/")
        ? libraryApi(request, env)
        : worker.fetch(request, env, ctx);
    },
  };
}
