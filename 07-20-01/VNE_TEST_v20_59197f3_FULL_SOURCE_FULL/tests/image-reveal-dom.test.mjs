import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Real ReactDOM and Motion with a controlled frame clock and viewport observer.
// Synthetic DOM checks styles and element identity, not browser pixels or GPU timing.
// Reuse the external DOM test runtime; do not change the app's dependencies/lockfile.
const { Window, EventTarget } = await import(process.env.VNE_DOM_RUNTIME || "happy-dom");
const window = new Window({
  url: "https://image-reveal.test/",
  settings: {
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
    disableIframePageLoading: true,
    disableComputedStyleRendering: true,
  },
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "SVGElement",
  "MutationObserver",
  "getComputedStyle",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "getComputedStyle" ? window[key].bind(window) : window[key],
  });
}
globalThis.EventTarget = EventTarget;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let now = 1000;
let nextFrame = 0;
const frames = new Map();
Object.defineProperty(performance, "now", { configurable: true, value: () => now });
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++nextFrame, callback);
  return nextFrame;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
window.innerHeight = 800;
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { top: 700, bottom: 900, left: 0, right: 300, width: 300, height: 200 };
};
const observers = new Set();
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    observers.add(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
};
const directory = mkdtempSync(join(tmpdir(), "vne-image-reveal-dom-"));
const bundle = join(directory, "fixture.mjs");
await build({
  stdin: {
    contents: `
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { renderToString } from 'react-dom/server';
      import { ImageReveal } from './src/components/motion/Primitives';
      import { MotionFixture } from '@/components/motion/MotionProvider';
      export { act };
      const content = <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Synthetic test image" />;
      const view = (props) => <MotionFixture {...props}><ImageReveal replay={props.replay}>{content}</ImageReveal></MotionFixture>;
      export function ssr(props = {}) { return renderToString(view(props)); }
      export async function mount(props = {}) {
        const host = document.createElement('div'); document.body.append(host);
        const root = createRoot(host);
        await act(async () => root.render(view(props)));
        return { host, async update(next) { props = { ...props, ...next }; await act(async () => root.render(view(props))); },
          async destroy() { await act(async () => root.unmount()); host.remove(); } };
      }
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"development"' },
  outfile: bundle,
  jsx: "automatic",
  plugins: [
    {
      name: "image-reveal-test-context",
      setup(plugin) {
        plugin.onResolve(
          { filter: /^(\.\/MotionProvider|@\/components\/motion\/MotionProvider)$/ },
          () => ({ path: "motion", namespace: "fixture" }),
        );
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `
          import React, { createContext, useContext } from 'react';
          import { MotionConfig } from 'motion/react';
          import { defaultMotionSettings } from '@/lib/motion-settings';
          const Context = createContext(null);
          export const useMotionEnv = () => useContext(Context);
          export const MotionFixture = ({ reduced = false, settings = {}, children }) =>
            <Context.Provider value={{ reduced, settings: { ...defaultMotionSettings, ...settings } }}>
              <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
            </Context.Provider>;
        `,
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const { mount, act, ssr } = await import(pathToFileURL(bundle));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});
async function frame(ms = 16) {
  await act(async () => {
    now += ms;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(now);
  });
}
async function enter(app) {
  await act(async () => {
    for (const observer of observers) {
      const entries = [...observer.targets]
        .filter((target) => app.host.contains(target))
        .map((target) => ({ target, isIntersecting: true }));
      if (entries.length) observer.callback(entries);
    }
  });
}
function layers(app) {
  const outer = app.host.querySelector("[data-image-reveal]");
  return { outer, inner: outer.firstElementChild, image: outer.querySelector("img") };
}
function assertFinal(app) {
  const { outer, inner } = layers(app);
  assert.equal(Number(outer.style.opacity || 1), 1, "image is fully visible");
  assert.ok(
    ["none", ""].includes(outer.style.transform),
    `translation reset: ${outer.style.transform}`,
  );
  assert.ok(["none", ""].includes(inner.style.transform), `scale reset: ${inner.style.transform}`);
}
async function reach(app, phase) {
  await frame();
  await frame();
  assert.equal(Number(layers(app).outer.style.opacity), 0, "starts hidden below the fold");
  if (phase === "hidden") return;
  await enter(app);
  await frame();
  await frame(100);
  const opacity = Number(layers(app).outer.style.opacity);
  assert.ok(opacity > 0 && opacity < 1, `real intermediate opacity: ${opacity}`);
  assert.match(layers(app).outer.style.transform, /translateY\(/);
  assert.match(layers(app).inner.style.transform, /scale\(/);
  if (phase === "visible") {
    await frame(600);
    assertFinal(app);
  }
}
const disabledModes = [
  ["system or manual reduced motion", { reduced: true }],
  ["imageReveal=false", { settings: { imageReveal: false } }],
  ["revealStyle=none", { settings: { revealStyle: "none" } }],
  ["duration=0", { settings: { duration: 0 } }],
];
for (const [name, options] of disabledModes) {
  test(`${name}: initial view and replay render the visible end state`, async () => {
    for (const replay of [false, true]) {
      const app = await mount({ ...options, replay });
      try {
        await frame();
        assertFinal(app);
        await frame(600);
        assertFinal(app);
      } finally {
        await app.destroy();
      }
    }
  });
  for (const phase of ["hidden", "entering", "visible"]) {
    test(`${name}: switching ${phase} reveals immediately without remounting the image`, async () => {
      const app = await mount();
      try {
        await reach(app, phase);
        const before = layers(app);
        await app.update(options);
        await frame();
        assertFinal(app);
        const after = layers(app);
        assert.equal(after.outer, before.outer);
        assert.equal(after.inner, before.inner);
        assert.equal(after.image, before.image);
        await frame(600);
        assertFinal(app);
        await enter(app);
        await app.update({ reduced: false, settings: {} });
        await frame();
        assertFinal(app);
        assert.equal(layers(app).image, before.image, "re-enabling keeps the loaded image");
      } finally {
        await app.destroy();
      }
    });
  }
}

test("enabled viewport reveal retains opacity, translation and scale and runs only once", async () => {
  const app = await mount();
  try {
    await reach(app, "visible");
    const image = layers(app).image;
    await enter(app);
    await frame();
    assertFinal(app);
    assert.equal(layers(app).image, image);
  } finally {
    await app.destroy();
  }
});

test("enabled replay still reveals, and disabling an in-flight replay stops it", async () => {
  for (const disable of [false, true]) {
    const app = await mount({ replay: true });
    try {
      const image = layers(app).image;
      await frame();
      assert.equal(Number(layers(app).outer.style.opacity), 0);
      await frame();
      await frame();
      await frame(100);
      const opacity = Number(layers(app).outer.style.opacity);
      assert.ok(opacity > 0 && opacity < 1, `replay is in flight: ${opacity}`);
      if (disable) {
        await app.update({ settings: { imageReveal: false } });
        await frame();
      } else await frame(600);
      assertFinal(app);
      assert.equal(layers(app).image, image);
    } finally {
      await app.destroy();
    }
  }
});

test("enabled short reveals preserve the outer duration and inner 450ms minimum", async () => {
  const app = await mount({ settings: { duration: 0.2 } });
  try {
    await reach(app, "entering");
    await frame(150);
    assert.equal(Number(layers(app).outer.style.opacity), 1);
    assert.match(layers(app).inner.style.transform, /scale\(/, "scale still settles separately");
    await frame(300);
    assertFinal(app);
  } finally {
    await app.destroy();
  }
});

test("disabling a hidden replay prevents its pending frames from starting another reveal", async () => {
  const app = await mount({ replay: true });
  try {
    await frame();
    assert.equal(Number(layers(app).outer.style.opacity), 0);
    const image = layers(app).image;
    await app.update({ reduced: true });
    await frame();
    assertFinal(app);
    await frame(100);
    assertFinal(app);
    await frame(600);
    assertFinal(app);
    assert.equal(layers(app).image, image);
  } finally {
    await app.destroy();
  }
});

test("SSR includes one ordinary image with no hidden first frame", () => {
  for (const options of [{}, { replay: true }, ...disabledModes.map(([, options]) => options)]) {
    const html = ssr(options);
    assert.equal((html.match(/<img /g) || []).length, 1);
    assert.match(html, /alt="Synthetic test image"/);
    assert.doesNotMatch(html, /opacity:0|translateY\(|scale\(/);
  }
});
