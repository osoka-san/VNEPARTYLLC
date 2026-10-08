import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MfaPrivacyFence,
  subscribeScannerMfaPrivacy,
} from "../../src/lib/auth/scanner-mfa-lifecycle.ts";
import { DRAFT_SIGNOUT_EVENT } from "../../src/lib/questionnaire-draft-session.ts";
function setup() {
  const win = new EventTarget(),
    doc = Object.assign(new EventTarget(), { hidden: false });
  const channel = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const fence = new MfaPrivacyFence();
  const ui = { secret: "SYNTHETIC", code: "123456", factor: "synthetic-factor", ready: true };
  const stop = subscribeScannerMfaPrivacy(
    fence,
    (signout) => {
      ui.secret = "";
      ui.code = "";
      if (signout) {
        ui.factor = "";
        ui.ready = false;
      }
    },
    win,
    doc,
    channel,
  );
  return { win, doc, channel, fence, ui, stop };
}
for (const source of ["same-tab", "cross-tab"] as const)
  test(
    source + " logout clears state and blocks stale initial/enrollment/verify replies",
    async () => {
      const s = setup();
      const initial = s.fence.ticket();
      const enrollment = s.fence.next()!;
      if (source === "same-tab") s.win.dispatchEvent(new Event(DRAFT_SIGNOUT_EVENT));
      else s.channel.onmessage!(new MessageEvent("message", { data: "clear" }));
      assert.deepEqual(s.ui, { secret: "", code: "", factor: "", ready: false });
      for (const old of [initial, enrollment]) assert.equal(s.fence.accepts(old, false), false);
      assert.equal(s.fence.next(), null);
      s.stop();
    },
  );
test("hide clears QR/code and blocks late enrollment while retaining nonsensitive factor", () => {
  const s = setup(),
    old = s.fence.next()!;
  s.doc.hidden = true;
  s.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(s.ui.secret, "");
  assert.equal(s.ui.code, "");
  assert.equal(s.ui.factor, "synthetic-factor");
  s.doc.hidden = false;
  assert.equal(s.fence.accepts(old, false), false);
  assert.equal(s.fence.accepts(s.fence.next()!, false), true);
  s.stop();
});
test("unmount invalidates outstanding completion and removes listeners/channel", () => {
  const s = setup(),
    old = s.fence.next()!;
  s.stop();
  assert.equal(s.fence.accepts(old, false), false);
  assert.equal(s.channel.closed, true);
  assert.equal(s.channel.onmessage, null);
});
test("logout between successful verify and fresh state read cannot re-enable UI", async () => {
  const s = setup(),
    verify = s.fence.next()!;
  assert.equal(s.fence.accepts(verify, false), true);
  const fresh = Promise.resolve({ aal2: true });
  s.channel.onmessage!(new MessageEvent("message", { data: "clear" }));
  await fresh;
  assert.equal(s.fence.accepts(verify, false), false);
  assert.equal(s.ui.ready, false);
  s.stop();
});

test("pagehide clears QR/code and fences late replies even without hidden visibility", () => {
  const s = setup(),
    old = s.fence.next()!;
  s.win.dispatchEvent(new Event("pagehide"));
  assert.equal(s.ui.secret, "");
  assert.equal(s.ui.code, "");
  assert.equal(s.fence.accepts(old, false), false);
  s.stop();
});
