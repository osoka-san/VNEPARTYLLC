import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/lib/cookie-notice.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const {
  COOKIE_NOTICE_KEY,
  COOKIE_NOTICE_MAX_AGE,
  cookieNoticeStorage,
  parseCookieNotice,
  readCookieNotice,
  saveCookieNotice,
} = await import(
  "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
);
const now = Date.UTC(2026, 9, 6);
const records = new Map();
const storage = {
  getItem: (key) => records.get(key) ?? null,
  setItem: (key, value) => records.set(key, value),
};
assert.equal(cookieNoticeStorage(), null, "SSR never accesses browser storage");
assert.equal(readCookieNotice(storage, now), null, "A first visit requires an explicit choice");
assert.equal(records.size, 0, "Reading does not imply consent or write a record");
assert.equal(saveCookieNotice(storage, now), true);
assert.deepEqual(readCookieNotice(storage, now + 1), {
  version: 1,
  scope: "technical",
  acceptedAt: now,
});
assert.equal(readCookieNotice(storage, now + COOKIE_NOTICE_MAX_AGE - 1)?.scope, "technical");
assert.equal(
  readCookieNotice(storage, now + COOKIE_NOTICE_MAX_AGE),
  null,
  "An expired record requires a new choice",
);
assert.equal(
  readCookieNotice(storage, now - 1),
  null,
  "Future-dated values cannot hide the notice",
);
assert.deepEqual(
  [...records.keys()],
  [COOKIE_NOTICE_KEY],
  "Saving changes no motion settings or session credentials",
);
for (const raw of [
  "not json",
  "null",
  "[]",
  "true",
  '{"version":0,"scope":"technical","acceptedAt":1}',
  '{"version":1,"scope":"all","acceptedAt":1}',
  '{"version":1,"scope":"technical","acceptedAt":"yesterday"}',
]) {
  assert.equal(
    parseCookieNotice(raw, now),
    null,
    "Invalid, old, or broader permission is not accepted",
  );
}
const blocked = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};
assert.equal(readCookieNotice(blocked, now), null);
assert.equal(
  saveCookieNotice(blocked, now),
  false,
  "A blocked write is not reported as persistent",
);
assert.equal(saveCookieNotice(null, now), false);
assert.equal(
  readCookieNotice({ getItem: () => records.get(COOKIE_NOTICE_KEY), setItem() {} }, now)?.scope,
  "technical",
  "A subsequent visit reads the saved choice",
);
records.clear();
assert.equal(
  readCookieNotice(storage, now),
  null,
  "Clearing site data makes the notice eligible again",
);
console.log(
  "PASS: explicit technical-only choice, persistence, version/expiry, invalid values, SSR, and blocked storage",
);
