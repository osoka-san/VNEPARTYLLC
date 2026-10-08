import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the real component handlers with deterministic React-hook/timer shims.
// These are interaction unit tests, not DOM, layout or browser E2E evidence.
const compiled = ts.transpileModule(readFileSync("src/components/app/CookieNotice.tsx", "utf8"), {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function mount({ stored = false, saved = true, reduced = false, menuMotion = true } = {}) {
  let cursor = 0,
    tree,
    writes = 0,
    time = 0,
    nextTimer = 0,
    mainFocus = 0;
  const hooks = [],
    effects = [],
    cleanups = [],
    timers = new Map(),
    listeners = new Map();
  const document = {
    activeElement: null,
    querySelector: () => ({
      focus: () => {
        mainFocus++;
        document.activeElement = "main";
      },
    }),
  };
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useContext: () => ({}),
    useRef: (value) => {
      const i = cursor++;
      return (hooks[i] ??= { current: value });
    },
    useState: (initial) => {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [
        hooks[i],
        (value) => {
          hooks[i] = typeof value === "function" ? value(hooks[i]) : value;
        },
      ];
    },
    useEffect: (effect) => {
      const i = cursor++;
      if (!(i in hooks)) {
        hooks[i] = true;
        effects.push(effect);
      }
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    document,
    HTMLElement: class {},
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, { fn, at: time + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    window: {
      matchMedia: () => ({ matches: true }),
      addEventListener: (key, fn) => listeners.set(key, fn),
      removeEventListener: (key) => listeners.delete(key),
    },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@tanstack/react-router") return { Link: "link" };
      if (name === "lucide-react") return { ArrowUpRight: "arrow", ChevronDown: "chevron" };
      if (name === "@/content/cookies")
        return { cookieIntroduction: "Original introduction", cookieNoticeScope: "Original scope" };
      if (name === "@/lib/cookie-notice")
        return {
          COOKIE_NOTICE_KEY: "vne.cookie-notice",
          cookieNoticeStorage: () => ({}),
          readCookieNotice: () => stored,
          parseCookieNotice: (value) => value === "valid",
          saveCookieNotice: () => {
            writes++;
            return saved;
          },
        };
      if (name.includes("MotionProvider"))
        return { useMotionEnv: () => ({ reduced, settings: { menuMotion } }) };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function render() {
    cursor = 0;
    tree = exports.CookieNoticeProvider({ children: "route" });
    return tree;
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const result = child == null ? null : find(predicate, child);
      if (result) return result;
    }
    return null;
  }
  render();
  effects.forEach((effect) => cleanups.push(effect()));
  render();
  return {
    render,
    find,
    document,
    byClass: (name) => find((node) => node.props?.className === name),
    writes: () => writes,
    timers: () => timers.size,
    mainFocus: () => mainFocus,
    tick(ms) {
      time += ms;
      for (const [id, timer] of timers)
        if (timer.at <= time) {
          timers.delete(id);
          timer.fn();
        }
      render();
    },
    sync(value) {
      listeners.get("storage")({ key: "vne.cookie-notice", newValue: value });
      render();
    },
    open() {
      tree.props.value.openNotice();
      render();
    },
    cleanup() {
      cleanups.forEach((cleanup) => cleanup?.());
    },
  };
}

test("first visit is collapsed; hidden details are out of the tab order; OK accepts immediately once", () => {
  const app = mount();
  assert.equal(app.byClass("vne-cookie-notice").props["data-expanded"], false);
  assert.equal(app.byClass("vne-cookie-body").props.hidden, true);
  const button = app.byClass("vne-cookie-accept");
  assert.equal(button.props.onPointerEnter, undefined, "OK does not trigger reveal");
  button.props.onClick();
  button.props.onClick();
  app.render();
  assert.equal(app.writes(), 1);
  assert.equal(app.byClass("vne-cookie-notice").props["data-phase"], "accepted");
  assert.equal(app.byClass("vne-cookie-accept").props["aria-disabled"], true);
  assert.equal(app.find((node) => node.props?.role === "status").props.children, "Выбор сохранён.");
  app.tick(320);
  assert.equal(app.byClass("vne-cookie-notice").props["data-phase"], "leaving");
  app.tick(360);
  assert.equal(app.byClass("vne-cookie-notice"), null);
});

test("mouse hover reveals; touch pointer does not consume the first tap; disclosure click toggles", () => {
  const app = mount();
  app.byClass("vne-cookie-disclosure").props.onPointerEnter({ pointerType: "touch" });
  app.render();
  assert.equal(app.byClass("vne-cookie-body").props.hidden, true);
  app.byClass("vne-cookie-disclosure").props.onClick();
  app.render();
  assert.equal(app.byClass("vne-cookie-disclosure").props["aria-expanded"], true);
  app.byClass("vne-cookie-disclosure").props.onClick();
  app.render();
  assert.equal(app.byClass("vne-cookie-body").props.hidden, true);
  app.byClass("vne-cookie-disclosure").props.onPointerEnter({ pointerType: "mouse" });
  app.render();
  assert.equal(app.byClass("vne-cookie-body").props.hidden, false);
  app.byClass("vne-cookie-notice").props.onPointerLeave({ pointerType: "mouse" });
  app.render();
  assert.equal(app.byClass("vne-cookie-body").props.hidden, true);
  assert.equal(app.writes(), 0);
});

test("Escape collapses and returns focus to disclosure; pointer leaving preserves keyboard content", () => {
  const app = mount();
  app.open();
  let focused = 0,
    stopped = 0;
  app.byClass("vne-cookie-disclosure").props.ref.current = { focus: () => focused++ };
  app.byClass("vne-cookie-notice").props.ref.current = { contains: () => true };
  app.byClass("vne-cookie-notice").props.onPointerLeave({ pointerType: "mouse" });
  app.render();
  assert.equal(app.byClass("vne-cookie-body").props.hidden, false);
  app
    .byClass("vne-cookie-notice")
    .props.onKeyDown({ key: "Escape", stopPropagation: () => stopped++ });
  app.render();
  assert.equal(focused, 1);
  assert.equal(stopped, 1);
  assert.equal(app.byClass("vne-cookie-body").props.hidden, true);
});

test("blocked storage reports current-view acceptance without inventing persistence", () => {
  const app = mount({ saved: false });
  app.byClass("vne-cookie-accept").props.onClick();
  app.render();
  assert.match(
    app.find((node) => node.props?.role === "status").props.children,
    /Браузер не разрешил сохранить/,
  );
  app.tick(680);
  assert.equal(app.byClass("vne-cookie-notice"), null);
});

test("reduced motion and disabled menu motion keep mint feedback, skip exit movement", () => {
  for (const options of [{ reduced: true }, { menuMotion: false }]) {
    const app = mount(options);
    app.byClass("vne-cookie-accept").props.onClick();
    app.render();
    assert.equal(app.byClass("vne-cookie-notice").props["data-motion"], false);
    assert.equal(app.byClass("vne-cookie-notice").props["data-phase"], "accepted");
    assert.equal(app.timers(), 1);
    app.tick(320);
    assert.equal(app.byClass("vne-cookie-notice"), null);
  }
});

test("saved choice suppresses first display; reopening, storage sync and cleanup cancel pending motion", () => {
  const app = mount({ stored: true });
  assert.equal(app.byClass("vne-cookie-notice"), null);
  app.open();
  assert.equal(app.byClass("vne-cookie-body").props.hidden, false);
  app.byClass("vne-cookie-accept").props.onClick();
  app.open();
  app.tick(1000);
  assert.equal(app.byClass("vne-cookie-notice").props["data-phase"], "idle");
  app.byClass("vne-cookie-accept").props.onClick();
  app.sync(null);
  app.tick(1000);
  assert.equal(app.byClass("vne-cookie-notice").props["data-phase"], "idle");
  app.sync("valid");
  assert.equal(app.byClass("vne-cookie-notice"), null);
  app.open();
  app.byClass("vne-cookie-accept").props.onClick();
  app.cleanup();
  assert.equal(app.timers(), 0);
});

test("route rerenders preserve acceptance and focus restoration never steals focus elsewhere", () => {
  for (const focusInside of [true, false]) {
    const app = mount();
    app.byClass("vne-cookie-notice").props.ref.current = {
      contains: () => focusInside && app.document.activeElement !== "main",
    };
    app.byClass("vne-cookie-accept").props.onClick();
    app.render();
    app.render();
    app.tick(680);
    assert.equal(app.writes(), 1);
    assert.equal(app.mainFocus(), focusInside ? 1 : 0);
    assert.equal(app.byClass("vne-cookie-notice"), null);
  }
});

test("external dismissal restores focus; leaving notice is inert before removal", () => {
  for (const external of [true, false]) {
    const app = mount();
    app.byClass("vne-cookie-notice").props.ref.current = {
      contains: () => app.document.activeElement !== "main",
    };
    if (external) app.sync("valid");
    else {
      app.byClass("vne-cookie-accept").props.onClick();
      app.tick(320);
      assert.equal(app.byClass("vne-cookie-notice").props.inert, true);
    }
    assert.equal(app.mainFocus(), 1);
  }
});

test("cleared storage collapses to the disclosure without stranding focus in hidden content", () => {
  const app = mount();
  app.open();
  let focused = 0;
  app.byClass("vne-cookie-notice").props.ref.current = { contains: () => true };
  app.byClass("vne-cookie-disclosure").props.ref.current = { focus: () => focused++ };
  app.sync(null);
  assert.equal(focused, 1);
  assert.equal(app.byClass("vne-cookie-body").props.hidden, true);
  assert.equal(app.writes(), 0);
});
