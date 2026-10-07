export type IssuerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ADMIN_KEY?: string;
  TOKEN_SECRET?: string;
  TOKEN_KEY_VERSION?: string;
  PUBLIC_ORIGIN?: string;
};
type Dict = Record<string, any>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenRe = /^[A-Za-z0-9_-]{43}$/;
const actions: Record<string, string> = {
  "/api/admin/issue": "issue",
  "/api/admin/catalog": "catalog",
  "/api/admin/list": "list",
  "/api/admin/get": "get",
  "/api/scan/catalog": "scanCatalog",
  "/api/admin/history": "history",
  "/api/admin/revoke": "revoke",
  "/api/scan/verify": "verify",
  "/api/scan/checkin": "checkin",
  "/api/pass/read": "read",
};
const errors = new Set([
  "forbidden",
  "invalid_input",
  "invalid_name",
  "invalid_design",
  "invalid_token",
  "invalid_valid_until",
  "event_not_found",
  "event_unavailable",
  "event_window_required",
  "event_capacity_reached",
  "participation_inactive",
  "ticket_exists",
  "pass_not_found",
  "idempotency_conflict",
  "version_conflict",
  "already_used",
]);
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const encoder = new TextEncoder();
export async function secretToken(
  secret: string,
  purpose: "view" | "scan",
  id: string,
  generation: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`vne-ticket:v1:${purpose}:${id}:${generation}`),
    ),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function equalSecret(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function object(v: unknown): v is Dict {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function checkedBody(input: unknown, action: string): Dict {
  if (!object(input)) throw new Error("invalid_input");
  const allowed: Record<string, string[]> = {
    issue: ["eventId", "participationId", "name", "access", "reason", "validUntil", "design"],
    catalog: [],
    scanCatalog: [],
    list: ["eventId", "query", "page"],
    get: ["id"],
    history: ["id"],
    revoke: ["id", "reason", "expectedVersion", "operationId"],
    verify: ["eventId", "token"],
    checkin: ["eventId", "token", "expectedVersion", "operationId"],
    read: ["token"],
  };
  if (Object.keys(input).some((k) => !allowed[action]?.includes(k)))
    throw new Error("invalid_input");
  for (const k of ["eventId", "participationId", "id", "operationId"])
    if (input[k] != null && !uuid.test(input[k])) throw new Error("invalid_input");
  if (["issue", "verify", "checkin"].includes(action) && !uuid.test(input.eventId ?? ""))
    throw new Error("invalid_input");
  if (["get", "history", "revoke"].includes(action) && !uuid.test(input.id ?? ""))
    throw new Error("invalid_input");
  if (["verify", "checkin", "read"].includes(action) && !tokenRe.test(input.token ?? ""))
    throw new Error("invalid_token");
  if (
    ["revoke", "checkin"].includes(action) &&
    (!uuid.test(input.operationId ?? "") ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1)
  )
    throw new Error("invalid_input");
  if (action === "issue") {
    if (!["GENERAL", "VIP", "SECURITY", "ARTIST"].includes(input.access))
      throw new Error("invalid_input");
    if (
      !input.participationId &&
      (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 80)
    )
      throw new Error("invalid_name");
    if (
      typeof input.reason !== "string" ||
      input.reason.trim().length < 3 ||
      input.reason.length > 300
    )
      throw new Error("invalid_input");
    if (
      input.validUntil != null &&
      (typeof input.validUntil !== "string" || !Number.isFinite(Date.parse(input.validUntil)))
    )
      throw new Error("invalid_valid_until");
    if (input.design != null) {
      const d = input.design,
        p = d?.pattern;
      if (
        !object(d) ||
        Object.keys(d).some((k) => !["engineVersion", "pattern"].includes(k)) ||
        typeof d.engineVersion !== "string" ||
        d.engineVersion.length > 40 ||
        !object(p) ||
        p.schema !== 1 ||
        (p.template !== undefined &&
          ![
            "coupling",
            "syncopa",
            "dialogue",
            "flow",
            "circle",
            "shift",
            "ribs",
            "folds",
            "enamel",
            "relief",
            "basalt",
            "portals",
            "weave",
            "origami",
            "constellation",
            "marble",
          ].includes(p.template)) ||
        !["syncopa", "flow"].includes(p.geometry) ||
        !["mint", "night", "paper"].includes(p.palette) ||
        typeof p.rounding !== "number" ||
        p.rounding < 0 ||
        p.rounding > 0.46 ||
        typeof p.accents !== "boolean" ||
        typeof p.name !== "string" ||
        p.name.length > 60 ||
        typeof p.event !== "string" ||
        p.event.length > 100 ||
        Object.keys(p).some(
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
        throw new Error("invalid_design");
    }
  }
  if (
    action === "revoke" &&
    (typeof input.reason !== "string" ||
      input.reason.trim().length < 3 ||
      input.reason.length > 300)
  )
    throw new Error("invalid_input");
  if (
    action === "list" &&
    ((input.page != null &&
      (!Number.isSafeInteger(input.page) || input.page < 0 || input.page > 10000)) ||
      (input.query != null && (typeof input.query !== "string" || input.query.length > 80)))
  )
    throw new Error("invalid_input");
  return input;
}
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("invalid_input");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_input");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const v = await reader.read();
    if (v.done) break;
    size += v.value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    parts.push(v.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("invalid_input");
  }
}
export function createIssuer(env: IssuerEnv, fetcher: typeof fetch = fetch) {
  async function rpc(name: string, args: Dict, jwt?: string) {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) {
      const message = object(data) ? String(data.message ?? "") : "";
      throw new Error(
        errors.has(message)
          ? message
          : response.status === 401 || response.status === 403
            ? "forbidden"
            : "database_unavailable",
      );
    }
    return data as Dict;
  }
  async function decorated(row: Dict | null, includeQr = true) {
    if (!row) return null;
    if (row.tokenKeyVersion !== env.TOKEN_KEY_VERSION) throw new Error("token_key_unavailable");
    const { qrEligible, generation, tokenKeyVersion, ...dto } = row;
    return {
      ...dto,
      qrText:
        includeQr && qrEligible
          ? `VNE1:${await secretToken(env.TOKEN_SECRET!, "scan", row.id, generation)}`
          : null,
    };
  }
  async function issued(data: Dict) {
    const row = data.pass;
    if (!object(row)) throw new Error("database_unavailable");
    const pass = await decorated(row);
    const view = await secretToken(env.TOKEN_SECRET!, "view", row.id, row.generation);
    return {
      pass,
      url: `${env.PUBLIC_ORIGIN}/pass#${view}`,
      duplicate: data.duplicate === true,
      delivery: [],
    };
  }
  return async function handle(request: Request) {
    const url = new URL(request.url),
      path = url.pathname.slice(url.pathname.indexOf("/api/"));
    if (url.pathname.endsWith("/health") && request.method === "GET")
      return json({ service: "vne-ticket-issuer", contract: 2 });
    const action = actions[path];
    if (!action) return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (
      !env.SUPABASE_URL?.startsWith("https://") ||
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.ADMIN_KEY ||
      env.ADMIN_KEY.length < 32 ||
      !env.TOKEN_SECRET ||
      env.TOKEN_SECRET.length < 43 ||
      !env.TOKEN_KEY_VERSION ||
      !env.PUBLIC_ORIGIN?.startsWith("https://")
    )
      return json({ error: "not_configured" }, 503);
    let jwt: string | undefined;
    if (action !== "read") {
      const key = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (!(await equalSecret(key, env.ADMIN_KEY))) return json({ error: "unauthorized" }, 401);
      jwt = request.headers.get("x-vne-user-jwt") ?? "";
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt))
        return json({ error: "forbidden" }, 403);
    }
    try {
      const input = checkedBody(await readBody(request), action);
      if (action === "scanCatalog") return json(await rpc("ticket_scan_catalog", {}, jwt));
      if (action === "issue") {
        const operation = request.headers.get("idempotency-key");
        if (!uuid.test(operation ?? "")) throw new Error("invalid_input");
        const id = crypto.randomUUID(),
          view = await secretToken(env.TOKEN_SECRET, "view", id, 1),
          scan = await secretToken(env.TOKEN_SECRET, "scan", id, 1);
        const data = await rpc(
          "ticket_issue",
          {
            _input: input,
            _id: id,
            _view_hash: await sha256(view),
            _scan_hash: await sha256(scan),
            _key_version: env.TOKEN_KEY_VERSION,
            _operation: operation,
          },
          jwt,
        );
        return json(await issued(data));
      }
      if (action === "read") {
        const row = await rpc("ticket_read", { _token: input.token });
        if (!row) return json({ error: "pass_not_found" }, 404);
        return json({ pass: await decorated(row) });
      }
      if (action === "verify" || action === "checkin") {
        const data = await rpc(
          "ticket_scan",
          { _input: { ...input, consume: action === "checkin" } },
          jwt,
        );
        return json({ ...data, ...(data.pass ? { pass: await decorated(data.pass, false) } : {}) });
      }
      const data = await rpc("ticket_admin", { _action: action, _input: input }, jwt);
      if (action === "get" || action === "revoke") return json(await issued(data));
      if (action === "list")
        return json({
          items: await Promise.all((data.items ?? []).map((row: Dict) => decorated(row, false))),
        });
      return json(data);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const status =
        code === "forbidden"
          ? 403
          : code === "body_too_large"
            ? 413
            : code === "pass_not_found"
              ? 404
              : errors.has(code)
                ? 400
                : 503;
      return json(
        {
          error:
            errors.has(code) || ["body_too_large", "token_key_unavailable"].includes(code)
              ? code
              : "service_unavailable",
        },
        status,
      );
    }
  };
}
