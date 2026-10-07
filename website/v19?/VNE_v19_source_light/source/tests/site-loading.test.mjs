import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const bundle = await build({
  entryPoints: ["src/lib/site-loading.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const { createSiteLoading } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
function fakeClock() {
  let time = 0,
    serial = 0;
  const jobs = new Map();
  return {
    now: () => time,
    set: (fn, delay) => {
      const id = ++serial;
      jobs.set(id, { fn, at: time + delay });
      return id;
    },
    clear: (id) => jobs.delete(id),
    advance: (ms) => {
      const end = time + ms;
      while (true) {
        const next = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        jobs.delete(next[0]);
        time = next[1].at;
        next[1].fn();
      }
      time = end;
    },
    count: () => jobs.size,
  };
}
const clock = fakeClock(),
  loader = createSiteLoading(clock);
assert.equal(clock.count(), 0, "SSR schedules no client timers");
assert.equal(loader.getServerSnapshot().visible, true, "First HTML contains the loader");
assert.equal(loader.getServerSnapshot().progress, 0, "SSR begins at zero without timers");
const unmount = loader.mount();
const portalDone = loader.begin("Портал"),
  imageDone = loader.begin("Изображение");
loader.ready();
imageDone();
imageDone();
assert.equal(
  loader.getSnapshot().progress,
  60,
  "Completed tracked milestones advance the estimate",
);
clock.advance(400);
assert.equal(
  loader.getSnapshot().visible,
  true,
  "Concurrent portal still loading after image completes",
);
portalDone();
assert.equal(loader.getSnapshot().progress, 100, "Only the final release completes progress");
clock.advance(0);
assert.equal(loader.getSnapshot().visible, false);
const fastDone = loader.begin("Кэш");
assert.equal(loader.getSnapshot().progress, 0, "A new busy period resets the previous percentage");
clock.advance(120);
fastDone();
clock.advance(500);
assert.equal(loader.getSnapshot().visible, false, "Fast completion never flashes");
const aborted = loader.begin("Переход");
clock.advance(179);
aborted();
clock.advance(50);
assert.equal(loader.getSnapshot().visible, false, "Unmount before delay cancels presentation");
const first = loader.begin("Первая страница");
clock.advance(180);
first();
clock.advance(100);
const second = loader.begin("Следующая страница");
clock.advance(220);
assert.equal(loader.getSnapshot().visible, true, "A new request cancels a pending hide");
assert.equal(loader.getSnapshot().label, "Следующая страница");
second();
clock.advance(0);
assert.equal(loader.getSnapshot().visible, false);
const slowDone = loader.begin("Долгий запрос");
clock.advance(10_180);
assert.equal(loader.getSnapshot().slow, true);
loader.dismiss();
const overlap = loader.begin("Дополнительный запрос");
clock.advance(500);
assert.equal(
  loader.getSnapshot().visible,
  false,
  "Dismissal stays effective during the same busy period",
);
slowDone();
overlap();
const next = loader.begin("Новый запрос");
clock.advance(180);
assert.equal(loader.getSnapshot().visible, true, "Next operation can display loading again");
next();
clock.advance(320);
assert.equal(loader.getSnapshot().visible, false);
unmount();
assert.equal(clock.count(), 0, "Unmount clears every timer");
const isolated = createSiteLoading(fakeClock());
assert.equal(isolated.getSnapshot().visible, true, "Separate roots do not inherit dismissed state");
loader.mount();
clock.advance(500);
assert.equal(
  loader.getSnapshot().visible,
  false,
  "Effect remount does not resurrect completed work",
);

// Native login: validation/prevented submits stay untouched; POST data is never inspected.
const tunedClock = fakeClock(),
  tuned = createSiteLoading(tunedClock);
tuned.configure({ showDelay: 600, minVisible: 900, slowAfter: 5000 });
const stopTuned = tuned.mount();
tuned.ready();
tunedClock.advance(900);
const doneTuned = tuned.begin("Настроенный показ");
tunedClock.advance(599);
assert.equal(tuned.getSnapshot().visible, false);
tunedClock.advance(1);
assert.equal(tuned.getSnapshot().visible, true);
doneTuned();
tunedClock.advance(899);
assert.equal(tuned.getSnapshot().visible, true);
tunedClock.advance(1);
assert.equal(tuned.getSnapshot().visible, false);
stopTuned();
assert.equal(tunedClock.count(), 0);

// Unknown task weights remain estimates, capped until every registered task releases.
const progressClock = fakeClock(),
  estimated = createSiteLoading(progressClock);
const stopEstimate = estimated.mount();
const remaining = estimated.begin("Долгая загрузка");
estimated.ready();
const milestone = estimated.getSnapshot().progress;
const later = estimated.begin("Поздно обнаруженная задача");
assert.equal(
  estimated.getSnapshot().progress,
  milestone,
  "Adding tasks never moves progress backwards",
);
progressClock.advance(30_000);
assert.equal(estimated.getSnapshot().progress, 94, "Elapsed time cannot claim completion");
assert.equal(progressClock.count(), 0, "The estimate stops scheduling ticks once capped");
later();
assert.equal(estimated.getSnapshot().progress, 94, "One unfinished task keeps the cap");
remaining();
assert.equal(estimated.getSnapshot().progress, 100);
assert.equal(progressClock.count(), 1, "Completion uses only the existing hide timer");
progressClock.advance(0);
assert.equal(estimated.getSnapshot().visible, false, "No extra wait is added for the percentage");
const resetEstimate = estimated.begin("Следующая загрузка");
assert.equal(estimated.getSnapshot().progress, 0);
progressClock.advance(1000);
assert.ok(estimated.getSnapshot().progress > 0 && estimated.getSnapshot().progress < 94);
stopEstimate();
assert.equal(progressClock.count(), 0, "Unmount during loading cancels the estimate timer");
resetEstimate();

const loginClock = fakeClock(),
  handlers = {},
  windowHandlers = {};
const button = { disabled: false },
  attrs = new Map();
const form = {
  addEventListener: (name, fn) => (handlers[name] = fn),
  setAttribute: (k, v) => attrs.set(k, v),
  removeAttribute: (k) => attrs.delete(k),
  querySelector: (selector) => {
    assert.equal(selector, "button");
    return button;
  },
};
const percentAttrs = new Map(),
  percentStyles = new Map();
const percent = {
  style: { setProperty: (key, value) => percentStyles.set(key, value) },
  setAttribute: (key, value) => percentAttrs.set(key, value),
};
const percentValue = { textContent: "0%" };
const overlay = {
  hidden: true,
  querySelector: (selector) => {
    if (selector === "[data-loading-percent]") return percent;
    if (selector === "[data-loading-percent-value]") return percentValue;
    throw new Error(`Unexpected overlay query: ${selector}`);
  },
};
vm.runInNewContext(await readFile("public/loading/gate.js", "utf8"), {
  document: {
    querySelector: (selector) => (selector === "[data-gate-loading]" ? overlay : form),
    getElementById: () => ({ textContent: JSON.stringify({ showDelay: 500 }) }),
  },
  window: { addEventListener: (name, fn) => (windowHandlers[name] = fn) },
  setTimeout: loginClock.set,
  clearTimeout: loginClock.clear,
  Date: { now: loginClock.now },
});
handlers.submit({ defaultPrevented: true });
loginClock.advance(1000);
assert.equal(overlay.hidden, true);
assert.equal(button.disabled, false);
handlers.submit({ defaultPrevented: false });
loginClock.advance(499);
assert.equal(overlay.hidden, true, "Native login honors published delay");
loginClock.advance(1);
assert.equal(overlay.hidden, false);
assert.equal(button.disabled, true);
loginClock.advance(8000);
assert.ok(Number(percentAttrs.get("aria-valuenow")) > 0);
assert.ok(
  Number(percentAttrs.get("aria-valuenow")) <= 94,
  "Native POST never fabricates completion",
);
assert.match(percentAttrs.get("aria-valuetext"), /Приблизительно/);
windowHandlers.pageshow();
assert.equal(overlay.hidden, true);
assert.equal(button.disabled, false);
assert.equal(loginClock.count(), 0, "BFCache restore clears stale loading");
assert.equal(percentValue.textContent, "0%", "BFCache restore resets percentage while hidden");
handlers.submit({ defaultPrevented: false });
loginClock.advance(12_000);
assert.equal(overlay.hidden, true);
assert.equal(button.disabled, false, "Stalled navigation remains retryable");
assert.equal(loginClock.count(), 0, "Stalled POST clears progress and navigation timers");
console.log(
  "PASS: concurrent loading, bounded milestone progress, quick/aborted navigation, delayed hide, slow request dismissal, SSR isolation, timer cleanup and native login lifecycle",
);
