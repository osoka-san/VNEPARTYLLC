import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["src/lib/motion-settings.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
});
const base = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);
const source = readFileSync("src/components/motion/MotionProvider.tsx", "utf8");
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replaceAll("import.meta.env", "__viteEnv");
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function mount({
  localOnly = false,
  configured = false,
  systemReduced = false,
  storageBlocked = false,
  personal = null,
  defaults = () => Promise.reject(new Error("unavailable")),
  query = () => Promise.resolve({ data: null }),
} = {}) {
  const effects = [],
    states = [],
    listeners = new Map(),
    writes = [];
  let imports = 0,
    backendCalls = 0,
    loadingTasks = 0,
    api;
  const Provider = {};
  const react = {
    createContext: () => ({ Provider }),
    useContext: () => ({}),
    useEffect: (effect) => effects.push(effect),
    useState: (initial) => {
      const i = states.push(typeof initial === "function" ? initial() : initial) - 1;
      return [
        states[i],
        (value) => {
          states[i] = value;
        },
      ];
    },
    useMemo: (fn) => fn(),
    useRef: (current) => ({ current }),
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => {
            if (type === Provider) api = props.value;
            return null;
          },
        };
      if (name === "motion/react") return { MotionConfig: "motion" };
      if (name.includes("motion-settings"))
        return {
          ...base,
          readStoredMotionSettings: () => personal ?? base.defaultMotionSettings,
          writeStoredMotionSettings: (x) => writes.push(x),
        };
      if (name.includes("loading-settings")) return { readLoadingBootstrap: () => null };
      if (name.includes("SiteLoading"))
        return {
          useLoadingPresentation() {},
          useBeginSiteLoading: () => () => {
            loadingTasks++;
            return () => {};
          },
        };
      if (name.includes("preview-defaults")) return { requestPreviewDefaults: defaults };
      if (name.includes("supabase/client")) {
        imports++;
        return {
          supabase: {
            from() {
              backendCalls++;
              const p = query();
              return { select: () => ({ eq: () => ({ maybeSingle: () => p }) }) };
            },
          },
        };
      }
      throw new Error("Unexpected import: " + name);
    },
    __viteEnv: configured
      ? {
          VITE_SUPABASE_URL: "https://invalid.example",
          VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-only",
        }
      : {},
    window: {
      matchMedia: (q) => ({
        matches: q.includes("reduced-motion") && systemReduced,
        addEventListener() {},
        removeEventListener() {},
      }),
      localStorage: {
        getItem() {
          if (storageBlocked) throw new Error("denied");
          return personal ? "saved" : null;
        },
      },
      addEventListener: (n, f) => listeners.set(n, f),
      removeEventListener: (n) => listeners.delete(n),
    },
    document: { documentElement: { dataset: {}, style: { setProperty() {} } } },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  exports.MotionProvider({ children: null, localOnly });
  const cleanup = effects[0]();
  return {
    states,
    writes,
    cleanup,
    listeners,
    api,
    stats: () => ({ imports, backendCalls, loadingTasks }),
  };
}

test("unresolved optional defaults never register a page-blocking loading task", async () => {
  const pending = deferred();
  const app = mount({ defaults: () => pending.promise });
  assert.deepEqual(app.stats(), { imports: 0, backendCalls: 0, loadingTasks: 0 });
  assert.equal(JSON.stringify(app.states[1]), JSON.stringify(base.defaultMotionSettings));
  pending.resolve({ version: 3, settings: { ...base.defaultMotionSettings, pageDuration: 0.7 } });
  await settle();
  assert.equal(app.states[1].pageDuration, 0.7);
  assert.equal(app.states[4], 3);
  app.cleanup();
  assert.equal(app.listeners.size, 0);
});
test("unconfigured Sites does not import Supabase even when defaults fail or storage is denied", async () => {
  for (const storageBlocked of [false, true]) {
    const app = mount({ storageBlocked });
    await settle();
    assert.deepEqual(app.stats(), { imports: 0, backendCalls: 0, loadingTasks: 0 });
    app.cleanup();
  }
});
test("configured fallback imports only after defaults fail and survives backend rejection", async () => {
  for (const query of [
    () =>
      Promise.resolve({
        data: {
          schema_version: base.MOTION_SCHEMA_VERSION,
          settings: { ...base.defaultMotionSettings, duration: 0.6 },
        },
      }),
    () => {
      throw new Error("client failed");
    },
    () => Promise.reject(new Error("offline")),
  ]) {
    const app = mount({ configured: true, query });
    assert.equal(app.stats().imports, 0);
    await settle();
    assert.equal(app.stats().imports, 1);
    assert.equal(app.stats().backendCalls, 1);
    assert.equal(app.stats().loadingTasks, 0);
    app.cleanup();
  }
});
test("published defaults cannot overwrite a live edit made while loading", async () => {
  const pending = deferred();
  const app = mount({ defaults: () => pending.promise });
  app.api.updateSettings({ pageDuration: 0.25 });
  pending.resolve({ version: 4, settings: { ...base.defaultMotionSettings, pageDuration: 0.9 } });
  await settle();
  assert.equal(app.states[1].pageDuration, 0.25);
  assert.equal(app.states[2].pageDuration, 0.9);
  app.cleanup();
});
test("reduced motion stays authoritative and late replies do not update unmounted provider", async () => {
  const pending = deferred();
  const app = mount({ systemReduced: true, defaults: () => pending.promise });
  assert.equal(app.states[0].reduced, true);
  const before = app.states.slice();
  app.cleanup();
  pending.resolve({ version: 4, settings: { ...base.defaultMotionSettings, pageDuration: 0.9 } });
  await settle();
  assert.deepEqual(app.states, before);
});

test("a defaults rejection after unmount never imports the optional auth client", async () => {
  const pending = deferred();
  const app = mount({ configured: true, defaults: () => pending.promise });
  app.cleanup();
  pending.reject(new Error("late failure"));
  await settle();
  assert.deepEqual(app.stats(), { imports: 0, backendCalls: 0, loadingTasks: 0 });
});

test("Unified local-only motion never contacts defaults or Auth, and cannot publish settings", async () => {
  let defaultReads = 0;
  const app = mount({
    localOnly: true,
    configured: true,
    defaults: () => {
      defaultReads++;
      return Promise.reject(new Error("forbidden"));
    },
  });
  await settle();
  assert.equal(defaultReads, 0);
  assert.deepEqual(app.stats(), { imports: 0, backendCalls: 0, loadingTasks: 0 });
  await assert.rejects(app.api.refreshSiteDefaults(), /unavailable/);
  await assert.rejects(app.api.saveSiteDefaults([]), /unavailable/);
  app.cleanup();
});
