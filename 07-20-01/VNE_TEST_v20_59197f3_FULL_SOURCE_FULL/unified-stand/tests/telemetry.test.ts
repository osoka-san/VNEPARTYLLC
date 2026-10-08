import { describe, test } from "node:test";
import assert from "node:assert/strict";
const expect = (value: unknown) => ({
  toHaveLength: (n: number) => assert.equal((value as unknown[]).length, n),
  toBe: (expected: unknown) => assert.equal(value, expected),
  not: { toContain: (needle: string) => assert.ok(!String(value).includes(needle)) },
});
import {
  createTelemetryStore,
  LIMIT,
  exampleEntries,
  selectEntries,
  serializeEntries,
} from "../../src/components/diagnostics/telemetry.ts";
describe("preview-only telemetry", () => {
  test("accepts only fixed event types and areas, never raw payloads", () => {
    const store = createTelemetryStore();
    store.record({ message: "Bearer secret", cookie: "secret" });
    store.record("__proto__");
    store.record("constructor");
    expect(store.getSnapshot()).toHaveLength(0);
    store.record("render_failed", "/private?password=secret&email=person@example.com");
    const json = serializeEntries(store.getSnapshot());
    expect(json).not.toContain("secret");
    expect(json).not.toContain("@");
    expect(store.getSnapshot()[0].area).toBe("public");
  });
  test("bounded immutable ring buffer and clear notification", () => {
    const store = createTelemetryStore();
    let notices = 0;
    const unsubscribe = store.subscribe(() => notices++);
    for (let n = 0; n < LIMIT + 35; n++) store.record("page_ready");
    expect(store.getSnapshot()).toHaveLength(LIMIT);
    expect(Object.isFrozen(store.getSnapshot())).toBe(true);
    expect(store.getSnapshot()[0].id).toBe("local-36");
    store.clear();
    expect(store.getSnapshot()).toHaveLength(0);
    expect(notices).toBe(LIMIT + 36);
    unsubscribe();
    store.record("page_ready");
    expect(notices).toBe(LIMIT + 36);
  });
  test("filter severity, date, query and correlation", () => {
    const now = 1800000000000;
    const rows = exampleEntries(now);
    expect(selectEntries(rows, "", "error", 0, now)).toHaveLength(2);
    expect(selectEntries(rows, "demo-flow-01", "all", 0, now)).toHaveLength(4);
    expect(selectEntries(rows, "404", "all", 0, now)).toHaveLength(1);
    expect(selectEntries(rows, "", "all", 1, now)).toHaveLength(1);
    expect(rows.every((row) => row.origin === "example")).toBe(true);
  });
  test("export boundary excludes unknown injected fields", () => {
    const row = {
      ...exampleEntries(Date.now())[0],
      password: "forbidden",
      cookie: "forbidden",
      body: "forbidden",
    };
    expect(serializeEntries([row])).not.toContain("forbidden");
  });
});
