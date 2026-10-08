import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import gate from "../scripts/auth/admin-gate.mjs";
import { testEnv } from "./site-access-fixture.mjs";
async function bundle(file) {
  const r = await build({
    entryPoints: [file],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  return (
    await import(
      "data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64")
    )
  ).default;
}
const withMember = await bundle("scripts/auth/member-api.ts"),
  withRequests = await bundle("scripts/auth/requests-api.ts");
globalThis.fetch = async () => {
  throw new Error("Network disabled in cabinet tests");
};
const origin = "https://vne.example.test";
async function fixture() {
  const env = testEnv(),
    app = withMember(
      withRequests(gate({ fetch: async (r) => new Response(r.headers.get("x-vne-site-preview")) })),
    );
  const call = (path, cookie = "", data, headers = {}) =>
    app.fetch(
      new Request(origin + path, {
        method: data === undefined ? "GET" : "POST",
        headers: { cookie, origin, "content-type": "application/json", ...headers },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
      env,
      {},
    );
  const login = async (username, password) => {
    const r = await app.fetch(
      new Request(origin + "/admin-login", {
        method: "POST",
        headers: { origin },
        body: new URLSearchParams({ username, password }),
      }),
      env,
      {},
    );
    return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] };
  };
  const owner = (await login(env.VNE_ADMIN_USERNAME, env.VNE_ADMIN_PASSWORD)).cookie;
  await call("/api/site-admin/accounts", owner, {
    action: "create",
    username: "guest-a",
    password: "synthetic-guest-password",
    displayName: "Синтетический гость",
    permissions: [],
  });
  const guest = (await login("guest-a", "synthetic-guest-password")).cookie;
  const guestOther = (await login("guest-a", "synthetic-guest-password")).cookie;
  const reviewer = (await login("testrev1", env.VNE_REVIEW_PASSWORD)).cookie;
  return { env, call, login, owner, guest, guestOther, reviewer };
}
const form = () => ({
  id: crypto.randomUUID(),
  name: "Синтетический гость",
  email: "test@example.com",
  telegram: "test_guest",
  consent: true,
  questionnaire: [
    "interests",
    "social_role",
    "meeting_style",
    "trust",
    "boundaries",
    "discomfort",
    "motivation",
  ].map((questionId) => ({
    questionId,
    answers: [{ answer: "Тестовый ответ", source: "manual" }],
  })),
  ratings: { social_energy: 1, evening_pace: 100, spontaneity: 55 },
  age: 27,
});
const question = (id, version = 1) => ({
  id,
  version,
  operationId: crypto.randomUUID(),
  action: "request_info",
  note: "Internal secret must remain private",
  guestMessage: "Какой формат знакомства тебе ближе?",
});

test("cabinet requires a session, rejects cross-origin writes and stays separate from configured membership", async () => {
  const f = await fixture();
  assert.equal((await f.call("/api/site-member")).status, 401);
  assert.equal(
    (await f.call("/api/site-member", f.guest, undefined, { "sec-fetch-site": "cross-site" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call(
        "/api/site-member/profile",
        f.guest,
        { version: 1, displayName: "Имя" },
        { origin: "https://other.test" },
      )
    ).status,
    403,
  );
  assert.equal((await f.call("/api/site-admin/requests", f.guest)).status, 403);
  const own = await f.call("/api/site-member", f.guest);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(await own.text(), /password|permissions|token|role/);
  f.env.SUPABASE_URL = "https://configured.example.test";
  assert.equal((await f.call("/api/site-member", f.guest)).status, 409);
  f.env.sql.close();
});
test("only form submissions created by this account are shown; email coincidence and staff role grant no ownership", async () => {
  const f = await fixture(),
    a = form(),
    b = form();
  assert.equal((await f.call("/api/site-admin/requests/submit", f.guest, a)).status, 200);
  assert.equal((await f.call("/api/site-admin/requests/submit", f.reviewer, b)).status, 200);
  const list = await (await f.call("/api/site-member", f.guest)).json();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, a.id);
  assert.equal((await f.call(`/api/site-member?id=${b.id}`, f.guest)).status, 404);
  assert.equal((await f.call(`/api/site-member?id=${a.id}`, f.owner)).status, 404);
  assert.equal((await f.call(`/api/site-member?page=-1`, f.guest)).status, 400);
  assert.equal((await f.call(`/api/site-member?status=forged`, f.guest)).status, 400);
  const manual = { ...form(), action: "create", kind: "membership", details: "Manual staff entry" };
  assert.equal((await f.call("/api/site-admin/requests", f.owner, manual)).status, 200);
  assert.equal((await (await f.call("/api/site-member", f.owner)).json()).total, 0);
  f.env.sql.close();
});
test("staff question and guest answer complete a real round trip without exposing private notes or duplicating actions", async () => {
  const f = await fixture(),
    data = form();
  await f.call("/api/site-admin/requests/submit", f.guest, data);
  const q = question(data.id);
  assert.equal((await f.call("/api/site-admin/requests", f.owner, q)).status, 200);
  assert.equal((await f.call("/api/site-admin/requests", f.owner, q)).status, 200);
  const detail = await (await f.call(`/api/site-member?id=${data.id}`, f.guest)).json();
  assert.equal(detail.item.status, "needs_info");
  assert.equal(detail.history.filter((h) => h.action === "guest_question").length, 1);
  assert.equal(detail.history.find((h) => h.action === "guest_question").message, q.guestMessage);
  assert.doesNotMatch(JSON.stringify(detail), /Internal secret|actorName|actor_name/);
  const reply = {
    id: data.id,
    version: 2,
    operationId: crypto.randomUUID(),
    reply: "Знакомство через общее занятие",
  };
  assert.equal((await f.call("/api/site-member/reply", f.reviewer, reply)).status, 404);
  assert.equal(
    (await f.call("/api/site-member/reply", f.guest, { ...reply, version: 1 })).status,
    409,
  );
  assert.equal((await f.call("/api/site-member/reply", f.guest, reply)).status, 200);
  assert.equal((await f.call("/api/site-member/reply", f.guest, reply)).status, 200);
  assert.equal(
    (await f.call("/api/site-member/reply", f.guest, { ...reply, reply: "Другой ответ" })).status,
    409,
  );
  const updated = await (await f.call(`/api/site-admin/requests?id=${data.id}`, f.owner)).json();
  assert.equal(updated.item.status, "under_review");
  assert.equal(updated.item.version, 3);
  assert.equal(updated.item.note, q.note);
  assert.equal(updated.history.at(-1).note, reply.reply);
  assert.equal(updated.history.filter((h) => h.action === "member_reply").length, 1);
  const own = await (await f.call(`/api/site-member?id=${data.id}`, f.guest)).json();
  assert.equal(own.history.at(-1).reply, reply.reply);
  assert.equal(
    (
      await f.call("/api/site-member/reply", f.guest, {
        ...reply,
        version: 3,
        operationId: crypto.randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await (await f.call("/api/site-member?status=under_review", f.guest)).json()).total,
    1,
  );
  assert.equal(
    (await (await f.call("/api/site-member?status=needs_info", f.guest)).json()).total,
    0,
  );
  f.env.sql.close();
});
test("profile updates persist, preserve permissions and use version checks", async () => {
  const f = await fixture();
  assert.equal(
    (await f.call("/api/site-member/profile", f.guest, { version: 1, displayName: "   " })).status,
    400,
  );
  const saved = await f.call("/api/site-member/profile", f.guest, {
    version: 1,
    displayName: "Новое имя",
    role: "owner",
    permissions: ["admin.view"],
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).profile.version, 2);
  assert.equal(
    (await (await f.call("/api/site-member", f.guest)).json()).profile.displayName,
    "Новое имя",
  );
  assert.equal(
    (await f.call("/api/site-member/profile", f.guest, { version: 1, displayName: "Устаревшее" }))
      .status,
    409,
  );
  assert.equal((await f.call("/api/site-admin/accounts", f.guest)).status, 403);
  assert.equal((await f.call("/api/site-member", f.guestOther)).status, 200);
  const relogged = await f.login("guest-a", "synthetic-guest-password");
  assert.equal(relogged.status, 303);
  assert.equal(
    (await (await f.call("/api/site-member", relogged.cookie)).json()).profile.displayName,
    "Новое имя",
  );
  f.env.sql.close();
});
test("password change verifies current password, revokes other sessions and never records plaintext", async () => {
  const f = await fixture(),
    change = {
      version: 1,
      currentPassword: "synthetic-guest-password",
      password: "synthetic-new-password",
      confirmPassword: "synthetic-new-password",
    };
  assert.equal(
    (
      await f.call("/api/site-member/password", f.guest, {
        ...change,
        currentPassword: "incorrect",
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.call("/api/site-member/password", f.guest, { ...change, confirmPassword: "mismatch" }))
      .status,
    400,
  );
  assert.equal((await f.call("/api/site-member/password", f.guest, change)).status, 200);
  assert.equal((await f.call("/api/site-member", f.guest)).status, 200);
  assert.equal((await f.call("/api/site-member", f.guestOther)).status, 401);
  assert.equal((await f.login("guest-a", "synthetic-guest-password")).status, 401);
  assert.equal((await f.login("guest-a", "synthetic-new-password")).status, 303);
  assert.doesNotMatch(
    JSON.stringify(f.env.sql.prepare("SELECT * FROM site_audit").all()),
    /synthetic-new-password|synthetic-guest-password/,
  );
  const out = await f.call("/admin-logout", f.guest, {});
  assert.equal(out.status, 303);
  assert.equal((await f.call("/api/site-member", f.guest)).status, 401);
  f.env.sql.close();
});
test("password guessing is bounded and request spoofing cannot turn off the real membership backend", async () => {
  const f = await fixture();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await f.call("/api/site-member/password", f.guest, {
          version: 1,
          currentPassword: "wrong",
          password: "synthetic-new-password",
          confirmPassword: "synthetic-new-password",
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await f.call("/api/site-member/password", f.guest, {
        version: 1,
        currentPassword: "wrong",
        password: "synthetic-new-password",
        confirmPassword: "synthetic-new-password",
      })
    ).status,
    429,
  );
  assert.equal(await (await f.call("/member", f.guest)).text(), "true");
  assert.equal(
    (await f.call("/login?redirect=%2Fmember", f.guest)).headers.get("location"),
    "/member",
  );
  f.env.SUPABASE_URL = "https://configured.example.test";
  assert.equal(
    await (await f.call("/member", f.guest, undefined, { "x-vne-site-preview": "true" })).text(),
    "",
  );
  f.env.sql.close();
});
