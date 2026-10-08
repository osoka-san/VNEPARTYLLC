/** Offline synthetic tests; no live Auth/database, browser storage or real user data. */
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "vne-drafts-test-"));
const load = async (path) => {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const out = join(temp, path.split("/").at(-1) + ".mjs");
  await writeFile(out, result.outputFiles[0].text);
  return import(pathToFileURL(out));
};
const pass = (name) => console.log("PASS " + name);
try {
  const { emptyDraftPayload, parseDraftPayload, parseDraftRecord, parseDraftSaveCommand } =
    await load("src/lib/questionnaire-draft.ts");
  const { QuestionnaireDraftController: Controller } = await load(
    "src/lib/questionnaire-draft-controller.ts",
  );
  const { readOwnedQuestionnaireDraft, saveOwnedQuestionnaireDraft } = await load(
    "src/lib/questionnaire-draft.server.ts",
  );
  const owner = randomUUID(),
    other = randomUUID();
  const payload = emptyDraftPayload();
  payload.name = "SYNTHETIC";
  payload.contact = "unfinished@";
  payload.questionnaire.answers.interests = {
    selected: ["Музыка и звук"],
    custom: "ещё не законченный ответ из семи слов",
    useCustom: true,
    manual: ["Свой", ""],
  };
  payload.questionnaire.ratings.social_energy = 67;
  payload.resumeSection = "contact";
  assert.deepEqual(parseDraftPayload(payload), payload);
  assert.equal(parseDraftPayload({ ...payload, owner }), null);
  for (const modify of [
    (p) => (p.name = "x".repeat(81)),
    (p) => (p.questionnaire.answers.interests.custom = "🦋".repeat(61)),
    (p) => (p.questionnaire.age = 0),
    (p) => (p.questionnaire.age = "67"),
    (p) => (p.questionnaire.mode = null),
    (p) => (p.resumeSection = null),
    (p) => (p.questionnaire.answers.interests.selected = ["invented"]),
    (p) => (p.questionnaire.ratings.new_scale = 5),
    (p) => (p.contact += "\u0000"),
    (p) => (p.consent = true),
  ]) {
    const bad = structuredClone(payload);
    modify(bad);
    assert.equal(parseDraftPayload(bad), null);
  }
  const record = (id, version, p) => ({
    id,
    version,
    payload: structuredClone(p),
    savedAt: "2026-10-07T12:00:00.000Z",
    expiresAt: "2026-12-13T12:00:00.000Z",
  });
  assert.ok(parseDraftRecord(record(randomUUID(), 1, payload)));
  assert.equal(
    parseDraftRecord({ ...record(randomUUID(), 1, payload), expiresAt: "2027-01-01" }),
    null,
  );
  pass(
    "Partial answers, both input modes, unfinished email and ratings round-trip; strict schema/bounds reject unknown owner/consent fields",
  );
  let remote = null,
    submitted = false;
  let calls = [];
  const transport = {
    load: async () => ({
      ok: true,
      ownerUserId: owner,
      creationIssuedAt: new Date().toISOString(),
      draft: remote,
      submitted,
    }),
    save: async (command) => {
      calls.push(structuredClone(command));
      if (remote && (remote.id !== command.id || remote.version !== command.expectedVersion))
        return { ok: false, reason: "conflict" };
      remote = record(command.id, command.expectedVersion + 1, command.payload);
      return {
        ok: true,
        ownerUserId: owner,
        creationIssuedAt: new Date().toISOString(),
        draft: remote,
      };
    },
  };
  const c = new Controller(transport, randomUUID, 10);
  await c.load();
  assert.equal(c.state.phase, "ready");
  c.update({ name: "SYNTHETIC" });
  c.update({ contact: "unfinished@" });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, 1);
  assert.equal(c.state.phase, "saved");
  const firstSave = remote.savedAt;
  await c.revalidate();
  assert.equal(remote.savedAt, firstSave);
  assert.equal(calls.length, 1);
  const resumed = new Controller(transport, randomUUID);
  await resumed.load();
  assert.equal(resumed.state.payload.contact, "unfinished@");
  pass(
    "Debounce saves latest edits once; refresh/new controller restores partial data; viewing does not save/extend TTL",
  );
  resumed.update({ name: "DEVICE TWO" });
  await resumed.flush();
  c.update({ name: "STALE DEVICE ONE" });
  await c.flush();
  assert.equal(c.state.phase, "conflict");
  assert.equal(remote.payload.name, "DEVICE TWO");
  assert.equal(c.state.payload.name, "STALE DEVICE ONE");
  await c.load();
  assert.equal(c.state.payload.name, "DEVICE TWO");
  pass(
    "Stale device/version stops without overwriting remote or silently discarding local answers; explicit reload resolves",
  );
  let committed = null,
    uncertainCommand = null,
    loseResponse = true;
  const focusRetry = new Controller(
    {
      load: async () => ({
        ok: true,
        ownerUserId: owner,
        creationIssuedAt: new Date().toISOString(),
        draft: committed,
        submitted: false,
      }),
      save: async (command) => {
        if (uncertainCommand?.mutationId === command.mutationId)
          return {
            ok: true,
            ownerUserId: owner,
            creationIssuedAt: new Date().toISOString(),
            draft: committed,
          };
        committed = record(command.id, command.expectedVersion + 1, command.payload);
        uncertainCommand = structuredClone(command);
        if (loseResponse) {
          loseResponse = false;
          throw Error("lost response");
        }
        return {
          ok: true,
          ownerUserId: owner,
          creationIssuedAt: new Date().toISOString(),
          draft: committed,
        };
      },
    },
    randomUUID,
  );
  await focusRetry.load();
  focusRetry.update({ name: "COMMITTED" });
  await focusRetry.flush();
  focusRetry.update({ contact: "later@" });
  await focusRetry.revalidate();
  assert.equal(focusRetry.state.phase, "saved");
  assert.equal(committed.payload.contact, "later@");
  assert.equal(committed.version, 2);
  focusRetry.dispose();
  pass(
    "Focus after committed-but-lost response resolves original mutation and saves later edits without false conflict/data loss",
  );
  const corrected = new Controller(
    {
      load: transport.load,
      save: async (command) =>
        parseDraftPayload(command.payload)
          ? {
              ok: true,
              ownerUserId: owner,
              creationIssuedAt: new Date().toISOString(),
              draft: record(command.id, command.expectedVersion + 1, command.payload),
            }
          : { ok: false, reason: "invalid" },
    },
    randomUUID,
  );
  await corrected.load();
  corrected.update({ name: "bad\u0001" });
  await corrected.flush();
  assert.equal(corrected.state.phase, "error");
  corrected.update({ name: "FIXED" });
  await corrected.flush();
  assert.equal(corrected.state.phase, "saved");
  assert.equal(corrected.state.payload.name, "FIXED");
  corrected.dispose();
  pass(
    "Definitive validation failure releases rejected mutation so corrected input can save normally",
  );
  let release;
  const queue = new Controller(
    {
      load: transport.load,
      save: (command) =>
        new Promise((r) => {
          release = () =>
            r({
              ok: true,
              ownerUserId: owner,
              creationIssuedAt: new Date().toISOString(),
              draft: record(command.id, command.expectedVersion + 1, command.payload),
            });
        }),
    },
    randomUUID,
  );
  await queue.load();
  queue.update({ name: "FIRST" });
  const operation = queue.flush();
  queue.update({ name: "SECOND" });
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(queue.state.payload.name, "SECOND");
  assert.equal(queue.state.phase, "saving");
  release();
  await operation;
  assert.equal(queue.state.phase, "saved");
  assert.equal(queue.state.version, remote.version + 2);
  pass(
    "Edits during save queue serially; earlier acknowledgements never roll UI back to old answers",
  );
  let releaseLoad;
  const logoutRace = new Controller(
    {
      load: () =>
        new Promise((resolve) => {
          releaseLoad = resolve;
        }),
      save: transport.save,
    },
    randomUUID,
  );
  logoutRace.clear();
  const duringLogout = logoutRace.load();
  releaseLoad({
    ok: true,
    ownerUserId: owner,
    creationIssuedAt: new Date().toISOString(),
    draft: record(randomUUID(), 1, payload),
    submitted: false,
  });
  await duringLogout;
  assert.equal(logoutRace.state.payload.name, "SYNTHETIC");
  logoutRace.clear(); // second broadcast after successful server logout
  assert.equal(logoutRace.state.payload.name, "");
  const lateLoad = logoutRace.load();
  logoutRace.clear();
  releaseLoad({
    ok: true,
    ownerUserId: owner,
    creationIssuedAt: new Date().toISOString(),
    draft: record(randomUUID(), 1, payload),
    submitted: false,
  });
  await lateLoad;
  assert.equal(logoutRace.state.payload.name, "");
  logoutRace.dispose();
  pass(
    "Logout-completion invalidation clears any old-session reload during logout and rejects a late load result",
  );
  let attempts = [],
    fail = true;
  const retry = new Controller(
    {
      load: transport.load,
      save: async (command) => {
        attempts.push(structuredClone(command));
        if (fail) {
          fail = false;
          throw Error("RAW ANSWERS SHOULD NEVER LEAK");
        }
        return {
          ok: true,
          ownerUserId: owner,
          creationIssuedAt: new Date().toISOString(),
          draft: record(command.id, command.expectedVersion + 1, command.payload),
        };
      },
    },
    randomUUID,
  );
  await retry.load();
  retry.update({ name: "UNCERTAIN" });
  await retry.flush();
  assert.equal(retry.state.phase, "error");
  retry.update({ contact: "later@" });
  await retry.flush();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.notEqual(attempts[1].mutationId, attempts[2].mutationId);
  pass(
    "Lost response retries exact mutation/version/payload before later edits; network error never claims saved",
  );
  await queue.load();
  queue.update({ name: "PRIVATE" });
  const old = queue.flush();
  queue.clear();
  release();
  await old;
  assert.equal(queue.state.payload.name, "");
  assert.equal(queue.state.phase, "signin");
  const switched = new Controller(
    { load: transport.load, save: async () => ({ ok: false, reason: "session_changed" }) },
    randomUUID,
  );
  await switched.load();
  switched.update({ name: "PRIVATE" });
  await switched.flush();
  assert.equal(switched.state.payload.name, "");
  pass(
    "Logout/session change blanks memory and invalidates late saves; old answers cannot return through stale callbacks",
  );
  const expired = new Controller(
    { load: transport.load, save: async () => ({ ok: false, reason: "expired" }) },
    randomUUID,
  );
  await expired.load();
  expired.update({ name: "EXPIRED" });
  await expired.flush();
  assert.equal(expired.state.phase, "expired");
  submitted = true;
  remote = null;
  await resumed.revalidate();
  assert.equal(resumed.state.phase, "submitted");
  assert.equal(resumed.state.payload.name, "");
  pass(
    "Expired drafts require explicit restart; submitted state clears memory and prevents autosave resurrection",
  );
  let rpcCalls = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async () => {
      ++rpcCalls;
      return {
        data: { ownerUserId: other, draft: record(randomUUID(), 1, payload), submitted: false },
        error: null,
      };
    },
  };
  assert.deepEqual(await readOwnedQuestionnaireDraft(client), { ok: false, reason: "unavailable" });
  const command = {
    expectedOwnerUserId: other,
    creationIssuedAt: new Date().toISOString(),
    id: randomUUID(),
    expectedVersion: 0,
    mutationId: randomUUID(),
    payload,
  };
  assert.ok(parseDraftSaveCommand(command));
  assert.deepEqual(await saveOwnedQuestionnaireDraft(command, client), {
    ok: false,
    reason: "session_changed",
  });
  assert.equal(rpcCalls, 1);
  client.auth.getUser = async () => ({ data: { user: null }, error: null });
  assert.deepEqual(await readOwnedQuestionnaireDraft(client), { ok: false, reason: "signin" });
  assert.equal(rpcCalls, 1);
  pass(
    "Server validates Auth before RPC, rejects changed-session equality guard and foreign-owner responses",
  );
  [c, resumed, queue, retry, switched, expired].forEach((x) => x.dispose());
} finally {
  await rm(temp, { recursive: true, force: true });
}
