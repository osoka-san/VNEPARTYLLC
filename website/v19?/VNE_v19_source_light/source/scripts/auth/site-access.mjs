// Server-only identity for the Sites review workspace. Never grants Supabase rights.
export const COOKIE = "__Host-vne-admin";
export const PERMISSIONS = {
  "admin.view": "Просмотр админки",
  "qr.read": "Просмотр QR и макетов билетов",
  "qr.write": "Сохранение и архивирование QR",
  "content.read": "Просмотр черновиков",
  "content.write": "Редактирование черновиков",
  "accounts.read": "Просмотр учётных записей",
  "accounts.manage": "Создание пользователей и выдача прав",
  "audit.read": "Просмотр журнала действий",
  "requests.read": "Просмотр тестовых заявок",
  "requests.manage": "Решения по тестовым заявкам",
};
export const REVIEW_PERMISSIONS = ["admin.view", "qr.read", "content.read", "requests.read"];
export const PRIVATE = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const iso = () => new Date().toISOString();
export const json = (data, status = 200) => Response.json(data, { status, headers: PRIVATE });
export const can = (actor, permission) => Boolean(actor?.permissions?.includes(permission));
export async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function passwordHash(password, salt = random()) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unhex(salt), iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2:100000:${salt}:${hex(result)}`;
}
export async function passwordMatches(password, expected) {
  if (typeof expected !== "string" || !/^pbkdf2:100000:[a-f0-9]{64}:[a-f0-9]{64}$/.test(expected))
    return false;
  const actual = await passwordHash(password, expected.split(":")[2]);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}
export function auditStatement(env, actor, action, target = "") {
  return env.DB.prepare(
    "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    crypto.randomUUID(),
    actor?.id ?? null,
    actor?.displayName ?? "Неизвестный пользователь",
    action,
    String(target).slice(0, 160),
    iso(),
  );
}
export async function audit(env, actor, action, target = "") {
  await auditStatement(env, actor, action, target).run();
}
// Idempotent data bootstrap, separate from schema migrations; existing passwords/permissions are never reset.
export async function ensureBootstrapAccounts(env) {
  if (!env.DB || !env.VNE_ADMIN_PASSWORD || !env.VNE_ADMIN_SESSION_SECRET)
    throw new Error("STORAGE_UNAVAILABLE");
  const seeds = [
    {
      id: "site-owner",
      username: env.VNE_ADMIN_USERNAME || "admin",
      name: "Администратор",
      password: env.VNE_ADMIN_PASSWORD,
      role: "owner",
      permissions: Object.keys(PERMISSIONS),
    },
  ];
  if (env.VNE_REVIEW_PASSWORD)
    seeds.push({
      id: "site-review-testrev1",
      username: "testrev1",
      name: "Тестревью",
      password: env.VNE_REVIEW_PASSWORD,
      role: "reviewer",
      permissions: REVIEW_PERMISSIONS,
    });
  for (const seed of seeds) {
    const exists = await env.DB.prepare("SELECT id FROM site_accounts WHERE id = ?")
      .bind(seed.id)
      .first();
    if (exists) continue;
    const hash = await passwordHash(seed.password);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO site_accounts (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
      ).bind(seed.id, seed.username, seed.name, hash, iso()),
      env.DB.prepare(
        "INSERT INTO staff_assignments (account_id, role, permissions) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM site_accounts WHERE id = ?) ON CONFLICT DO NOTHING",
      ).bind(seed.id, seed.role, JSON.stringify(seed.permissions), seed.id),
    ]);
  }
}
function account(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    permissions: JSON.parse(row.permissions),
    disabled: Boolean(row.disabled),
    version: row.version,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
export function tokenFrom(request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value ?? "") ? value : null;
}
export async function getSiteSession(request, env) {
  const token = tokenFrom(request);
  if (!token || !env.DB || !env.VNE_ADMIN_SESSION_SECRET) return null;
  const row = await env.DB.prepare(
    `SELECT a.*, r.role, r.permissions FROM site_sessions s
    JOIN site_accounts a ON a.id = s.account_id JOIN staff_assignments r ON r.account_id = a.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0 AND s.account_version = a.version`,
  )
    .bind(await digest(token + env.VNE_ADMIN_SESSION_SECRET), Date.now())
    .first();
  return account(row);
}
export async function createLogin(request, env, username, password) {
  const identity = username.trim().toLowerCase();
  const rateKeys = await Promise.all(
    [`ip:${request.headers.get("cf-connecting-ip") || "unknown"}`, `user:${identity}`].map((v) =>
      digest(v + env.VNE_ADMIN_SESSION_SECRET),
    ),
  );
  const now = Date.now();
  const limits = await Promise.all(
    rateKeys.map((k) =>
      env.DB.prepare("SELECT attempts, until FROM site_login_limits WHERE key = ?").bind(k).first(),
    ),
  );
  if (limits.some((l) => l && l.attempts >= 8 && l.until > now)) return { status: 429 };
  // Count atomically before expensive hashing: parallel requests share the same bounded allowance.
  const counted = await Promise.all(
    rateKeys.map((k) =>
      env.DB.prepare(
        `INSERT INTO site_login_limits (key, attempts, until) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN until > ? THEN attempts + 1 ELSE 1 END, until = CASE WHEN until > ? THEN until ELSE ? END RETURNING attempts`,
      )
        .bind(k, now + 900000, now, now, now + 900000)
        .first(),
    ),
  );
  if (counted.some((l) => l.attempts > 8)) return { status: 429 };
  const row = await env.DB.prepare(
    "SELECT a.*, r.role, r.permissions FROM site_accounts a JOIN staff_assignments r ON r.account_id = a.id WHERE username = ?",
  )
    .bind(identity)
    .first();
  const dummyHash = "pbkdf2:100000:" + "0".repeat(64) + ":" + "0".repeat(64);
  const match = await passwordMatches(password, row?.password_hash ?? dummyHash);
  if (!row || row.disabled || !match) {
    await audit(env, null, "login.failed", "Неверные учётные данные");
    return { status: 401 };
  }
  const actor = account(row),
    token = random();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO site_sessions (token_hash, account_id, account_version, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      await digest(token + env.VNE_ADMIN_SESSION_SECRET),
      actor.id,
      actor.version,
      iso(),
      now + 8 * 3600000,
    ),
    env.DB.prepare("UPDATE site_accounts SET last_login_at = ? WHERE id = ?").bind(iso(), actor.id),
    ...rateKeys.map((k) => env.DB.prepare("DELETE FROM site_login_limits WHERE key = ?").bind(k)),
    env.DB.prepare("DELETE FROM site_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM site_login_limits WHERE until <= ?").bind(now),
    auditStatement(env, actor, "login.success", "Сайт и админка"),
  ]);
  return {
    status: 200,
    actor,
    cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
  };
}
export async function logout(request, env, actor) {
  const token = tokenFrom(request);
  if (token)
    await env.DB.batch([
      env.DB.prepare("DELETE FROM site_sessions WHERE token_hash = ?").bind(
        await digest(token + env.VNE_ADMIN_SESSION_SECRET),
      ),
      auditStatement(env, actor, "logout", "Текущая сессия"),
    ]);
}
export async function boundedText(request, limit = 16000) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  const chunks = [];
  let size = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function permissions(value) {
  if (
    !Array.isArray(value) ||
    value.some((p) => typeof p !== "string" || !Object.hasOwn(PERMISSIONS, p))
  )
    throw new Error("INVALID_INPUT");
  const result = [...new Set(value)];
  if (result.includes("qr.write") && !result.includes("qr.read")) result.push("qr.read");
  if (result.includes("content.write") && !result.includes("content.read"))
    result.push("content.read");
  if (result.includes("accounts.manage") && !result.includes("accounts.read"))
    result.push("accounts.read");
  if (result.length && !result.includes("admin.view")) result.push("admin.view");
  return result;
}
const fail = (error, status) => json({ ok: false, error }, status);
export async function accessApi(request, env, actor) {
  const url = new URL(request.url),
    path = url.pathname.replace("/api/site-admin", "");
  if (!actor) return fail("AUTH_REQUIRED", 401);
  const isGet = request.method === "GET";
  if (!isGet && (request.method !== "POST" || request.headers.get("origin") !== url.origin))
    return fail("ORIGIN_REJECTED", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail("ORIGIN_REJECTED", 403);
  if (path === "/session" && isGet) return json({ ok: true, actor, permissionLabels: PERMISSIONS });
  const required =
    path === "/accounts"
      ? isGet
        ? "accounts.read"
        : "accounts.manage"
      : path === "/audit"
        ? "audit.read"
        : path === "/drafts"
          ? isGet
            ? "content.read"
            : "content.write"
          : "admin.view";
  if (!can(actor, required)) return fail("PERMISSION_DENIED", 403);
  try {
    if (path === "/overview" && isGet) {
      const counts = {};
      for (const [name, query] of [
        ["accounts", "SELECT COUNT(*) AS n FROM site_accounts WHERE disabled = 0"],
        [
          "sessions",
          "SELECT COUNT(*) AS n FROM site_sessions s JOIN site_accounts a ON a.id = s.account_id WHERE expires_at > ? AND a.disabled = 0 AND s.account_version = a.version",
        ],
        ["patterns", "SELECT COUNT(DISTINCT pattern_id) AS n FROM qr_pattern_versions"],
        ["drafts", "SELECT COUNT(*) AS n FROM site_content_drafts WHERE status != 'archived'"],
      ]) {
        if (["accounts", "sessions"].includes(name) && !can(actor, "accounts.read")) continue;
        if (name === "patterns" && !can(actor, "qr.read")) continue;
        if (name === "drafts" && !can(actor, "content.read")) continue;
        let statement = env.DB.prepare(query);
        if (name === "sessions") statement = statement.bind(Date.now());
        counts[name] = (await statement.first()).n;
      }
      return json({ ok: true, counts });
    }
    if (path === "/accounts" && isGet) {
      const rows = await env.DB.prepare(
        "SELECT a.id, a.username, a.display_name, a.disabled, a.version, a.created_at, a.last_login_at, r.role, r.permissions FROM site_accounts a JOIN staff_assignments r ON r.account_id = a.id ORDER BY a.created_at, a.id LIMIT 500",
      ).all();
      return json({ ok: true, accounts: rows.results.map(account) });
    }
    if (path === "/audit" && isGet) {
      const action = url.searchParams.get("action") || "";
      if (action.length > 60) return fail("INVALID_INPUT", 400);
      const rows = await env.DB.prepare(
        "SELECT id, actor_name, action, target, created_at FROM site_audit WHERE (? = '' OR action = ?) ORDER BY created_at DESC, id DESC LIMIT 101",
      )
        .bind(action, action)
        .all();
      return json({
        ok: true,
        entries: rows.results.slice(0, 100),
        hasMore: rows.results.length > 100,
      });
    }
    if (path === "/drafts" && isGet) {
      const rows = await env.DB.prepare(
        "SELECT * FROM site_content_drafts ORDER BY updated_at DESC LIMIT 200",
      ).all();
      return json({ ok: true, drafts: rows.results });
    }
    if (isGet || !["/accounts", "/drafts", "/activity"].includes(path))
      return fail("NOT_FOUND", 404);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return fail("INVALID_INPUT", 400);
    const data = JSON.parse(await boundedText(request));
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail("INVALID_INPUT", 400);
    if (path === "/activity") {
      if (
        !["view.section", "view.unavailable"].includes(data.action) ||
        typeof data.target !== "string" ||
        !/^[a-z-]{1,32}$/.test(data.target)
      )
        return fail("INVALID_INPUT", 400);
      await audit(env, actor, data.action, data.target);
      return json({ ok: true });
    }
    if (path === "/accounts") {
      if (
        !data ||
        typeof data !== "object" ||
        typeof data.displayName !== "string" ||
        !data.displayName.trim() ||
        data.displayName.length > 80
      )
        return fail("INVALID_INPUT", 400);
      const grants = permissions(data.permissions);
      if (data.action === "create") {
        if (
          typeof data.username !== "string" ||
          !/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(data.username) ||
          typeof data.password !== "string" ||
          data.password.length < 12 ||
          data.password.length > 200
        )
          return fail("INVALID_INPUT", 400);
        const id = crypto.randomUUID(),
          hash = await passwordHash(data.password);
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO site_accounts (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
          ).bind(id, data.username, data.displayName.trim(), hash, iso()),
          env.DB.prepare(
            "INSERT INTO staff_assignments (account_id, role, permissions) VALUES (?, ?, ?)",
          ).bind(id, "custom", JSON.stringify(grants)),
          auditStatement(env, actor, "account.created", data.username),
        ]);
        return json({ ok: true, id }, 201);
      }
      if (
        data.action !== "update" ||
        typeof data.id !== "string" ||
        !Number.isInteger(data.version) ||
        typeof data.disabled !== "boolean"
      )
        return fail("INVALID_INPUT", 400);
      const target = await env.DB.prepare(
        "SELECT a.*, r.role FROM site_accounts a JOIN staff_assignments r ON r.account_id = a.id WHERE a.id = ?",
      )
        .bind(data.id)
        .first();
      if (!target) return fail("NOT_FOUND", 404);
      if (target.role === "owner" || target.id === actor.id) return fail("OWNER_PROTECTED", 403);
      if (target.version !== data.version) return fail("VERSION_CONFLICT", 409);
      if (
        data.password !== undefined &&
        (typeof data.password !== "string" ||
          data.password.length < 12 ||
          data.password.length > 200)
      )
        return fail("INVALID_INPUT", 400);
      const hash = data.password ? await passwordHash(data.password) : target.password_hash;
      // A version-qualified UPDATE and assignment update share one transaction. Revocation is
      // enforced by matching session.account_version to account.version on every request.
      const changed = await env.DB.batch([
        env.DB.prepare(
          "UPDATE site_accounts SET display_name = ?, password_hash = ?, disabled = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING id",
        ).bind(data.displayName.trim(), hash, data.disabled ? 1 : 0, target.id, data.version),
        env.DB.prepare(
          "UPDATE staff_assignments SET permissions = ? WHERE account_id = ? AND changes() > 0",
        ).bind(JSON.stringify(grants), target.id),
        env.DB.prepare(
          "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
        ).bind(
          crypto.randomUUID(),
          actor.id,
          actor.displayName,
          data.password
            ? "account.password_reset"
            : data.disabled
              ? "account.disabled"
              : "account.updated",
          target.username,
          iso(),
        ),
      ]);
      if (!changed[0].results?.length) return fail("VERSION_CONFLICT", 409);
      return json({ ok: true });
    }
    if (path === "/drafts") {
      if (
        typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 120 ||
        typeof data.body !== "string" ||
        data.body.length > 5000 ||
        !["page", "event"].includes(data.kind) ||
        !["draft", "review", "archived"].includes(data.status) ||
        !Number.isInteger(data.version) ||
        data.version < 0 ||
        typeof data.id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(data.id)
      )
        return fail("INVALID_INPUT", 400);
      const mutation =
        data.version === 0
          ? env.DB.prepare(
              "INSERT INTO site_content_drafts (id, kind, title, body, status, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING RETURNING id",
            ).bind(data.id, data.kind, data.title.trim(), data.body, data.status, actor.id, iso())
          : env.DB.prepare(
              "UPDATE site_content_drafts SET title = ?, body = ?, status = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND kind = ? AND version = ? RETURNING id",
            ).bind(
              data.title.trim(),
              data.body,
              data.status,
              actor.id,
              iso(),
              data.id,
              data.kind,
              data.version,
            );
      const changed = await env.DB.batch([
        mutation,
        env.DB.prepare(
          "INSERT INTO site_audit (id, account_id, actor_name, action, target, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0",
        ).bind(crypto.randomUUID(), actor.id, actor.displayName, "draft.saved", data.id, iso()),
      ]);
      if (!changed[0].results?.length) return fail("VERSION_CONFLICT", 409);
      return json({ ok: true });
    }
    return fail("NOT_FOUND", 404);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint")) return fail("USERNAME_EXISTS", 409);
    if (error instanceof SyntaxError || error?.message === "INVALID_INPUT")
      return fail("INVALID_INPUT", 400);
    if (error?.message === "BODY_TOO_LARGE") return fail("BODY_TOO_LARGE", 413);
    return fail("STORAGE_UNAVAILABLE", 503);
  }
}
