/** Offline asynchronous timer-queue regression tests. No network, Auth or DB calls. */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
const dir = await mkdtemp(join(tmpdir(), "day07-preparation-"));
const compiled = await build({
  entryPoints: ["src/lib/admission/timed-qa-core.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
await writeFile(join(dir, "core.mjs"), compiled.outputFiles[0].text);
const {
  TimedQaSession,
  QA_ACTORS,
  QA_EVENT,
  QA_PART,
  QA_PASS,
  QA_PUBLIC_TOKEN,
  QA_BOUNDS,
  QA_RACE_PREPARE_LEAD_MS,
} = await import(pathToFileURL(join(dir, "core.mjs")));
const flush = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
const EPOCH = Date.parse("2026-10-08T18:38:00.000Z");
function harness(options = {}) {
  const opts = {
    mfaMs: 0,
    probeMs: [0, 0, 0],
    offsetMs: 0,
    readyMs: 0,
    dispatchMs: 10,
    replayMs: 10,
    ...options,
  };
  let mono = 0,
    wallStep = 0,
    seq = 0,
    probeIndex = 0,
    mfaIndex = 0,
    visible = true,
    online = true,
    original = null;
  const timers = new Map(),
    calls = [],
    events = [],
    states = [];
  const actor = QA_ACTORS[0];
  function schedule(fn, ms, interval = 0) {
    const id = ++seq;
    timers.set(id, { fn, at: mono + ms, interval });
    return id;
  }
  const wait = (ms) => new Promise((resolve) => schedule(resolve, ms));
  const port = {
    wall: () => EPOCH + mono + wallStep,
    mono: () => mono,
    visible: () => visible,
    online: () => online,
    timeout: (fn, ms) => schedule(fn, ms),
    clearTimeout: (id) => timers.delete(id),
    interval: (fn, ms) => schedule(fn, ms, ms),
    clearInterval: (id) => timers.delete(id),
    mfa: async () => {
      const start = mono,
        index = ++mfaIndex;
      events.push({ kind: "mfa_start", mono, index });
      const value = opts.mfaValue?.(index) ?? {
        ok: true,
        userId: actor,
        aal2: true,
        hasVerifiedTotp: true,
      };
      await wait(typeof opts.mfaMs === "function" ? opts.mfaMs(index) : opts.mfaMs);
      events.push({ kind: "mfa_finish", mono, index, duration: mono - start });
      return value;
    },
    command: async (c) => {
      calls.push(c);
      const start = mono,
        isClock = c.token === "DAY07_CLOCK_PROBE",
        isReady = c.action === "verify" && c.token === QA_PUBLIC_TOKEN,
        isReplay = c.action === "checkin" && original;
      const duration = isClock
        ? opts.probeMs[probeIndex++ % opts.probeMs.length]
        : isReady
          ? opts.readyMs
          : isReplay
            ? opts.replayMs
            : opts.dispatchMs;
      events.push({ kind: "post_start", token: c.token, action: c.action, mono });
      await wait(duration);
      events.push({
        kind: "post_finish",
        token: c.token,
        action: c.action,
        mono,
        duration: mono - start,
      });
      const receipt = isReplay
        ? { ...original }
        : {
            operationId: c.action === "checkin" ? c.operationId : null,
            correlationId: randomUUID(),
            action: c.action,
            outcome:
              c.action === "checkin" ? "simulated_accepted" : isReady ? "ready" : "invalid_token",
            eventId: QA_EVENT,
            participationId: c.action === "checkin" || isReady ? QA_PART : null,
            passId: c.action === "checkin" || isReady ? QA_PASS : null,
            version: c.action === "checkin" ? 2 : isReady ? 1 : null,
            generation: c.action === "checkin" || isReady ? 1 : null,
            actorId: actor,
            at: new Date(
              EPOCH + (isClock ? start + duration / 2 : mono) + opts.offsetMs,
            ).toISOString(),
            simulated: true,
            reentryAllowed: false,
          };
      if (c.action === "checkin" && !isReplay) original = { ...receipt };
      return {
        ok: true,
        events: [],
        qrText: null,
        secretUnavailable: true,
        replayed: !!isReplay,
        receipt,
      };
    },
  };
  const budget = { used: 0, invalidated: false },
    session = new TimedQaSession(port, budget),
    config = {
      runId: randomUUID(),
      actorId: actor,
      windowStart: new Date(EPOCH - 60000).toISOString(),
    };
  let phase = "";
  session.subscribe(() => {
    const s = session.snapshot();
    states.push({ mono, state: s });
    if (s.phase !== phase) {
      phase = s.phase;
      events.push({ kind: "phase", phase, message: s.message, mono, posts: s.posts });
    }
  });
  const h = {
    session,
    port,
    budget,
    config,
    calls,
    events,
    states,
    timers,
    opts,
    wall: port.wall,
    mono: port.mono,
    setVisible: (v) => (visible = v),
    setOnline: (v) => (online = v),
    stepWall: (ms) => (wallStep += ms),
    async advance(ms) {
      const end = mono + ms;
      for (;;) {
        await flush();
        const next = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, t] = next;
        assert.ok(t.at >= mono, "monotonic timer order");
        mono = t.at;
        if (t.interval) t.at += t.interval;
        else timers.delete(id);
        t.fn();
      }
      mono = end;
      await flush();
    },
    async throttle(ms) {
      mono += ms;
      for (const [id, t] of [...timers])
        if (t.at <= mono) {
          if (t.interval) t.at = mono + t.interval;
          else timers.delete(id);
          t.fn();
        }
      await flush();
    },
  };
  return h;
}
function validRehearsal(h) {
  const s = h.session.snapshot(),
    at = Date.parse(s.receipt.at),
    dispatch = Date.parse(s.dispatchAt),
    observed = Math.min(at, dispatch + 2),
    lockStart = observed - 100,
    released = observed + 1;
  const other = {
    ...s.receipt,
    actorId: QA_ACTORS.find((x) => x !== s.actorId),
    correlationId: randomUUID(),
    at: new Date(Math.max(at, released)).toISOString(),
  };
  const browsers = QA_ACTORS.map((actor) => ({
    dispatchedAt: s.dispatchAt,
    uncertaintyMs: s.uncertaintyMs,
    receipt: actor === s.actorId ? { ...s.receipt } : other,
  }));
  return {
    schema: "day07-rehearsal-v2",
    runId: s.runId,
    windowStart: s.windowStart,
    rehearsalTarget: s.rehearsalTarget,
    coordinatorVerdict: "REHEARSAL_RECONCILED",
    reconciledAt: new Date(Math.max(at, released) + 2).toISOString(),
    observer: {
      status: "REHEARSAL_TWO_BACKENDS_OBSERVED_NOT_ACTOR_ATTRIBUTED",
      phase: "verify",
      eventId: QA_EVENT,
      observerPid: 99,
      startAt: s.rehearsalTarget,
      lockAttemptAt: new Date(lockStart).toISOString(),
      lockAcquiredAt: new Date(lockStart + 1).toISOString(),
      observedAt: new Date(observed).toISOString(),
      lockReleasedAt: new Date(released).toISOString(),
      heldMs: released - lockStart,
      polls: 2,
      backends: [1, 2].map((pid) => ({
        pid,
        backendStart: new Date(lockStart - 10000).toISOString(),
        transactionStart: new Date(lockStart - 1000).toISOString(),
        queryStart: new Date(lockStart - 1).toISOString(),
        state: "active",
        waitType: "Lock",
        waitEvent: "transactionid",
        blockingPids: [99],
      })),
    },
    browsers,
  };
}

async function rehearsal(h) {
  h.session.prepareRehearsal(h.config, new Date(h.wall() + 60000).toISOString());
  await h.advance(64100);
  assert.equal(h.session.snapshot().phase, "rehearsal_done");
  h.session.acceptRehearsal(validRehearsal(h));
}
function planRace(h) {
  const target = new Date(h.wall() + 30000).toISOString(),
    operationId = randomUUID();
  h.session.prepareRace(h.config, target, operationId);
  return { target, operationId };
}
function noCheckin(h, posts = 7) {
  assert.equal(h.session.snapshot().phase, "cancelled");
  assert.equal(h.session.snapshot().posts, posts);
  assert.equal(h.calls.filter((c) => c.action === "checkin").length, 0);
  assert.equal(h.session.snapshot().dispatchAt, null);
  assert.equal(h.session.snapshot().receipt, null);
}
function assertSuccess(h, plan) {
  const s = h.session.snapshot();
  assert.equal(s.phase, "result", s.message);
  assert.equal(s.posts, 9);
  assert.equal(s.receipt.operationId, plan.operationId);
  assert.equal(s.target, plan.target);
  assert.equal(h.events.filter((e) => e.kind === "mfa_start").length, 3);
  assert.equal(h.calls.filter((c) => c.action === "checkin").length, 1);
  const finalMfa = h.events.find((e) => e.kind === "mfa_finish" && e.index === 3),
    armed = h.states.find((e) => e.state.phase === "race_armed"),
    sent = h.events.find((e) => e.kind === "post_start" && e.action === "checkin");
  assert.ok(armed.state.countdownMs <= QA_BOUNDS.maxArmLead);
  assert.ok(armed.state.countdownMs >= 500);
  assert.ok(sent.mono - finalMfa.mono + QA_BOUNDS.response <= QA_BOUNDS.identity);
  assert.ok(h.timers.size === 0);
}
await test("security bounds unchanged; race lead derives from bounded sequential work", () => {
  assert.deepEqual(QA_BOUNDS, {
    posts: 10,
    rtt: 1500,
    uncertainty: 751,
    identity: 15000,
    clock: 30000,
    tickGap: 200,
    lateness: 100,
    wallStep: 25,
    response: 4000,
    maxArmLead: 10000,
    minPlanLead: 30000,
    maxPlanLead: 120000,
    prepareLead: 10000,
  });
  assert.equal(QA_RACE_PREPARE_LEAD_MS, 22000);
});
for (const [label, opts] of [
  [
    "observed A RTTs + 3s MFA",
    { mfaMs: 3000, probeMs: [1178.1, 797.4, 564.9], offsetMs: 137, readyMs: 500 },
  ],
  [
    "observed B RTTs + 3s MFA",
    { mfaMs: 3000, probeMs: [1191, 795, 565], offsetMs: 129.5, readyMs: 500 },
  ],
  [
    "observed A RTTs + 2.5s MFA",
    { mfaMs: 2500, probeMs: [1178.1, 797.4, 564.9], offsetMs: 137, readyMs: 500 },
  ],
  ["near-bound MFA and all-good RTTs", { mfaMs: 3999, probeMs: [1500, 1500, 1500], readyMs: 3999 }],
  ["instant responses", { mfaMs: 0, probeMs: [0, 0, 0], readyMs: 0, dispatchMs: 0 }],
  [
    "one slow probe and near-bound MFA/ready",
    { mfaMs: 3999, probeMs: [3999, 1500, 1500], readyMs: 3999 },
  ],
  [
    "one slow probe, positive uncertainty-sized skew",
    { mfaMs: 3999, probeMs: [1500, 3999, 1500], readyMs: 3999, offsetMs: 751 },
  ],
  [
    "one slow probe, negative skew",
    { mfaMs: 3999, probeMs: [1500, 1500, 3999], readyMs: 3999, offsetMs: -751 },
  ],
])
  await test("asynchronous success: " + label, async () => {
    const h = harness();
    await rehearsal(h);
    Object.assign(h.opts, opts);
    const plan = planRace(h);
    await h.advance(35000);
    assertSuccess(h, plan);
    assert.ok(h.session.snapshot().preparationTimings.finalMfaMs < 4000);
  });
await test("new plan clears current receipt/dispatch while retaining immutable original rehearsal metadata", async () => {
  const h = harness();
  await rehearsal(h);
  const old = h.session.snapshot(),
    plan = planRace(h);
  let s = h.session.snapshot();
  assert.equal(s.dispatchAt, null);
  assert.equal(s.receipt, null);
  assert.deepEqual(s.rehearsalReceipt, old.receipt);
  assert.equal(s.rehearsalDispatchAt, old.dispatchAt);
  assert.equal(s.rehearsalTarget, old.target);
  h.session.cancel();
  noCheckin(h, 4);
  assert.equal(h.session.snapshot().target, plan.target);
  assert.equal(h.session.snapshot().rehearsalDispatchAt, old.dispatchAt);
});
for (const [label, value] of [
  ["wrong actor", { ok: true, userId: QA_ACTORS[1], aal2: true, hasVerifiedTotp: true }],
  ["missing AAL2", { ok: true, userId: QA_ACTORS[0], aal2: false, hasVerifiedTotp: true }],
  ["missing TOTP", { ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: false }],
  ["forbidden", { ok: false, reason: "forbidden" }],
])
  await test("fresh final identity rejects " + label, async () => {
    const h = harness();
    await rehearsal(h);
    h.opts.mfaValue = (i) => (i === 3 ? value : undefined);
    planRace(h);
    await h.advance(35000);
    noCheckin(h);
    assert.equal(h.calls.filter((c) => c.token === QA_PUBLIC_TOKEN).length, 0);
  });
for (const [stage, opts, posts] of [
  ["initial MFA", { mfaMs: (i) => (i === 2 ? 4000 : 0) }, 4],
  ["final MFA", { mfaMs: (i) => (i === 3 ? 4000 : 0) }, 7],
  ["clock probe", { probeMs: [4000, 0, 0] }, 5],
  ["ready verification", { readyMs: 4000 }, 8],
])
  await test("exact response deadline fails closed: " + stage, async () => {
    const h = harness();
    await rehearsal(h);
    Object.assign(h.opts, opts);
    planRace(h);
    await h.advance(35000);
    noCheckin(h, posts);
  });
for (const stage of ["guarded_wait", "final_mfa", "ready"])
  for (const kind of ["cancel", "hidden", "offline", "wall_step"])
    await test(stage + " invalidation: " + kind, async () => {
      const h = harness();
      await rehearsal(h);
      h.opts.mfaMs = (i) => (i === 3 ? 3000 : 0);
      h.opts.readyMs = 2000;
      planRace(h);
      await h.advance(stage === "guarded_wait" ? 10000 : stage === "final_mfa" ? 20500 : 23500);
      assert.equal(
        h.session.snapshot().phase,
        stage === "guarded_wait"
          ? "race_prepared"
          : stage === "final_mfa"
            ? "race_session_check"
            : "verifying_ready",
      );
      if (kind === "cancel") h.session.cancel();
      if (kind === "hidden") h.setVisible(false);
      if (kind === "offline") h.setOnline(false);
      if (kind === "wall_step") h.stepWall(26);
      await h.advance(15000);
      noCheckin(h, stage === "ready" ? 8 : 7);
      assert.equal(h.timers.size, 0);
    });
for (const ms of [201, 12000])
  await test("guarded wait rejects delayed timer " + ms + "ms without catch-up", async () => {
    const h = harness();
    await rehearsal(h);
    planRace(h);
    await h.advance(10000);
    await h.throttle(ms);
    await h.advance(35000);
    noCheckin(h);
    assert.equal(h.session.snapshot().message, "timer_throttled");
  });
await test("stale final MFA promise after cancellation cannot mutate known rehearsal or dispatch", async () => {
  const h = harness();
  await rehearsal(h);
  h.opts.mfaMs = (i) => (i === 3 ? 3999 : 0);
  planRace(h);
  await h.advance(20500);
  h.session.cancel();
  const s = h.session.snapshot();
  await h.advance(15000);
  assert.equal(h.session.snapshot(), s);
  noCheckin(h);
});
await test("stage UI callback cancellation is fenced before final MFA", async () => {
  const h = harness();
  await rehearsal(h);
  let cancelled = false;
  h.session.subscribe(() => {
    if (!cancelled && h.session.snapshot().phase === "race_prepared") {
      cancelled = true;
      h.session.cancel();
    }
  });
  planRace(h);
  await h.advance(35000);
  noCheckin(h);
  assert.equal(h.events.filter((e) => e.kind === "mfa_start").length, 2);
  assert.equal(h.timers.size, 0);
});
await test("large positive skew misses final stage and never reschedules", async () => {
  const h = harness();
  await rehearsal(h);
  Object.assign(h.opts, { mfaMs: 3000, probeMs: [1500, 1500, 1500], offsetMs: 10000 });
  const p = planRace(h);
  await h.advance(35000);
  noCheckin(h);
  assert.equal(h.session.snapshot().message, "preparation_late");
  assert.equal(h.session.snapshot().target, p.target);
});
await test("large negative skew expires 30s clock while waiting for final stage", async () => {
  const h = harness();
  await rehearsal(h);
  h.opts.offsetMs = -30000;
  planRace(h);
  await h.advance(65000);
  noCheckin(h);
  assert.equal(h.session.snapshot().message, "freshness_expired");
});
await test("one plan keeps caller inputs immutable and rejects repeated arms", async () => {
  const h = harness();
  await rehearsal(h);
  const config = { ...h.config },
    target = new Date(h.wall() + 30000).toISOString(),
    operationId = randomUUID();
  h.session.prepareRace(config, target, operationId);
  config.actorId = QA_ACTORS[1];
  config.windowStart = "bad";
  config.runId = randomUUID();
  assert.throws(() => h.session.prepareRace(h.config, target, randomUUID()), /already_armed/);
  await h.advance(10000);
  assert.throws(() => h.session.armRace(target, randomUUID()), /already_armed/);
  await h.advance(25000);
  assertSuccess(h, { target, operationId });
});
await test("exact replay is tenth POST; duplicates remain blocked", async () => {
  const h = harness();
  await rehearsal(h);
  const p = planRace(h);
  await h.advance(35000);
  assertSuccess(h, p);
  const command = h.calls.at(-1);
  const promise = h.session.replayWinner({
    operationId: p.operationId,
    primaryCount: 1,
    acceptedCount: 1,
    usedCount: 1,
  });
  await h.advance(5000);
  await promise;
  assert.equal(h.session.snapshot().phase, "replayed");
  assert.equal(h.session.snapshot().posts, 10);
  assert.equal(h.calls.at(-1), command);
  assert.ok(Object.isFrozen(command));
  await assert.rejects(
    h.session.replayWinner({
      operationId: p.operationId,
      primaryCount: 1,
      acceptedCount: 1,
      usedCount: 1,
    }),
    /coordinator_ack_required/,
  );
  assert.equal(h.calls.length, 10);
});
await test("replay exact 4s deadline remains uncertain with no further POST", async () => {
  const h = harness();
  await rehearsal(h);
  const p = planRace(h);
  await h.advance(35000);
  h.opts.replayMs = 4000;
  const promise = h.session.replayWinner({
    operationId: p.operationId,
    primaryCount: 1,
    acceptedCount: 1,
    usedCount: 1,
  });
  await h.advance(5000);
  await promise;
  assert.equal(h.session.snapshot().phase, "uncertain");
  assert.equal(h.session.snapshot().posts, 10);
  assert.equal(h.session.snapshot().receipt, null);
});
for (const phase of ["race_waiting", "race_armed"]) {
  await test(
    "synchronous cancellation at " + phase + " leaves no timer or late callbacks",
    async () => {
      const h = harness();
      await rehearsal(h);
      let cancelled = false;
      h.session.subscribe(() => {
        if (!cancelled && h.session.snapshot().phase === phase) {
          cancelled = true;
          h.session.cancel();
        }
      });
      if (phase === "race_waiting") assert.throws(() => planRace(h), /stale_response/);
      else planRace(h);
      await h.advance(25000);
      noCheckin(h, phase === "race_waiting" ? 4 : 8);
      assert.equal(h.timers.size, 0);
      const state = h.session.snapshot(),
        updates = h.states.length;
      await h.advance(40000);
      assert.equal(h.session.snapshot(), state);
      assert.equal(h.states.length, updates);
      assert.equal(h.timers.size, 0);
    },
  );
}
await rm(dir, { recursive: true, force: true });
