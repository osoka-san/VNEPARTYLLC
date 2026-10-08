/** Actual React DOM interactions in happy-dom. This is NOT browser acceptance.
 * Use an existing happy-dom install, or VNE_DOM_MODULE=/absolute/path/to/happy-dom/lib/index.js.
 * No live Auth, API, QR, PostgreSQL, role window, or owner browser session is used.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { Window } = await import(process.env.VNE_DOM_MODULE || "happy-dom");
const dir = await mkdtemp(join(tmpdir(), "day07-ui-dom-"));
await symlink(await realpath("node_modules"), join(dir, "node_modules"), "dir");
const mocks = {
  "@tanstack/react-start": "export const useServerFn = fn => fn;",
  "@/lib/admission/admission.functions":
    "export const qrAdmissionCommand = ({data}) => globalThis.__qaTransport.command(data);",
  "@/lib/auth/scanner-mfa.functions":
    "export const getScannerMfaState = () => globalThis.__qaTransport.mfa();",
};
const result = await build({
  stdin: {
    contents: `export {TimedQaScanner} from './src/components/admission/TimedQaScanner'; export {QA_ACTORS,QA_EVENT,QA_PART,QA_PASS,QA_PUBLIC_TOKEN} from './src/lib/admission/timed-qa-core'; export {createRoot} from 'react-dom/client'; export {createElement,StrictMode,act} from 'react';`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["react", "react-dom/client"],
  write: false,
  outfile: join(dir, "ui.mjs"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "isolated-transports",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(@tanstack\/react-start|@\/lib\/(admission\/admission.functions|auth\/scanner-mfa.functions))$/,
          },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({ contents: mocks[a.path] }));
      },
    },
  ],
});
await writeFile(join(dir, "ui.mjs"), result.outputFiles.find((f) => f.path.endsWith(".mjs")).text);
function environment() {
  const win = new Window({ url: "https://isolated-day07.test/" });
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "Event",
    "MouseEvent",
    "Node",
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === "window" ? win : win[name],
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return win;
}
let win = environment();
const {
  TimedQaScanner,
  QA_ACTORS,
  QA_EVENT,
  QA_PART,
  QA_PASS,
  QA_PUBLIC_TOKEN,
  createRoot,
  createElement,
  StrictMode,
  act,
} = await import(pathToFileURL(join(dir, "ui.mjs")));
const settle = async () => {
  for (let i = 0; i < 200; i++) await Promise.resolve();
};
let root, host, calls, mfaCalls, clock;
const originalTiming = {
  wall: Date.now,
  mono: performance.now,
  timeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  interval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};
class TestClock {
  now = 0;
  base = Date.parse("2026-10-08T12:00:00.000Z");
  sequence = 0;
  timers = new Map();
  wall = () => this.base + this.now;
  add = (fn, ms, repeat = false) => {
    const id = ++this.sequence;
    this.timers.set(id, { fn, at: this.now + ms, repeat: repeat ? ms : 0 });
    return id;
  };
  clear = (id) => this.timers.delete(id);
  install() {
    Date.now = this.wall;
    Object.defineProperty(performance, "now", { value: () => this.now, configurable: true });
    globalThis.setTimeout = (fn, ms) => this.add(fn, ms);
    globalThis.clearTimeout = this.clear;
    globalThis.setInterval = (fn, ms) => this.add(fn, ms, true);
    globalThis.clearInterval = this.clear;
  }
  async advance(ms, stalled = false) {
    const end = this.now + ms;
    if (stalled) this.now = end;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, t] = next;
      this.now = Math.max(this.now, t.at);
      if (t.repeat) t.at = this.now + t.repeat;
      else this.timers.delete(id);
      t.fn();
      await settle();
    }
    this.now = Math.max(this.now, end);
    await settle();
  }
}
function receipt(c, actor = QA_ACTORS[0]) {
  const ready = c.action === "verify" && c.token === QA_PUBLIC_TOKEN;
  const checkin = c.action === "checkin";
  return {
    ok: true,
    qrText: null,
    events: [],
    secretUnavailable: true,
    replayed: false,
    receipt: {
      operationId: checkin ? c.operationId : null,
      correlationId: globalThis.crypto.randomUUID(),
      action: c.action,
      outcome: checkin ? "simulated_accepted" : ready ? "ready" : "invalid_token",
      eventId: QA_EVENT,
      participationId: checkin || ready ? QA_PART : null,
      passId: checkin || ready ? QA_PASS : null,
      generation: checkin || ready ? 1 : null,
      version: checkin ? 2 : ready ? 1 : null,
      actorId: actor,
      at: new Date(clock.wall()).toISOString(),
      simulated: true,
      reentryAllowed: false,
    },
  };
}
async function mount(transport = {}) {
  if (root) await act(async () => root.unmount());
  await win.happyDOM.close();
  win = environment();
  clock = new TestClock();
  clock.install();
  host = document.createElement("div");
  document.body.append(host);
  calls = [];
  mfaCalls = 0;
  globalThis.__qaTransport = {
    mfa: async () => {
      mfaCalls++;
      return { ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true };
    },
    command: async (c) => {
      calls.push(c);
      clock.now += 20;
      return receipt(c);
    },
    ...transport,
  };
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(StrictMode, null, createElement(TimedQaScanner))),
  );
}
const phase = () => host.querySelector(".timed-qa").dataset.phase;
function button(text) {
  const b = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  assert.ok(b, `button ${text}`);
  return b;
}
function field(label) {
  const l = [...host.querySelectorAll("label")].find(
    (l) => l.firstChild.textContent.trim() === label,
  );
  assert.ok(l, `field ${label}`);
  return l.querySelector("input,textarea,select");
}
async function click(text) {
  const b = button(text);
  assert.equal(b.disabled, false, `${text} enabled`);
  await act(async () => {
    b.click();
    await settle();
  });
}
async function fill(label, value) {
  const el = field(label);
  assert.equal(el.disabled || !!el.closest("fieldset[disabled]"), false, `${label} editable`);
  await act(async () => {
    const proto =
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function config() {
  await fill("ID запуска (UUID)", "10000000-0000-4000-8000-000000000001");
  await fill("Начало окна UTC", new Date(Date.now() - 60000).toISOString());
}
async function visibility(value) {
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { value, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function advance(ms, stalled = false) {
  await act(async () => clock.advance(ms, stalled));
}
const report = () => JSON.parse(field("Отчёт для координатора").value);
const rehearsalButton = "Запланировать репетицию";
const raceButton = "Запланировать один проход";
async function planRehearsal() {
  await config();
  await fill("UTC отправки репетиции", new Date(clock.wall() + 100000).toISOString());
  await click(rehearsalButton);
}
function validRehearsal() {
  const s = report(),
    at = Date.parse(s.receipt.at),
    dispatch = Date.parse(s.dispatchAt);
  const observed = Math.min(at, dispatch + 2),
    lockStart = observed - 100,
    released = observed + 1;
  const other = {
    ...s.receipt,
    actorId: QA_ACTORS.find((x) => x !== s.actorId),
    correlationId: crypto.randomUUID(),
    at: new Date(Math.max(at, released)).toISOString(),
  };
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
    browsers: QA_ACTORS.map((actor) => ({
      dispatchedAt: s.dispatchAt,
      uncertaintyMs: s.uncertaintyMs,
      receipt: actor === s.actorId ? { ...s.receipt } : other,
    })),
  };
}
async function acceptEvidence() {
  await fill("Безопасная сверка от координатора", JSON.stringify(validRehearsal()));
  await click("Проверить структуру сверки");
  assert.equal(button(raceButton).disabled, false);
}
const operationId = "30000000-0000-4000-8000-000000000003";
async function planRace() {
  await fill("ID моей операции прохода (UUID)", operationId);
  await fill("UTC отправки прохода", new Date(clock.wall() + 100000).toISOString());
  await click(raceButton);
}
async function winner() {
  await mount();
  await planRehearsal();
  await advance(100100);
  await acceptEvidence();
  await planRace();
  await advance(100100);
  assert.equal(phase(), "result");
  assert.equal(calls.length, 9);
}
async function fillAck() {
  await fill(
    "Подтверждение DB-сверки от координатора",
    JSON.stringify({ operationId, primaryCount: 1, acceptedCount: 1, usedCount: 1 }),
  );
}
try {
  await test("readiness works before run/window input, makes one GET and no QR POST, and projects safe fields", async () => {
    await mount();
    assert.equal(mfaCalls, 0);
    assert.equal(field("ID запуска (UUID)").value, "");
    assert.equal(field("Начало окна UTC").value, "");
    assert.ok(
      host.querySelector(".timed-qa-session").compareDocumentPosition(field("ID запуска (UUID)")) &
        4,
      "readiness comes before timed run fields",
    );
    globalThis.__qaTransport.mfa = async () => {
      mfaCalls++;
      return {
        ok: true,
        userId: QA_ACTORS[0],
        aal2: true,
        hasVerifiedTotp: true,
        pendingFactorId: "PRIVATE_FACTOR",
        secret: "PRIVATE_SECRET",
        jwt: "PRIVATE_JWT",
      };
    };
    await click("Проверить текущую сессию");
    assert.equal(mfaCalls, 1);
    assert.equal(calls.length, 0);
    assert.equal(phase(), "idle");
    assert.equal(report().posts, 0);
    assert.equal(report().runId, null);
    assert.equal(report().sessionReadiness.phase, "ready");
    assert.match(host.querySelector("[data-readiness]").textContent, /READY/);
    assert.match(host.querySelector("[data-readiness]").textContent, new RegExp(QA_ACTORS[0]));
    assert.match(
      host.querySelector(".timed-qa-session").textContent,
      /READY не подтверждает роль и допуск/,
    );
    assert.equal(button(rehearsalButton).disabled, false);
    assert.ok(!host.textContent.includes("PRIVATE_"));
    assert.ok(!field("Отчёт для координатора").value.includes("PRIVATE_"));
  });
  await test("readiness gives distinct actionable MFA/account/server reasons with no enrollment or QR", async () => {
    const ready = { ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true };
    for (const [response, reason, message] of [
      [{ ...ready, aal2: false }, "challenge_required", /эта сессия ещё не AAL2/],
      [{ ...ready, hasVerifiedTotp: false }, "factor_required", /нет подтверждённого TOTP/],
      [{ ...ready, userId: QA_ACTORS[1] }, "wrong_account", /не совпадает с выбранным/],
      [{ ok: false, reason: "forbidden" }, "forbidden", /не распознана/],
      [{ ok: false, reason: "unconfigured" }, "unconfigured", /не настроена/],
      [{ ok: false, reason: "unavailable" }, "unavailable", /не смог проверить/],
      [{ ok: false, reason: "PRIVATE_ERROR" }, "unavailable", /не смог проверить/],
    ]) {
      await mount({ mfa: async () => response });
      await click("Проверить текущую сессию");
      assert.equal(report().sessionReadiness.reason, reason);
      assert.match(host.querySelector("[data-readiness]").textContent, message);
      const challenge = [...host.querySelectorAll(".timed-qa-session a")];
      assert.equal(challenge.length, reason === "challenge_required" ? 1 : 0);
      if (challenge.length) assert.equal(challenge[0].getAttribute("href"), "/scanner/mfa");
      assert.equal(calls.length, 0);
      assert.equal(phase(), "idle");
      assert.ok(!host.textContent.includes("PRIVATE_"));
      assert.ok(!field("Отчёт для координатора").value.includes("PRIVATE_"));
    }
  });
  await test("readiness pending disables duplicate checks and calibration; actor changes fence stale replies", async () => {
    let oldResolve,
      freshResolve,
      reads = 0;
    await mount({
      mfa: () =>
        ++reads === 1
          ? new Promise((r) => (oldResolve = r))
          : new Promise((r) => (freshResolve = r)),
    });
    await act(async () => {
      button("Проверить текущую сессию").click();
      button("Проверить текущую сессию").click();
      await settle();
    });
    assert.equal(reads, 1);
    assert.equal(button("Проверить текущую сессию").disabled, true);
    assert.equal(button(rehearsalButton).disabled, true);
    await fill("Этот профиль", QA_ACTORS[1]);
    assert.equal(report().sessionReadiness.phase, "unchecked");
    await click("Проверить текущую сессию");
    await act(async () => {
      oldResolve({ ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true });
      await settle();
    });
    assert.equal(report().sessionReadiness.phase, "checking");
    await act(async () => {
      freshResolve({ ok: true, userId: QA_ACTORS[1], aal2: true, hasVerifiedTotp: true });
      await settle();
    });
    assert.equal(report().sessionReadiness.phase, "ready");
    assert.equal(report().sessionReadiness.userId, QA_ACTORS[1]);
    assert.equal(report().sessionReadiness.selectedActorId, QA_ACTORS[1]);
    assert.equal(calls.length, 0);
  });
  await test("readiness is invalidated by lifecycle and late success/rejection cannot restore it", async () => {
    for (const kind of [
      "hidden",
      "freeze",
      "offline",
      "pagehide",
      "popstate",
      "vne:questionnaire-signout",
    ]) {
      let resolve, reject;
      await mount({
        mfa: () =>
          new Promise((r, j) => {
            resolve = r;
            reject = j;
          }),
      });
      await click("Проверить текущую сессию");
      if (kind === "hidden") {
        await visibility("hidden");
        await visibility("visible");
      } else
        await act(async () =>
          (kind === "freeze" ? document : window).dispatchEvent(new Event(kind)),
        );
      assert.equal(report().sessionReadiness.reason, "environment_changed");
      await act(async () => {
        if (kind === "offline") reject(new Error("PRIVATE_ERROR"));
        else resolve({ ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true });
        await settle();
      });
      assert.equal(report().sessionReadiness.reason, "environment_changed");
      assert.equal(report().sessionReadiness.userId, null);
      assert.equal(phase(), "idle");
      assert.equal(calls.length, 0);
      assert.equal(button("Проверить текущую сессию").disabled, false);
    }
    await mount();
    await click("Проверить текущую сессию");
    await visibility("hidden");
    await visibility("visible");
    assert.equal(report().sessionReadiness.reason, "environment_changed");
    assert.equal(mfaCalls, 1);
  });
  await test("READY is not reused by the scheduled stage; fresh AAL1 stops before QR POST", async () => {
    await mount();
    await click("Проверить текущую сессию");
    globalThis.__qaTransport.mfa = async () => {
      mfaCalls++;
      return { ok: true, userId: QA_ACTORS[0], aal2: false, hasVerifiedTotp: true };
    };
    await planRehearsal();
    assert.equal(mfaCalls, 1);
    await advance(90000);
    assert.equal(mfaCalls, 2);
    assert.equal(calls.length, 0);
    assert.equal(phase(), "cancelled");
    assert.equal(report().message, "session_challenge_required");
    assert.match(host.querySelector(".timed-qa-status").textContent, /эта сессия ещё не AAL2/);
  });
  await test("unmounted readiness reply cannot affect remount or start any automatic work", async () => {
    let resolve;
    await mount({ mfa: () => new Promise((r) => (resolve = r)) });
    await click("Проверить текущую сессию");
    await mount();
    await act(async () => {
      resolve({ ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true });
      await settle();
    });
    assert.equal(report().sessionReadiness.phase, "unchecked");
    assert.equal(phase(), "idle");
    assert.equal(mfaCalls, 0);
    assert.equal(calls.length, 0);
  });
  await test("StrictMode and copying fields stay inert; one arm freezes fields and runs only at JIT", async () => {
    await mount();
    assert.equal(phase(), "idle");
    assert.equal(clock.timers.size, 0);
    await config();
    for (const event of ["freeze"]) await act(async () => document.dispatchEvent(new Event(event)));
    for (const event of ["offline", "pagehide", "popstate", "vne:questionnaire-signout"])
      await act(async () => window.dispatchEvent(new Event(event)));
    await visibility("hidden");
    await visibility("visible");
    assert.equal(phase(), "idle");
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
    await fill("UTC отправки репетиции", new Date(clock.wall() + 100000).toISOString());
    await click(rehearsalButton);
    assert.equal(phase(), "rehearsal_waiting");
    assert.equal(report().actorId, QA_ACTORS[0]);
    assert.equal(report().countdownMs, 100000);
    assert.match(host.querySelector("[role=timer]").textContent, /100 с/);
    assert.equal(button(rehearsalButton).disabled, true);
    assert.equal(field("Этот профиль").disabled, true);
    assert.equal(field("UTC отправки репетиции").disabled, true);
    assert.ok(field("ID запуска (UUID)").closest("fieldset[disabled]"));
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
    await act(async () => {
      button(rehearsalButton).click();
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    await advance(89950);
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
    await advance(100);
    assert.equal(mfaCalls, 1);
    assert.equal(calls.length, 3);
    assert.deepEqual(
      calls.map((c) => c.token),
      Array(3).fill("DAY07_CLOCK_PROBE"),
    );
    assert.equal(phase(), "rehearsal_armed");
    assert.equal(report().clockSamples.length, 3);
    assert.equal(host.querySelectorAll(".timed-qa-samples li").length, 3);
    await advance(10100);
    assert.equal(phase(), "rehearsal_done", JSON.stringify(report()));
    assert.equal(calls.length, 4);
    assert.equal(calls[3].token, "DAY07_REHEARSAL_PROBE");
    await advance(30000);
    assert.equal(calls.length, 4, "no resend or re-arm");
    assert.equal(button(raceButton).disabled, true, "external evidence still required");
  });
  await test("UUID, canonical UTC and 30–120-second lead validation are local and actionable", async () => {
    await mount();
    await click(rehearsalButton);
    assert.match(host.querySelector("[role=alert]").textContent, /полный UUID/);
    await fill("ID запуска (UUID)", "10000000-0000-4000-8000-000000000001");
    await fill("Начало окна UTC", "2026-10-08T09:25:00Z");
    await click(rehearsalButton);
    assert.match(host.querySelector("[role=alert]").textContent, /миллисекунды и Z/);
    await config();
    for (const lead of [8000, 121000]) {
      await fill("UTC отправки репетиции", new Date(clock.wall() + lead).toISOString());
      await click(rehearsalButton);
      assert.match(host.querySelector("[role=alert]").textContent, /30–120 секунд/);
    }
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
    for (const b of host.querySelectorAll("button[disabled]")) {
      const id = b.getAttribute("aria-describedby");
      assert.ok(
        id && host.querySelector(`#${id}`)?.textContent,
        `disabled reason for ${b.textContent}`,
      );
    }
  });
  await test("Stop before JIT cancels with zero I/O; explicit reset is the only way to re-arm", async () => {
    await mount();
    await planRehearsal();
    await advance(1000);
    await click("Остановить");
    assert.equal(phase(), "cancelled");
    await advance(150000);
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
    assert.equal(button(rehearsalButton).disabled, true);
    await click("Сбросить подготовку");
    assert.equal(phase(), "idle");
    assert.equal(field("UTC отправки репетиции").value, "");
    assert.equal(report().target, null);
    assert.equal(report().posts, 0);
  });
  await test("cancel and reset during MFA fence stale completion after changed run/actor inputs", async () => {
    let resolveMfa;
    await mount({ mfa: () => new Promise((r) => (resolveMfa = r)) });
    await planRehearsal();
    await advance(90000);
    assert.equal(phase(), "calibrating");
    await click("Остановить");
    await click("Сбросить подготовку");
    await fill("Этот профиль", QA_ACTORS[1]);
    await fill("ID запуска (UUID)", "40000000-0000-4000-8000-000000000004");
    await act(async () => {
      resolveMfa({ ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true });
      await settle();
    });
    await advance(10000);
    assert.equal(phase(), "idle");
    assert.equal(calls.length, 0);
    assert.equal(report().actorId, null);
    assert.equal(field("Этот профиль").value, QA_ACTORS[1]);
  });
  await test("all existing lifecycle fences stop the scheduled wait without automatic resumption", async () => {
    for (const kind of [
      "hidden",
      "freeze",
      "offline",
      "pagehide",
      "popstate",
      "vne:questionnaire-signout",
    ]) {
      await mount();
      await planRehearsal();
      if (kind === "hidden") {
        await visibility("hidden");
        await visibility("visible");
      } else
        await act(async () =>
          (kind === "freeze" ? document : window).dispatchEvent(new Event(kind)),
        );
      await advance(100100);
      assert.equal(phase(), "cancelled", kind);
      assert.equal(calls.length, 0, kind);
      assert.equal(mfaCalls, 0, kind);
    }
  });
  await test("unmount during scheduled MFA rejects stale replies and leaves zero calls on remount", async () => {
    let resolveMfa;
    await mount({ mfa: () => new Promise((r) => (resolveMfa = r)) });
    await planRehearsal();
    await advance(90000);
    await mount();
    await act(async () => {
      resolveMfa({ ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true });
      await settle();
    });
    assert.equal(phase(), "idle");
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
  });
  await test("MFA refusal and timeout stop with safe reasons and no QR POST", async () => {
    for (const timeout of [false, true]) {
      await mount({
        mfa: () =>
          timeout ? new Promise(() => {}) : Promise.resolve({ ok: false, reason: "forbidden" }),
      });
      await planRehearsal();
      await advance(94500);
      assert.equal(phase(), "cancelled");
      assert.equal(calls.length, 0);
      assert.equal(report().message, timeout ? "response_timeout" : "session_forbidden");
      assert.equal(button("Сбросить подготовку").disabled, false);
    }
  });
  await test("closed server stops after one probe and consumed budget cannot reset", async () => {
    await mount({
      command: async (c) => {
        calls.push(c);
        return { ok: false, reason: "unavailable" };
      },
    });
    await planRehearsal();
    await advance(90100);
    assert.equal(phase(), "cancelled");
    assert.equal(calls.length, 1);
    assert.match(host.querySelector(".timed-qa-status").textContent, /TEST-окно/);
    assert.equal(
      [...host.querySelectorAll("button")].some((b) => b.textContent === "Сбросить подготовку"),
      false,
    );
  });
  await test("late timer fails closed before JIT and shows reason without requests", async () => {
    await mount();
    await planRehearsal();
    await advance(90150, true);
    assert.equal(phase(), "cancelled");
    assert.equal(calls.length, 0);
    assert.equal(mfaCalls, 0);
    assert.match(
      host.querySelector(".timed-qa-status").textContent,
      /задержал таймер|слишком поздно/,
    );
  });
  await test("one slow sample is shown safely and two good samples allow exactly one rehearsal", async () => {
    await mount({
      command: async (c) => {
        calls.push(c);
        clock.now += calls.length === 1 ? 1600 : 20;
        return receipt(c);
      },
    });
    await planRehearsal();
    await advance(100100);
    assert.equal(phase(), "rehearsal_done", JSON.stringify(report()));
    assert.equal(calls.length, 4);
    assert.deepEqual(
      report().clockSamples.map((s) => s.quality),
      ["slow", "good", "good"],
    );
    assert.match(host.querySelector(".timed-qa-samples").textContent, /1600 мс.*медленный/s);
  });
  await test("insufficient sample quality shows metrics and stops after the three fixed probes", async () => {
    await mount({
      command: async (c) => {
        calls.push(c);
        clock.now += 1600;
        return receipt(c);
      },
    });
    await planRehearsal();
    await advance(101000);
    assert.equal(phase(), "cancelled");
    assert.equal(calls.length, 3);
    assert.equal(report().message, "insufficient_good_samples");
    assert.match(host.querySelector(".timed-qa-status").textContent, /2 качественных замера из 3/);
    assert.equal(host.querySelectorAll(".timed-qa-samples li").length, 3);
  });
  await test("hide after calibration stops final dispatch and does not reset consumed budget", async () => {
    await mount();
    await planRehearsal();
    await advance(90200);
    assert.equal(calls.length, 3);
    await visibility("hidden");
    await visibility("visible");
    await advance(20000);
    assert.equal(phase(), "cancelled");
    assert.equal(calls.length, 3);
    assert.equal(
      [...host.querySelectorAll("button")].some((b) => b.textContent === "Сбросить подготовку"),
      false,
    );
  });
  await test("in-flight Stop preserves uncertainty and ignores late response", async () => {
    let resolveCommand;
    await mount({
      command: async (c) => {
        calls.push(c);
        if (c.token === "DAY07_REHEARSAL_PROBE")
          return new Promise((r) => (resolveCommand = () => r(receipt(c))));
        clock.now += 20;
        return receipt(c);
      },
    });
    await planRehearsal();
    await advance(100100);
    assert.equal(phase(), "in_flight");
    const at = report().dispatchAt;
    await click("Остановить");
    await act(async () => {
      resolveCommand();
      await settle();
    });
    assert.equal(phase(), "uncertain");
    assert.equal(report().receipt, null);
    assert.equal(report().dispatchAt, at);
    assert.equal(report().posts, 4);
    await advance(30000);
    assert.equal(calls.length, 4);
  });
  await test("second arm keeps external proof gate and schedules own MFA, three probes, ready check and one checkin", async () => {
    await mount();
    await planRehearsal();
    await advance(100100);
    assert.equal(button(raceButton).disabled, true);
    await fill("Безопасная сверка от координатора", JSON.stringify({ checked: true }));
    await click("Проверить структуру сверки");
    assert.equal(button(raceButton).disabled, true);
    await acceptEvidence();
    await planRace();
    assert.equal(phase(), "race_waiting");
    assert.equal(field("ID моей операции прохода (UUID)").disabled, true);
    assert.equal(field("UTC отправки прохода").disabled, true);
    assert.equal(field("Безопасная сверка от координатора").disabled, true);
    assert.equal(mfaCalls, 1);
    assert.equal(calls.length, 4);
    assert.equal(report().dispatchAt, null);
    assert.equal(report().receipt, null);
    assert.ok(report().rehearsalDispatchAt);
    await advance(77950);
    assert.equal(calls.length, 4);
    await advance(250);
    assert.equal(mfaCalls, 2);
    assert.equal(calls.length, 7);
    assert.equal(phase(), "race_prepared");
    assert.ok(host.querySelector(".timed-qa-countdown"));
    await advance(12000);
    assert.equal(mfaCalls, 3);
    assert.equal(calls.length, 8);
    assert.deepEqual(
      calls.slice(4, 7).map((c) => c.token),
      Array(3).fill("DAY07_CLOCK_PROBE"),
    );
    assert.equal(calls[7].action, "verify");
    assert.equal(calls[7].token, QA_PUBLIC_TOKEN);
    assert.equal(phase(), "race_armed");
    await advance(10000);
    assert.equal(phase(), "result");
    assert.equal(calls.length, 9);
    assert.equal(calls[8].action, "checkin");
    assert.equal(calls[8].operationId, operationId);
    assert.equal(calls[8].expectedVersion, 1);
    assert.equal(report().receipt.outcome, "simulated_accepted");
    await advance(30000);
    assert.equal(calls.length, 9);
  });
  await test("explicit acknowledged winner replay gets fresh MFA and exactly one cached command, with no probes", async () => {
    await winner();
    await advance(30000);
    await fillAck();
    const original = calls[8],
      result = { ...report().receipt };
    delete result.replayed;
    globalThis.__qaTransport.command = async (c) => {
      calls.push(c);
      assert.equal(c, original);
      return {
        ok: true,
        events: [],
        qrText: null,
        secretUnavailable: true,
        replayed: true,
        receipt: result,
      };
    };
    await click("Повторить ту же операцию после сверки");
    assert.equal(mfaCalls, 4);
    assert.equal(calls.length, 10);
    assert.equal(phase(), "replayed");
    assert.equal(button("Повторить ту же операцию после сверки").disabled, true);
    await advance(30000);
    assert.equal(calls.length, 10);
  });
  await test("failed fresh MFA blocks replay once without an additional QR POST", async () => {
    await winner();
    await fillAck();
    globalThis.__qaTransport.mfa = async () => {
      mfaCalls++;
      return { ok: true, userId: QA_ACTORS[0], aal2: false, hasVerifiedTotp: true };
    };
    await click("Повторить ту же операцию после сверки");
    assert.equal(phase(), "replay_blocked");
    assert.equal(calls.length, 9);
    assert.equal(mfaCalls, 4);
    assert.equal(button("Повторить ту же операцию после сверки").disabled, true);
    assert.equal(report().receipt.outcome, "simulated_accepted");
  });
  await test("pending winner MFA disables duplicate replay and Stop fences the late GET", async () => {
    await winner();
    await fillAck();
    let resolveMfa;
    globalThis.__qaTransport.mfa = () => {
      mfaCalls++;
      return new Promise((r) => (resolveMfa = r));
    };
    await click("Повторить ту же операцию после сверки");
    assert.equal(phase(), "replay_checking");
    assert.equal(button("Повторить ту же операцию после сверки").disabled, true);
    assert.equal(field("Подтверждение DB-сверки от координатора").disabled, true);
    await act(async () => button("Повторить ту же операцию после сверки").click());
    assert.equal(mfaCalls, 4);
    assert.equal(calls.length, 9);
    await click("Остановить");
    await act(async () => {
      resolveMfa({ ok: true, userId: QA_ACTORS[0], aal2: true, hasVerifiedTotp: true });
      await settle();
    });
    assert.equal(phase(), "replay_blocked");
    assert.equal(calls.length, 9);
    assert.equal(report().receipt.outcome, "simulated_accepted");
  });
  await test("unknown receipt fields are rejected and never copied into diagnostics", async () => {
    await mount({
      command: async (c) => {
        calls.push(c);
        clock.now += 20;
        const r = receipt(c);
        r.receipt.token = "PRIVATE_TOKEN";
        return r;
      },
    });
    await planRehearsal();
    await advance(90100);
    assert.equal(phase(), "cancelled");
    assert.equal(report().message, "invalid_response");
    assert.equal(calls.length, 1);
    assert.ok(!field("Отчёт для координатора").value.includes("PRIVATE_"));
    assert.ok(!host.textContent.includes("PRIVATE_"));
  });
  await test("safe report allowlists metadata and copy fallback; no credential or QR inputs are introduced", async () => {
    await mount({
      command: async (c) => {
        calls.push(c);
        clock.now += 20;
        const r = receipt(c);
        r.token = "PRIVATE_TOKEN";
        r.jwt = "PRIVATE_JWT";
        r.secret = "PRIVATE_SECRET";
        return r;
      },
    });
    await planRehearsal();
    await advance(100100);
    assert.equal(phase(), "rehearsal_done", JSON.stringify(report()));
    assert.ok(report().receipt);
    assert.ok(!field("Отчёт для координатора").value.includes("PRIVATE_"));
    assert.ok(!host.textContent.includes("PRIVATE_"));
    assert.equal(field("Отчёт для координатора").readOnly, true);
    assert.equal(
      host.querySelectorAll("input[type=password],input[type=file],video,canvas").length,
      0,
    );
    assert.equal(host.querySelectorAll(".timed-qa-nav a[href='/scanner/mfa']").length, 1);
    assert.match(host.textContent, /READY не подтверждает роль и допуск/);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });
    await click("Скопировать отчёт");
    assert.match(host.textContent, /Отчёт выделен/);
    assert.equal(document.activeElement, field("Отчёт для координатора"));
    assert.equal(
      field("Отчёт для координатора").selectionEnd,
      field("Отчёт для координатора").value.length,
    );
    await fill("Безопасная сверка от координатора", "not json");
    await click("Проверить структуру сверки");
    assert.match(host.querySelector("[role=alert]").textContent, /не читается как JSON/);
    assert.equal(calls.length, 4);
  });
} finally {
  if (root) await act(async () => root.unmount());
  Date.now = originalTiming.wall;
  Object.defineProperty(performance, "now", { value: originalTiming.mono, configurable: true });
  globalThis.setTimeout = originalTiming.timeout;
  globalThis.clearTimeout = originalTiming.clearTimeout;
  globalThis.setInterval = originalTiming.interval;
  globalThis.clearInterval = originalTiming.clearInterval;
  await win.happyDOM.close();
  await rm(dir, { recursive: true, force: true });
  delete globalThis.__qaTransport;
}
