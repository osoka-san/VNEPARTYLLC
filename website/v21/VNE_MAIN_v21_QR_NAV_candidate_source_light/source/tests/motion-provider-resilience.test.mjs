import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Run the provider's mount effect without a browser. The Supabase proxy models
// the synchronous initialization failure that previously reached the root boundary.
const source = readFileSync(new URL("../src/components/motion/MotionProvider.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll("import.meta.env", "__viteEnv");

function mount({ configured = false, storageBlocked = false, personal = null, query = () => Promise.resolve({ data: null }) } = {}) {
  const effects = [], states = [], listeners = new Map();
  const embedded = { duration: 1.3 }, saved = personal ?? embedded;
  let backendCalls = 0;
  const exports = {};
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useContext: () => ({}),
    useEffect: (effect) => effects.push(effect),
    useState: (initial) => {
      const index = states.push(initial) - 1;
      return [initial, (next) => { states[index] = next; }];
    },
    useMemo: (factory) => factory(),
  };
  const settings = {
    MOTION_SCHEMA_VERSION: 6,
    MOTION_SETTINGS_KEY: "vne.motion.settings",
    MOTION_SETTINGS_EVENT: "vne:motion-settings",
    defaultMotionSettings: embedded,
    readStoredMotionSettings: () => saved,
    sanitizeMotionSettings: (value) => value,
  };
  const supabase = new Proxy({}, { get() {
    backendCalls++;
    const result = query();
    return () => ({ select: () => ({ eq: () => ({ maybeSingle: () => result }) }) });
  } });
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: () => null };
      if (name === "motion/react") return { MotionConfig: "motion" };
      if (name.includes("motion-settings")) return settings;
      if (name.includes("supabase/client")) return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
    __viteEnv: configured ? { VITE_SUPABASE_URL: "https://example.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "test-only" } : {},
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      localStorage: { getItem() {
        if (storageBlocked) throw new Error("Storage denied");
        return personal ? JSON.stringify(personal) : null;
      } },
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    document: { documentElement: { dataset: {} } },
    MutationObserver: class { observe() {} disconnect() {} },
  });
  exports.MotionProvider({ children: null });
  const cleanup = effects[0]();
  return { states, listeners, cleanup, backendCalls: () => backendCalls, embedded };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("no backend or inaccessible storage does not prevent mount and cleanup", async () => {
  for (const storageBlocked of [false, true]) {
    const app = mount({ storageBlocked });
    await settle();
    assert.equal(app.backendCalls(), 0);
    assert.deepEqual(app.states[1], app.embedded);
    assert.equal(app.listeners.size, 2);
    app.cleanup();
    assert.equal(app.listeners.size, 0);
  }
});

test("synchronous client failures and rejected requests keep the embedded settings", async () => {
  for (const query of [
    () => { throw new ReferenceError("process is not defined"); },
    () => Promise.reject(new Error("Network unavailable")),
  ]) {
    const app = mount({ configured: true, query });
    await settle();
    assert.equal(app.backendCalls(), 1);
    assert.deepEqual(app.states[1], app.embedded);
    assert.equal(app.listeners.size, 2);
    app.cleanup();
  }
});

test("configured remote defaults load while personal settings retain priority", async () => {
  const remote = { duration: 0.8 };
  for (const personal of [null, { duration: 0.5 }]) {
    const app = mount({ configured: true, personal, query: () => Promise.resolve({ data: { schema_version: 6, settings: remote } }) });
    await settle();
    assert.deepEqual(app.states[2], remote);
    assert.deepEqual(app.states[1], personal ?? remote);
    app.cleanup();
  }
});

test("late responses do not overwrite a new personal choice or update an unmounted provider", async () => {
  for (const unmount of [false, true]) {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const app = mount({ configured: true, query: () => pending });
    const personal = { duration: 0.4 };
    if (unmount) app.cleanup();
    else app.listeners.get("vne:motion-settings")({ detail: personal });
    resolve({ data: { schema_version: 6, settings: { duration: 0.8 } } });
    await settle();
    assert.deepEqual(app.states[1], unmount ? app.embedded : personal);
    if (unmount) assert.deepEqual(app.states[2], app.embedded);
    else app.cleanup();
  }
});
