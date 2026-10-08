import { getSiteSession, PRIVATE, boundedText } from "./site-access.mjs";
import {
  defaultMotionSettings,
  sanitizeMotionSettings,
  MOTION_SCHEMA_VERSION,
  parseImportedSettings,
} from "../../src/lib/motion-settings";
import {
  PREVIEW_GROUPS,
  mergePreviewGroups,
  type PreviewGroupId,
} from "../../src/lib/preview-defaults";
type Env = Record<string, any>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE });
export async function settingsApi(request: Request, env: Env) {
  try {
    if (!env.DB) return json({ ok: false, error: "STORAGE_UNAVAILABLE" }, 503);
    const actor = await getSiteSession(request, env);
    if (!actor) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
    if (!["GET", "POST"].includes(request.method))
      return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return json({ ok: false, error: "ORIGIN_REJECTED" }, 403);
    const stored = await env.DB.prepare(
      "SELECT version, settings, updated_at FROM site_preview_defaults WHERE key = 'site'",
    ).first();
    const current = {
      version: stored?.version ?? 0,
      settings: stored
        ? sanitizeMotionSettings(JSON.parse(stored.settings))
        : defaultMotionSettings,
      updatedAt: stored?.updated_at ?? null,
    };
    if (request.method === "GET") return json({ ok: true, ...current });
    if (actor.role !== "owner") return json({ ok: false, error: "PERMISSION_DENIED" }, 403);
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return json({ ok: false, error: "ORIGIN_REJECTED" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    const data = JSON.parse(await boundedText(request, 24000));
    if (
      !data ||
      !Number.isInteger(data.expectedVersion) ||
      data.expectedVersion < 0 ||
      !Array.isArray(data.groups) ||
      !data.groups.length ||
      data.groups.length > PREVIEW_GROUPS.length ||
      data.groups.some((id: unknown) => !PREVIEW_GROUPS.some((g) => g.id === id))
    )
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    const parsed = parseImportedSettings(
      JSON.stringify({ schemaVersion: MOTION_SCHEMA_VERSION, ...data.settings }),
      defaultMotionSettings,
    );
    if (
      !parsed.ok ||
      !data.settings ||
      Object.keys(defaultMotionSettings).some((k) => !Object.hasOwn(data.settings, k))
    )
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    if (data.expectedVersion !== current.version)
      return json({ ok: false, error: "VERSION_CONFLICT" }, 409);
    const groups = [...new Set(data.groups)] as PreviewGroupId[];
    const settings = mergePreviewGroups(current.settings, parsed.settings, groups),
      updatedAt = new Date().toISOString();
    const mutation =
      current.version === 0
        ? env.DB.prepare(
            "INSERT INTO site_preview_defaults (key, version, settings, updated_at, updated_by) VALUES ('site', 1, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING version",
          ).bind(JSON.stringify(settings), updatedAt, actor.id)
        : env.DB.prepare(
            "UPDATE site_preview_defaults SET version = version + 1, settings = ?, updated_at = ?, updated_by = ? WHERE key = 'site' AND version = ? RETURNING version",
          ).bind(JSON.stringify(settings), updatedAt, actor.id, current.version);
    const result = await env.DB.batch([
      mutation,
      env.DB.prepare(
        "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
      ).bind(
        crypto.randomUUID(),
        actor.id,
        actor.displayName,
        "settings.published",
        groups.join(", "),
        updatedAt,
      ),
    ]);
    if (!result[0].results?.length) return json({ ok: false, error: "VERSION_CONFLICT" }, 409);
    return json({ ok: true, version: current.version + 1, settings, updatedAt, groups });
  } catch (e) {
    return json(
      {
        ok: false,
        error:
          e instanceof SyntaxError
            ? "INVALID_INPUT"
            : (e as Error)?.message === "BODY_TOO_LARGE"
              ? "BODY_TOO_LARGE"
              : "STORAGE_UNAVAILABLE",
      },
      e instanceof SyntaxError ? 400 : (e as Error)?.message === "BODY_TOO_LARGE" ? 413 : 503,
    );
  }
}
export default function withDefaults(worker: {
  fetch: (request: Request, env: Env, ctx: unknown) => Promise<Response>;
}) {
  return {
    fetch(request: Request, env: Env, ctx: unknown) {
      return new URL(request.url).pathname === "/api/site-admin/defaults"
        ? settingsApi(request, env)
        : worker.fetch(request, env, ctx);
    },
  };
}
