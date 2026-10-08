import assert from "node:assert/strict";
import { OwnerPassController } from "../../src/components/admission/owner-controller.ts";
import {
  stepOwnerSpring,
  OWNER_ANGLE_LIMIT,
  OWNER_CLICK_IMPULSE,
} from "../../src/components/admission/OwnerPassModel.ts";
const id = "11111111-1111-4111-8111-111111111111",
  op = "22222222-2222-4222-8222-222222222222",
  token = "VNE2:" + "a".repeat(43);
const initial = {
  participationId: id,
  eventId: id,
  eventTitle: "Synthetic",
  timezone: "Europe/Moscow",
  qrReleaseAt: null,
  addressRevealAt: null,
  entryOpensAt: null,
  entryClosesAt: null,
  passId: null,
  version: 0,
  generation: 0,
  status: "not_issued",
  secretContract: "explicit-rotation-v2",
  secretUnavailable: false,
  simulated: true,
  reentryAllowed: false,
};
const active = {
  ...initial,
  passId: id,
  version: 1,
  generation: 1,
  status: "active",
  secretUnavailable: true,
};
const receipt = {
  operationId: op,
  correlationId: id,
  action: "issue",
  outcome: "issued",
  eventId: id,
  participationId: id,
  passId: id,
  generation: 1,
  version: 1,
  actorId: id,
  at: "2026-10-08T00:00:00Z",
  simulated: true,
  reentryAllowed: false,
};
const issued = {
  ok: true,
  receipt,
  events: [],
  qrText: token,
  replayed: false,
  secretUnavailable: false,
};
const readResult = (pass) => ({ ok: true, items: [], pass, address: null });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup() {
  const h = { pass: initial, commands: [], reads: [], queue: [], nextRead: null };
  h.c = new OwnerPassController(id, id, {
    read: async (input) => {
      h.reads.push(input);
      if (h.nextRead) {
        const value = h.nextRead;
        h.nextRead = null;
        return value.promise;
      }
      return input.action === "address"
        ? {
            ok: true,
            items: [],
            pass: null,
            address: {
              outcome: "ready",
              addressAvailable: true,
              address: "Synthetic venue",
              addressRevealAt: null,
              timezone: null,
            },
          }
        : readResult(h.pass);
    },
    command: (input) => {
      assert.equal(h.c.snapshot().pending, input, "exact command is retained before POST");
      h.commands.push(input);
      const d = deferred();
      h.queue.push(d);
      return d.promise;
    },
  });
  h.c.start();
  return h;
}
async function issue(h) {
  await tick();
  const work = h.c.issue(op);
  assert.equal(h.commands.length, 1);
  assert.equal(h.c.snapshot().busy, true);
  h.pass = active;
  h.queue[0].resolve(issued);
  await work;
  assert.equal(h.c.snapshot().secret.value, token);
  assert.equal(h.c.snapshot().fresh, true);
  return h;
}
let h = setup();
await tick();
assert.equal(h.commands.length, 0);
assert.deepEqual(
  h.reads.map((x) => x.action),
  ["status"],
);
await issue(h);
assert.equal(h.c.snapshot().back, true);
h.c.showOrFlip();
h.c.showOrFlip();
assert.equal(h.commands.length, 1, "flip never reissues");
assert.equal(h.c.snapshot().back, true);
await h.c.revealAddress();
assert.equal(h.c.snapshot().address, "Synthetic venue");
h.c.hide();
assert.equal(h.c.snapshot().secret, null);
assert.equal(h.c.snapshot().address, null);
h.c.resume();
await tick();
assert.equal(h.commands.length, 1);
assert.equal(h.c.snapshot().secret, null, "return cannot recover secret");
h.c.stop();
// A late mutation after hide cannot restore QR or unlock a newer explicit retry.
h = setup();
await tick();
const old = h.c.issue(op);
const original = h.commands[0];
h.c.hide();
h.pass = active;
h.c.resume();
await tick();
const newer = h.c.retry();
assert.equal(h.commands.length, 2);
assert.equal(h.commands[1], original);
assert.equal(h.c.snapshot().busy, true);
h.queue[0].resolve(issued);
await old;
assert.equal(h.c.snapshot().busy, true);
assert.equal(h.c.snapshot().secret, null);
h.queue[1].resolve({ ...issued, replayed: true, qrText: null, secretUnavailable: true });
await newer;
assert.equal(h.c.snapshot().secret, null);
assert.equal(h.c.snapshot().pending, null);
assert.equal(h.c.snapshot().message, "secret_lost");
assert.equal(h.commands.length, 2);
h.c.stop();
// A lost reply keeps exactly the original immutable operation for an explicit retry.
h = setup();
await tick();
const lost = h.c.issue(op);
h.queue[0].reject(Error("synthetic response lost"));
await lost;
assert.equal(h.c.snapshot().message, "lost_reply");
assert.equal(h.c.snapshot().pending.operationId, op);
assert.equal(Object.isFrozen(h.c.snapshot().pending), true);
await h.c.issue();
assert.equal(h.commands.length, 1);
const retry = h.c.retry();
assert.equal(h.commands[0], h.commands[1]);
h.pass = active;
h.queue[1].resolve({ ...issued, replayed: true, qrText: null, secretUnavailable: true });
await retry;
assert.equal(h.c.snapshot().secret, null);
h.c.stop();
// Failed foreground revalidation clears the previously issued bearer, not just its visibility.
h = await issue(setup());
const failed = deferred();
h.nextRead = failed;
h.c.resume();
assert.equal(h.c.snapshot().fresh, false);
failed.reject(Error("synthetic disconnected"));
await tick();
assert.equal(h.c.snapshot().secret, null);
assert.equal(h.c.snapshot().back, false);
h.c.stop();
// Stale status replies, later generations, terminal states and unmount cannot restore a QR.
for (const mode of ["hidden", "unmount", "used", "revoked", "new-generation"]) {
  h = await issue(setup());
  const d = deferred();
  h.nextRead = d;
  const refresh = h.c.refresh();
  if (mode === "hidden") h.c.hide();
  else if (mode === "unmount") h.c.stop();
  d.resolve(
    readResult(
      mode === "used" || mode === "revoked"
        ? { ...active, status: mode }
        : mode === "new-generation"
          ? { ...active, version: 2, generation: 2 }
          : active,
    ),
  );
  await refresh;
  assert.equal(h.c.snapshot().secret, null, mode);
  if (mode === "used" || mode === "revoked") {
    await h.c.rotate("Replacement", true);
    await h.c.issue();
    assert.equal(h.commands.length, 1);
  }
  h.c.stop();
}
// Two overlapping reads: a late older active response must not replace a newer revoked status.
h = setup();
await tick();
const r1 = deferred(),
  r2 = deferred();
h.nextRead = r1;
const w1 = h.c.refresh();
h.nextRead = r2;
const w2 = h.c.refresh();
r2.resolve(readResult({ ...active, status: "revoked" }));
await w2;
r1.resolve(readResult(active));
await w1;
assert.equal(h.c.snapshot().pass.status, "revoked");
h.c.stop();
// Address is read only after a click; a hidden in-flight address never repopulates private content.
h = setup();
await tick();
assert.ok(h.reads.every((r) => r.action === "status"));
const a = deferred();
h.nextRead = a;
const wa = h.c.revealAddress();
h.c.hide();
a.resolve({
  ok: true,
  items: [],
  pass: null,
  address: {
    outcome: "ready",
    addressAvailable: true,
    address: "Synthetic venue",
    addressRevealAt: null,
    timezone: null,
  },
});
await wa;
assert.equal(h.c.snapshot().address, null);
h.c.stop();
// A newer failed/terminal authority read fences an older in-flight address reveal.
for (const status of ["failure", "used", "revoked"]) {
  h = setup();
  await tick();
  const address = deferred();
  h.nextRead = address;
  const reveal = h.c.revealAddress();
  const authority = deferred();
  h.nextRead = authority;
  const refresh = h.c.refresh();
  authority.resolve(
    status === "failure" ? { ok: false, reason: "forbidden" } : readResult({ ...active, status }),
  );
  await refresh;
  address.resolve({
    ok: true,
    items: [],
    pass: null,
    address: {
      outcome: "ready",
      addressAvailable: true,
      address: "Synthetic venue",
      addressRevealAt: null,
      timezone: null,
    },
  });
  await reveal;
  assert.equal(h.c.snapshot().address, null, status);
  h.c.stop();
}
// Rotation needs current active status, a reason and explicit acknowledgement.
h = setup();
h.pass = active;
await tick();
await h.c.refresh();
await h.c.rotate("Replacement", false);
await h.c.rotate("x", true);
assert.equal(h.commands.length, 0);
const rotation = h.c.rotate("Replacement after lost tab", true, op);
assert.equal(h.commands[0].action, "rotate");
h.pass = { ...active, generation: 2, version: 2 };
h.queue[0].resolve({
  ...issued,
  receipt: { ...receipt, action: "rotate", outcome: "rotated", generation: 2, version: 2 },
});
await rotation;
assert.equal(h.c.snapshot().secret.generation, 2);
h.c.signout();
assert.equal(h.c.snapshot().secret, null);
assert.equal(h.c.snapshot().pass, null);
h.c.stop();
let spring = { angle: 0, velocity: OWNER_CLICK_IMPULSE };
for (let i = 0; i < 10000; i++) {
  spring = stepOwnerSpring(spring, i % 20 === 0 ? 100 : 1 / 60);
  assert.ok(Number.isFinite(spring.angle));
  assert.ok(Math.abs(spring.angle) <= OWNER_ANGLE_LIMIT);
  assert.ok(Math.abs(spring.velocity) <= 3.5);
}
assert.ok(Math.abs(spring.angle) < 0.001);
console.log(
  "PASS owner lifecycle: explicit issuance, immutable retry, stale mutation/read fences, hide/pagehide/unmount equivalent invalidation, failed focus recheck, generation/terminal gates, private address, confirmed rotation and bounded physics",
);
