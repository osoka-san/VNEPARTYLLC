import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import gate from "../scripts/auth/admin-gate.mjs";
import { testEnv } from "./site-access-fixture.mjs";

const built = await build({
  entryPoints: ["scripts/auth/requests-api.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { default: withRequests } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);
globalThis.fetch = async () => {
  throw new Error("Network disabled in queue tests");
};
const origin = "https://vne.example.test";
async function fixture() {
  const env = testEnv();
  const app = withRequests(gate({ fetch: async () => new Response("<html>VNE</html>") }));
  const call = (path, cookie = "", data, override = {}) =>
    app.fetch(
      new Request(origin + "/api/site-admin/requests" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: { origin, cookie, "Content-Type": "application/json", ...override },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
      env,
      {},
    );
  const login = async (username, password) => {
    const result = await app.fetch(
      new Request(origin + "/admin-login", {
        method: "POST",
        headers: { origin },
        body: new URLSearchParams({ username, password }),
      }),
      env,
      {},
    );
    assert.equal(result.status, 303);
    return result.headers.get("set-cookie").split(";")[0];
  };
  const owner = await login(env.VNE_ADMIN_USERNAME, env.VNE_ADMIN_PASSWORD);
  const reviewer = await login("testrev1", env.VNE_REVIEW_PASSWORD);
  return { env, owner, reviewer, call };
}
const entry = (overrides = {}) => ({
  id: crypto.randomUUID(),
  action: "create",
  kind: "membership",
  name: "Тестовый гость",
  email: "synthetic@example.com",
  telegram: "test_guest",
  details: "Синтетические данные",
  event: "",
  ...overrides,
});
const completeQuestions = () =>
  [
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
  }));
const application = (overrides = {}) =>
  entry({
    consent: true,
    questionnaire: completeQuestions(),
    ratings: { social_energy: 1, evening_pace: 100, spontaneity: 73 },
    age: 27,
    ...overrides,
  });
const decision = (id, version, action, note = "Проверено на тестовых данных") => ({
  id,
  version,
  action,
  note,
  operationId: crypto.randomUUID(),
});

test("questionnaire answers survive submission and staff detail retrieval with canonical labels", async () => {
  const f = await fixture();
  const data = application({
    consent: true,
    details: "Client must not override question labels",
    questionnaire: [
      ...completeQuestions().filter(
        (item) => !["interests", "trust", "motivation"].includes(item.questionId),
      ),
      {
        questionId: "interests",
        question: "Forged heading",
        answer: "Музыка и звук",
        source: "choice",
      },
      { questionId: "trust", answer: "Держит слово", source: "manual" },
      { questionId: "motivation", answer: "Послушать любимого артиста", source: "custom" },
    ],
    ratings: { social_energy: 1, evening_pace: 100, spontaneity: 73 },
    age: 27,
  });
  assert.equal((await f.call("/submit", f.reviewer, data)).status, 200);
  const result = await (await f.call("?id=" + data.id, f.owner)).json();
  assert.match(result.item.details, /Что увлекает тебя сильнее всего\?\nМузыка и звук/);
  assert.match(result.item.details, /Держит слово/);
  assert.match(result.item.details, /Послушать любимого артиста/);
  assert.match(result.item.details, /Сколько общения тебе хочется этой ночью\?\n1 из 100/);
  assert.match(result.item.details, /Какой ритм вечера тебе ближе\?\n100 из 100/);
  assert.match(result.item.details, /Насколько тебе комфортна спонтанность\?\n73 из 100/);
  assert.match(result.item.details, /Возраст\n27/);
  assert.doesNotMatch(result.item.details, /Forged|Client must/);
  assert.equal(result.item.status, "submitted");
  assert.equal((await f.call("/submit", f.reviewer, data)).status, 200);
  assert.equal((await (await f.call("/config", f.owner)).json()).questionnaireVersion, 3);
  f.env.sql.close();
});

test("numeric answers reject coercion and out-of-range values without saving partial requests", async () => {
  const f = await fixture();
  for (const numeric of [
    { ratings: null },
    { ratings: [] },
    { ratings: { unknown: 50 } },
    ...[0, 101, 50.5, "50", false].map((value) => ({ ratings: { social_energy: value } })),
    ...[0, 101, 25.5, "25", false].map((age) => ({ age })),
  ]) {
    const response = await f.call("/submit", f.reviewer, application(numeric));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "QUESTIONNAIRE_INVALID_INPUT");
  }
  assert.equal((await (await f.call("", f.owner)).json()).total, 0);
  const data = entry({
    consent: true,
    questionnaire: [],
    ratings: { social_energy: null },
    age: null,
  });
  assert.equal(
    (await f.call("/submit", f.reviewer, data)).status,
    400,
    "empty questionnaire is now required",
  );
  assert.equal((await (await f.call("", f.owner)).json()).total, 0);
  f.env.sql.close();
});

test("the server rejects malformed, unknown, duplicate and over-limit questionnaire answers", async () => {
  const f = await fixture();
  const valid = { questionId: "interests", answer: "Музыка и звук", source: "choice" };
  for (const questionnaire of [
    {},
    [null],
    [valid, valid],
    [{ ...valid, questionId: "__proto__" }],
    [{ ...valid, answer: "Один два три четыре пять шесть", source: "manual" }],
    [{ ...valid, answer: "а".repeat(121), source: "custom" }],
    [{ ...valid, answer: "Invented preset" }],
    [{ ...valid, source: "trusted" }],
  ]) {
    const response = await f.call("/submit", f.reviewer, entry({ consent: true, questionnaire }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "QUESTIONNAIRE_INVALID_INPUT");
  }
  assert.equal((await (await f.call("", f.owner)).json()).total, 0);
  f.env.sql.close();
});

test("all fields are required and up to three answers per question survive staff retrieval", async () => {
  const f = await fixture();
  const choice = { answer: "Музыка и звук", source: "choice" };
  const full = application();
  for (const patch of [
    { questionnaire: undefined },
    { questionnaire: completeQuestions().slice(1) },
    { ratings: { social_energy: 50, evening_pace: 50 } },
    { ratings: { ...full.ratings, spontaneity: null } },
    { age: null },
    ...[
      [],
      [choice, choice],
      [choice, choice, choice, choice],
      [
        { answer: "Свой ответ", source: "custom" },
        { answer: "Другой ответ", source: "custom" },
      ],
      [{ answer: "", source: "manual" }],
    ].map((answers) => ({
      questionnaire: [{ questionId: "interests", answers }, ...completeQuestions().slice(1)],
    })),
  ]) {
    const response = await f.call("/submit", f.reviewer, { ...full, ...patch });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "QUESTIONNAIRE_INVALID_INPUT");
  }
  assert.equal((await (await f.call("", f.owner)).json()).total, 0);
  const longest = application({
    questionnaire: completeQuestions().map((item) => ({
      questionId: item.questionId,
      answers: ["а", "б", "в"].map((letter) => ({ answer: letter.repeat(120), source: "manual" })),
    })),
  });
  assert.equal((await f.call("/submit", f.reviewer, longest)).status, 200);
  const saved = await (await f.call("?id=" + longest.id, f.owner)).json();
  assert.ok(saved.item.details.length > 2000 && saved.item.details.length <= 4000);
  assert.equal((saved.item.details.match(/• /g) || []).length, 21);
  assert.equal((await f.call("/submit", f.reviewer, longest)).status, 200);
  f.env.sql.close();
});

test("queue access, CSRF and backend boundaries remain enforced", async () => {
  const f = await fixture();
  assert.equal((await f.call("")).status, 401);
  assert.equal((await f.call("", "__Host-vne-admin=forged")).status, 401);
  assert.equal((await f.call("", f.reviewer, entry())).status, 403);
  assert.equal(
    (await f.call("", f.owner, entry(), { origin: "https://evil.example" })).status,
    403,
  );
  assert.equal(
    (await f.call("", f.owner, undefined, { "sec-fetch-site": "cross-site" })).status,
    403,
  );
  assert.equal((await f.call("?status=__proto__", f.owner)).status, 400);
  assert.equal((await f.call("?page=-1", f.owner)).status, 400);
  f.env.VNE_SUPABASE_URL = "https://configured.example";
  assert.equal((await (await f.call("/config", f.owner)).json()).enabled, false);
  assert.equal((await f.call("", f.owner, entry())).status, 409);
  f.env.sql.close();
});

test("membership submission persists once, keeps event interest separate, and never creates admission", async () => {
  const f = await fixture(),
    data = application({ event: "light-study-01", kind: "event" });
  assert.equal((await f.call("/submit", f.reviewer, { ...data, consent: false })).status, 400);
  const accountsBefore = f.env.sql.prepare("SELECT COUNT(*) AS n FROM site_accounts").get().n;
  const submit = await f.call("/submit", f.reviewer, data);
  assert.equal(submit.status, 200);
  assert.equal((await f.call("/submit", f.reviewer, data)).status, 200);
  assert.equal(
    (await f.call("/submit", f.reviewer, { ...data, name: "Другие данные" })).status,
    409,
  );
  const result = await (await f.call("?kind=membership&q=ТЕСТОВЫЙ", f.owner)).json();
  assert.equal(result.total, 1);
  assert.equal(result.items[0].kind, "membership");
  assert.equal(result.items[0].eventKey, "light-study-01");
  assert.equal((await (await f.call("?kind=event", f.owner)).json()).total, 0);
  const detail = await (await f.call("?id=" + data.id, f.reviewer)).json();
  assert.equal(detail.history.length, 1);
  assert.equal(detail.item.source, "form");
  assert.equal(
    f.env.sql.prepare("SELECT COUNT(*) AS n FROM site_audit WHERE action='request.created'").get()
      .n,
    1,
  );
  assert.equal(
    f.env.sql.prepare("SELECT COUNT(*) AS n FROM site_accounts").get().n,
    accountsBefore,
  );
  f.env.sql.close();
});

test("moderation checks state/version, requires reasons, and commits history with the decision", async () => {
  const f = await fixture(),
    data = entry({ kind: "event", event: "threshold-study-02" });
  assert.equal((await f.call("", f.owner, data)).status, 200);
  assert.equal((await f.call("", f.reviewer, decision(data.id, 1, "approve"))).status, 403);
  assert.equal((await f.call("", f.owner, decision(data.id, 1, "reject", ""))).status, 400);
  const take = decision(data.id, 1, "take");
  assert.equal((await f.call("", f.owner, take)).status, 200);
  assert.equal((await f.call("", f.owner, take)).status, 200, "retry is idempotent");
  assert.equal(
    (await f.call("", f.owner, decision(data.id, 1, "approve"))).status,
    409,
    "stale editor loses no work silently",
  );
  assert.equal((await f.call("", f.owner, decision(data.id, 2, "request_info"))).status, 200);
  assert.equal(
    (await f.call("", f.owner, decision(data.id, 3, "approve"))).status,
    409,
    "unresolved clarification cannot be skipped",
  );
  assert.equal((await f.call("", f.owner, decision(data.id, 3, "resume"))).status, 200);
  assert.equal((await f.call("", f.owner, decision(data.id, 4, "approve"))).status, 200);
  assert.equal((await f.call("", f.owner, decision(data.id, 5, "reopen"))).status, 200);
  assert.equal((await f.call("", f.owner, decision(data.id, 6, "note"))).status, 200);
  const result = await (await f.call("?id=" + data.id, f.owner)).json();
  assert.equal(result.item.version, 7);
  assert.equal(result.item.status, "under_review");
  assert.equal(result.history.length, 7);
  assert.equal(
    f.env.sql.prepare("SELECT COUNT(*) AS n FROM site_audit WHERE action LIKE 'request.%'").get().n,
    7,
  );
  f.env.sql.close();
});

test("pagination, filters, literal search, and actor creation limits", async () => {
  const f = await fixture();
  for (let i = 0; i < 30; i++)
    assert.equal((await f.call("", f.owner, entry({ name: "Гость " + i }))).status, 200);
  assert.equal((await f.call("", f.owner, entry())).status, 429);
  const page = await (await f.call("?kind=membership&page=1", f.reviewer)).json();
  assert.equal(page.total, 30);
  assert.equal(page.items.length, 10);
  assert.equal(
    (await (await f.call("?q=%25", f.owner)).json()).total,
    0,
    "percent is literal, not a wildcard",
  );
  assert.equal((await (await f.call("?event=light-study-01", f.owner)).json()).total, 0);
  assert.equal((await (await f.call("?status=approved", f.owner)).json()).total, 0);
  f.env.sql.close();
});

test("audit failure rolls the decision back atomically", async () => {
  const f = await fixture(),
    data = entry();
  await f.call("", f.owner, data);
  f.env.sql.exec(
    "CREATE TRIGGER reject_request_audit BEFORE INSERT ON site_audit WHEN NEW.action = 'request.approve' BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END",
  );
  assert.equal((await f.call("", f.owner, decision(data.id, 1, "approve"))).status, 503);
  const result = await (await f.call("?id=" + data.id, f.owner)).json();
  assert.equal(result.item.status, "submitted");
  assert.equal(result.item.version, 1);
  assert.equal(result.history.length, 1);
  f.env.sql.close();
});

test("upgrade gives the existing reviewer read-only access and preserves custom permissions", () => {
  const sql = new DatabaseSync(":memory:");
  for (const name of [
    "0000_puzzling_frightful_four",
    "0001_site_review_workspace",
    "0002_preview_settings_defaults",
  ])
    sql.exec(readFileSync("drizzle/" + name + ".sql", "utf8"));
  for (const [id, role, permissions] of [
    ["site-owner", "owner", ["admin.view"]],
    ["site-review-testrev1", "reviewer", ["admin.view", "qr.read"]],
    ["custom", "reviewer", ["admin.view"]],
  ]) {
    sql
      .prepare(
        "INSERT INTO site_accounts(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)",
      )
      .run(id, id, id, "synthetic-migration-fixture", "2026-10-06T00:00:00.000Z");
    sql
      .prepare("INSERT INTO staff_assignments(account_id,role,permissions) VALUES(?,?,?)")
      .run(id, role, JSON.stringify(permissions));
  }
  sql.exec(readFileSync("drizzle/0003_site_request_queues.sql", "utf8"));
  const perms = (id) =>
    JSON.parse(
      sql.prepare("SELECT permissions FROM staff_assignments WHERE account_id=?").get(id)
        .permissions,
    );
  assert.ok(perms("site-owner").includes("requests.manage"));
  assert.ok(perms("site-review-testrev1").includes("requests.read"));
  assert.ok(!perms("site-review-testrev1").includes("requests.manage"));
  assert.deepEqual(perms("custom"), ["admin.view"]);
  sql.close();
});
