import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isNearLogBottom,
  shouldFollowLogAppend,
} from "../../src/components/diagnostics/log-follow.ts";

const before = { view: "browser/all", latestId: "local-20", visibleLatestId: "local-20" };
const appended = { ...before, latestId: "local-21", visibleLatestId: "local-21" };
const follow = (next = appended, near = true, reading = false, enabled = true) =>
  shouldFollowLogAppend(before, next, enabled, near, reading);

test("clock ticks and identical recreated views never scroll", () => {
  assert.equal(follow({ ...before }), false);
});
test("only a visible append follows, including a full rolling buffer", () => {
  assert.equal(follow(), true);
  assert.equal(follow({ ...appended, visibleLatestId: before.visibleLatestId }), false);
  assert.equal(follow({ ...before, visibleLatestId: undefined }), false);
  assert.equal(follow({ ...before, latestId: undefined, visibleLatestId: undefined }), false);
});
test("deliberate scroll-up, keyboard focus and open details prevent follow", () => {
  assert.equal(follow(appended, false), false);
  assert.equal(follow(appended, true, true), false);
});
test("pause, follow toggle, filter and source transitions establish a fresh baseline", () => {
  for (const view of [
    "paused",
    "follow-off",
    "browser/error",
    "browser/search",
    "browser/15min",
    "example/all",
  ])
    assert.equal(follow({ ...appended, view }), false);
  assert.equal(follow(appended, true, false, false), false);
  assert.equal(shouldFollowLogAppend(null, appended, true, true, false), false);
});
test("bottom tolerance is bounded and accommodates subpixel/short lists", () => {
  assert.equal(isNearLogBottom({ scrollHeight: 800, clientHeight: 480, scrollTop: 296 }), true);
  assert.equal(isNearLogBottom({ scrollHeight: 800, clientHeight: 480, scrollTop: 295.5 }), false);
  assert.equal(isNearLogBottom({ scrollHeight: 250, clientHeight: 250, scrollTop: 0 }), true);
});
