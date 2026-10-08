import { test } from "node:test";
import assert from "node:assert/strict";
import gate from "../scripts/auth/admin-gate.mjs";
import { testEnv } from "./site-access-fixture.mjs";
const origin = "https://vne.example.test";
function fixture() {
  const env = testEnv(),
    calls = [];
  const app = gate({
    fetch: async (request) => {
      calls.push(request.url);
      return new Response("<html><body>ВНЕ</body></html>", {
        headers: { "Content-Type": "text/html" },
      });
    },
  });
  const fetch = (path, init = {}, config = env) =>
    app.fetch(new Request(origin + path, init), config, {});
  const login = async (
    user = "synthetic-admin",
    password = env.VNE_ADMIN_PASSWORD,
    next = "/admin",
  ) =>
    fetch("/admin-login", {
      method: "POST",
      headers: { origin },
      body: new URLSearchParams({ username: user, password, next }),
    });
  const api = (path, cookie, payload, method) =>
    fetch("/api/site-admin/" + path, {
      method: method ?? (payload ? "POST" : "GET"),
      headers: { origin, cookie, "Content-Type": "application/json" },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  return { env, fetch, login, api, calls };
}
const cookie = (r) => r.headers.get("set-cookie").split(";")[0];

test("anonymous, no storage, forged token and unsafe origins fail closed", async () => {
  const f = fixture();
  assert.equal((await f.fetch("/", {}, {})).status, 503);
  assert.equal((await f.fetch("/admin")).status, 303);
  assert.equal((await f.fetch("/admin", { method: "POST" })).status, 401);
  assert.equal(
    (
      await f.fetch("/admin-login", {
        method: "POST",
        headers: { origin: "https://evil.test" },
        body: new URLSearchParams({ username: "x", password: "y" }),
      })
    ).status,
    403,
  );
  const bad = await f.login("synthetic-admin", "wrong");
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("set-cookie"), null);
  const response = await f.login();
  assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
  const token = cookie(response),
    tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
  assert.equal((await f.fetch("/admin", { headers: { cookie: tampered } })).status, 303);
  assert.equal(
    (await f.login("synthetic-admin", f.env.VNE_ADMIN_PASSWORD, "//evil.test")).headers.get(
      "location",
    ),
    "/",
  );
  assert.equal(f.calls.length, 0);
  f.env.sql.close();
});
test("testrev1 can view site/admin/QR and has a distinct database identity and audit", async () => {
  const f = fixture(),
    r = await f.login("testrev1", f.env.VNE_REVIEW_PASSWORD),
    c = cookie(r);
  assert.equal(r.status, 303);
  for (const path of ["/", "/admin", "/admin/qr-studio", "/admin/tickets"]) {
    const page = await f.fetch(path, { headers: { cookie: c } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "private, no-store");
  }
  const me = await (await f.api("session", c)).json();
  assert.equal(me.actor.username, "testrev1");
  assert.equal(me.actor.displayName, "Тестревью");
  assert.ok(!me.actor.permissions.includes("accounts.manage"));
  for (const path of ["accounts", "audit"]) assert.equal((await f.api(path, c)).status, 403);
  for (const path of ["accounts", "drafts"])
    assert.equal((await f.api(path, c, { action: "create" })).status, 403);
  assert.equal(
    (await f.fetch("/_serverFn/unknown", { method: "POST", headers: { origin, cookie: c } }))
      .status,
    403,
  );
  assert.equal(
    (await f.api("activity", c, { action: "view.section", target: "qr-studio" })).status,
    200,
  );
  const audit = f.env.sql
    .prepare("SELECT action FROM site_audit WHERE account_id = ?")
    .all("site-review-testrev1");
  assert.ok(audit.some((r) => r.action === "login.success"));
  assert.ok(audit.some((r) => r.action === "view.section"));
  assert.ok(
    f.env.sql
      .prepare("SELECT password_hash FROM site_accounts WHERE username=?")
      .get("testrev1")
      .password_hash.startsWith("pbkdf2:"),
  );
  assert.doesNotMatch(JSON.stringify(me), /password_hash|token_hash|synthetic-review-password/);
  f.env.sql.close();
});
test("owner creates user, grants rights, handles CAS, revokes sessions and blocks login", async () => {
  const f = fixture(),
    owner = cookie(await f.login());
  const user = {
    action: "create",
    username: "designer",
    displayName: "Дизайнер",
    password: "synthetic-designer-password",
    permissions: ["qr.write", "content.write"],
  };
  const created = await f.api("accounts", owner, user);
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  assert.equal((await f.api("accounts", owner, user)).status, 409);
  const login = await f.login("designer", user.password),
    dc = cookie(login);
  let me = await (await f.api("session", dc)).json();
  assert.ok(me.actor.permissions.includes("qr.read"));
  assert.ok(me.actor.permissions.includes("content.read"));
  assert.equal(
    (
      await f.api("accounts", dc, {
        ...user,
        username: "escalation",
        permissions: ["accounts.manage"],
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.api("accounts", owner, { ...user, username: "invalid", permissions: ["superadmin"] }))
      .status,
    400,
  );
  assert.equal(
    (
      await f.api("accounts", owner, {
        action: "update",
        id: "site-owner",
        version: 1,
        displayName: "Owner",
        permissions: [],
        disabled: true,
      })
    ).status,
    403,
  );
  const update = {
    action: "update",
    id,
    version: 1,
    displayName: user.displayName,
    permissions: ["admin.view", "qr.read"],
    disabled: false,
  };
  const race = await Promise.all([
    f.api("accounts", owner, update),
    f.api("accounts", owner, { ...update, permissions: ["admin.view"] }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await f.api("session", dc)).status, 401);
  const newc = cookie(await f.login("designer", user.password));
  assert.equal(
    (await f.api("accounts", owner, { ...update, version: 2, disabled: true })).status,
    200,
  );
  assert.equal((await f.api("session", newc)).status, 401);
  assert.equal((await f.login("designer", user.password)).status, 401);
  assert.equal(
    (
      await f.api("accounts", owner, {
        ...update,
        version: 3,
        password: "new-synthetic-password",
        disabled: false,
      })
    ).status,
    200,
  );
  assert.equal((await f.login("designer", user.password)).status, 401);
  assert.equal((await f.login("designer", "new-synthetic-password")).status, 303);
  const rows = await (await f.api("accounts", owner)).json();
  assert.doesNotMatch(
    JSON.stringify(rows),
    /password_hash|token_hash|synthetic-designer-password|new-synthetic-password/,
  );
  f.env.sql.close();
});
test("draft create/update/archive survives session, conflicts never write false audit", async () => {
  const f = fixture(),
    owner = cookie(await f.login());
  const draft = {
    id: crypto.randomUUID(),
    version: 0,
    kind: "event",
    title: "Синтетическое событие",
    body: "Test only",
    status: "draft",
  };
  assert.equal((await f.api("drafts", owner, draft)).status, 200);
  assert.equal(
    (await f.api("drafts", owner, { ...draft, version: 1, status: "review" })).status,
    200,
  );
  const count = f.env.sql.prepare("SELECT COUNT(*) n FROM site_audit").get().n;
  assert.equal(
    (await f.api("drafts", owner, { ...draft, version: 1, title: "stale" })).status,
    409,
  );
  assert.equal(f.env.sql.prepare("SELECT COUNT(*) n FROM site_audit").get().n, count);
  assert.equal(
    (await f.api("drafts", owner, { ...draft, version: 2, status: "archived" })).status,
    200,
  );
  const r = await (await f.api("drafts", cookie(await f.login()))).json();
  assert.equal(r.drafts[0].status, "archived");
  assert.equal(r.drafts[0].version, 3);
  assert.equal(
    (
      await f.fetch("/api/site-admin/drafts", {
        method: "POST",
        headers: { origin: "https://evil.test", cookie: owner, "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
    ).status,
    403,
  );
  const audit = await (await f.api("audit", owner)).json();
  assert.ok(audit.entries.some((x) => x.action === "draft.saved"));
  f.env.sql.close();
});
test("logout revokes replay, expiry enforced, rate limiter persists across handlers", async () => {
  const f = fixture(),
    c = cookie(await f.login());
  assert.equal((await f.fetch("/admin-logout")).status, 403);
  assert.equal(
    (await f.fetch("/admin-logout", { method: "POST", headers: { origin, cookie: c } })).status,
    303,
  );
  assert.equal((await f.api("session", c)).status, 401);
  const expired = cookie(await f.login());
  f.env.sql.prepare("UPDATE site_sessions SET expires_at=0").run();
  assert.equal((await f.api("session", expired)).status, 401);
  for (let i = 0; i < 8; i++) assert.equal((await f.login("no-user", "wrong")).status, 401);
  const second = gate({ fetch: () => new Response("unexpected") });
  assert.equal(
    (
      await second.fetch(
        new Request(origin + "/admin-login", {
          method: "POST",
          headers: { origin },
          body: new URLSearchParams({ username: "no-user", password: "wrong" }),
        }),
        f.env,
        {},
      )
    ).status,
    429,
  );
  f.env.sql.close();
});
