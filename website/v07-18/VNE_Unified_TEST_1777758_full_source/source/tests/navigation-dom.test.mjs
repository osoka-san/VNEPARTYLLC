import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Real ReactDOM, Radix Dialog/Collapsible and TanStack Router in a synthetic DOM.
// This does not render pixels, emulate layout or replace browser/device acceptance.
// Install happy-dom in a separate test-tools directory; never change the app lockfile.
const { Window } = await import(process.env.VNE_DOM_RUNTIME || "happy-dom");
const window = new Window({
  url: "https://navigation.test/",
  settings: {
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
    disableIframePageLoading: true,
    disableComputedStyleRendering: true,
    navigation: {
      disableMainFrameNavigation: true,
      disableChildFrameNavigation: true,
      disableChildPageNavigation: true,
      disableFallbackToSetURL: true,
    },
  },
});
for (const key of [
  "window",
  "self",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLAnchorElement",
  "HTMLInputElement",
  "Node",
  "NodeFilter",
  "Element",
  "MutationObserver",
  "CustomEvent",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "FocusEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "scrollTo",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value:
      typeof window[key] === "function" &&
      ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "scrollTo"].includes(
        key,
      )
        ? window[key].bind(window)
        : window[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const directory = mkdtempSync(join(tmpdir(), "vne-nav-dom-"));
const bundle = join(directory, "fixture.mjs");
await build({
  stdin: {
    contents: `
    import React, { act } from 'react';
    import { createRoot } from 'react-dom/client';
    import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from '@tanstack/react-router';
    import { AppHeader } from './src/components/app/AppHeader';
    import { MotionFixture } from '@/components/motion/MotionProvider';
    export { act };
    export async function mount({ reduced = false, menuMotion = true, path = '/' } = {}) {
      const host = document.createElement('div'); document.body.append(host);
      function Shell() { return <MotionFixture reduced={reduced} menuMotion={menuMotion}><AppHeader /><main id="main-content" tabIndex={-1}><Outlet /><section id="manifesto" tabIndex={-1}>Manifesto</section></main></MotionFixture>; }
      const rootRoute = createRootRoute({ component: Shell });
      const routes = ['/', '/about', '/apply', '/member', '/rules', '/faq', '/contact', '/events', '/events/$slug'].map(path => createRoute({getParentRoute: () => rootRoute, path, component: () => <h1>Fixture destination</h1>}));
      const history = createMemoryHistory({initialEntries: [path]});
      const router = createRouter({routeTree: rootRoute.addChildren(routes), history});
      await router.load();
      const root = createRoot(host);
      await act(async () => { root.render(<RouterProvider router={router} />); });
      return { router, root, host, history, async destroy() { await act(async () => root.unmount()); host.remove(); } };
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
      name: "test-only-context",
      setup(plugin) {
        plugin.onResolve({ filter: /^@\/components\/motion\/MotionProvider$/ }, () => ({
          path: "motion",
          namespace: "fixture",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `
      import React, { createContext, useContext } from 'react';
      import { defaultNavbarSettings } from '@/lib/navbar-settings';
      const Context = createContext(null);
      export const useMotionEnv = () => useContext(Context);
      export const MotionFixture = ({ reduced, menuMotion, children }) => <Context.Provider value={{reduced, settings: {menuMotion, navbar: defaultNavbarSettings}}}>{children}</Context.Provider>;
    `,
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
        plugin.onResolve({ filter: /^@\/components\/loading\/SiteLoading$/ }, () => ({
          path: "loading",
          namespace: "empty-loading",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "empty-loading" }, () => ({
          contents: "export function useSiteLoading() {}",
          loader: "js",
        }));
        plugin.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "text" }));
      },
    },
  ],
});
const { mount, act } = await import(pathToFileURL(bundle));
const query = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = async (element, options = {}) => {
  assert.ok(element, "click target exists");
  let event;
  await act(async () => {
    event = new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...options,
    });
    element.dispatchEvent(event);
  });
  return event;
};
const settle = async (ms = 0) =>
  act(async () => {
    await sleep(ms);
  });
async function open() {
  await click(query(".vne-menu-trigger"));
  await settle();
}
async function escape() {
  await act(async () =>
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    ),
  );
  await settle(5);
}

// These tests share one DOM deliberately; each mount is always cleaned up.
test("menu focuses Close, traps focus, Escape restores the trigger and releases scroll lock", async () => {
  const app = await mount();
  try {
    const trigger = query(".vne-menu-trigger");
    trigger.focus();
    await open();
    const panel = query('[role="dialog"]');
    assert.ok(panel);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(document.activeElement, query(".vne-menu-close"));
    assert.ok(document.body.hasAttribute("data-scroll-locked"), "Radix locks background scroll");
    query("#main-content").focus();
    assert.ok(panel.contains(document.activeElement), "focus cannot escape modal");
    const links = panel.querySelectorAll(".vne-menu-bottom a");
    links[links.length - 1].focus();
    await act(async () =>
      document.activeElement.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(document.activeElement, query(".vne-menu-brand"), "Tab wraps to first link");
    await act(async () =>
      document.activeElement.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.equal(document.activeElement, links[links.length - 1], "Shift+Tab wraps to last link");
    await escape();
    assert.equal(query('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(document.body.hasAttribute("data-scroll-locked"), false);
  } finally {
    await app.destroy();
  }
});
test("Events is a reversible disclosure with real demo routes and no hidden focusable content", async () => {
  const app = await mount();
  try {
    await open();
    const trigger = query(".vne-menu-events-trigger");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(query(".vne-menu-event"), null);
    await click(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(document.querySelectorAll(".vne-menu-event").length, 2);
    assert.equal(document.querySelectorAll(".vne-menu-event img").length, 0);
    assert.equal(query(".vne-menu-events-all"), null, "no extra catalogue/group heading");
    assert.equal(document.querySelectorAll(".vne-menu-event-status").length, 2);
    for (const item of document.querySelectorAll(".vne-menu-event-status"))
      assert.equal(item.textContent, "Демо / не анонс");
    assert.deepEqual(
      [...document.querySelectorAll(".vne-menu-event")].map((a) => a.getAttribute("href")),
      ["/events/light-study-01", "/events/threshold-study-02"],
    );
    assert.equal(query(".vne-menu-events").hasAttribute("inert"), false);
    await click(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(query(".vne-menu-events").hasAttribute("inert"), true);
    assert.equal(query(".vne-menu-event"), null);
    await click(trigger);
    await click(trigger);
    await click(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
  } finally {
    await app.destroy();
  }
});
test("animated click navigates once after a short selection beat; repeated clicks cannot race", async () => {
  const app = await mount();
  try {
    await open();
    await click(query('.vne-menu-primary a[href="/about"]'));
    assert.equal(app.router.state.location.pathname, "/");
    assert.equal(query(".vne-menu-panel").dataset.phase, "selecting");
    await click(query('.vne-menu-primary a[href="/member"]'));
    await settle(100);
    assert.equal(query(".vne-menu-panel").dataset.phase, "collapsing");
    assert.equal(app.router.state.location.pathname, "/");
    await settle(180);
    assert.equal(app.router.state.location.pathname, "/about");
    assert.equal(query('[role="dialog"]'), null);
    assert.equal(app.history.length, 2);
  } finally {
    await app.destroy();
  }
});
test("Escape cancels pending navigation and a fresh open has no stale departure state", async () => {
  const app = await mount();
  try {
    await open();
    await click(query('.vne-menu-primary a[href="/about"]'));
    await escape();
    await settle(290);
    assert.equal(app.router.state.location.pathname, "/");
    await open();
    assert.equal(query(".vne-menu-panel").dataset.phase, "idle");
    await click(query('.vne-menu-primary a[href="/member"]'));
    await settle(290);
    assert.equal(app.router.state.location.pathname, "/member");
  } finally {
    await app.destroy();
  }
});
test("external route/hash changes close the menu and cancel an interrupted click", async () => {
  const app = await mount();
  try {
    await open();
    await click(query('.vne-menu-primary a[href="/about"]'));
    await act(async () => app.router.navigate({ href: "/faq" }));
    await settle(290);
    assert.equal(app.router.state.location.pathname, "/faq");
    assert.equal(query('[role="dialog"]'), null);
    await open();
    await act(async () => app.router.navigate({ href: "/faq#test" }));
    await settle();
    assert.equal(query('[role="dialog"]'), null);
    await settle(10);
    assert.equal(
      document.activeElement,
      query("#main-content"),
      "external same-path hash closes to the page landmark",
    );
    await open();
    await click(query('.vne-menu-primary a[href="/about"]'));
    await act(async () => app.history.back());
    await settle(290);
    assert.equal(app.router.state.location.pathname, "/faq");
    assert.equal(query('[role="dialog"]'), null);
    assert.equal(
      document.activeElement,
      query("#main-content"),
      "same-path history back keeps focus on the page",
    );
  } finally {
    await app.destroy();
  }
});
test("reduced motion and menuMotion off navigate immediately; modifier clicks keep their native behavior", async () => {
  for (const settings of [{ reduced: true }, { menuMotion: false }]) {
    const app = await mount(settings);
    try {
      await open();
      assert.equal(query(".vne-menu-panel").dataset.motion, "false");
      const anchor = query('.vne-menu-primary a[href="/about"]');
      for (const modifier of [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ]) {
        const event = await click(anchor, modifier);
        assert.equal(event.defaultPrevented, false);
        assert.equal(app.router.state.location.pathname, "/");
      }
      await click(anchor);
      await settle();
      assert.equal(app.router.state.location.pathname, "/about");
      assert.equal(query('[role="dialog"]'), null);
    } finally {
      await app.destroy();
    }
  }
});
test("same-page chapter handoff focuses its landmark, and current event auto-expands on open", async () => {
  const app = await mount({ reduced: true });
  try {
    await open();
    await click(query('.vne-menu-chapters a[href="/#manifesto"]'));
    await settle(10);
    assert.equal(app.router.state.location.hash, "manifesto");
    assert.equal(document.activeElement, query("#manifesto"));
    await act(async () => app.router.navigate({ href: "/events/light-study-01" }));
    await open();
    assert.equal(query(".vne-menu-events-trigger").getAttribute("aria-expanded"), "true");
    assert.equal(
      query('.vne-menu-event[aria-current="page"]').getAttribute("href"),
      "/events/light-study-01",
    );
  } finally {
    await app.destroy();
  }
});
test("unmount cancels the departure timer and leaves no scroll lock", async () => {
  const app = await mount();
  await open();
  await click(query('.vne-menu-primary a[href="/about"]'));
  await app.destroy();
  await settle(290);
  assert.equal(app.router.state.location.pathname, "/");
  assert.equal(document.body.hasAttribute("data-scroll-locked"), false);
});

test("Close and mouse/touch backdrop dismissal cancel a queued click", async () => {
  for (const method of ["close", "mouse", "touch"]) {
    const app = await mount();
    try {
      await open();
      await click(query('.vne-menu-primary a[href="/about"]'));
      if (method === "close") await click(query(".vne-menu-close"));
      else {
        const overlay = query(".vne-menu-overlay");
        await act(async () =>
          overlay.dispatchEvent(
            new window.PointerEvent("pointerdown", {
              pointerType: method,
              button: 0,
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        await click(overlay);
      }
      await settle(290);
      assert.equal(query('[role="dialog"]'), null, `${method} closes the panel`);
      assert.equal(app.router.state.location.pathname, "/", `${method} cancels the pending route`);
      assert.equal(document.body.hasAttribute("data-scroll-locked"), false);
    } finally {
      await app.destroy();
    }
  }
});

test("opening and dismissing preserve the synthetic window scroll offset", async () => {
  const app = await mount();
  try {
    window.scrollTo({ top: 620, left: 0 });
    assert.equal(window.scrollY, 620);
    await open();
    assert.equal(window.scrollY, 620);
    await click(query(".vne-menu-events-trigger"));
    await click(query(".vne-menu-close"));
    await settle(10);
    assert.equal(window.scrollY, 620);
    assert.equal(document.body.hasAttribute("data-scroll-locked"), false);
  } finally {
    window.scrollTo({ top: 0, left: 0 });
    await app.destroy();
  }
});

test("collapsing phase remains interruptible by Escape, Close, another route or unmount", async () => {
  for (const method of ["escape", "close", "route", "unmount"]) {
    const app = await mount();
    let unmounted = false;
    try {
      await open();
      await click(query('.vne-menu-primary a[href="/about"]'));
      await settle(100);
      assert.equal(query(".vne-menu-panel").dataset.phase, "collapsing");
      if (method === "escape") await escape();
      else if (method === "close") await click(query(".vne-menu-close"));
      else if (method === "route") await act(async () => app.router.navigate({ href: "/faq" }));
      else {
        await app.destroy();
        unmounted = true;
      }
      await settle(250);
      assert.equal(app.router.state.location.pathname, method === "route" ? "/faq" : "/");
      assert.equal(query('[role="dialog"]'), null);
      assert.equal(document.body.hasAttribute("data-scroll-locked"), false);
    } finally {
      if (!unmounted) await app.destroy();
    }
  }
});

test("clicking the exact current route closes to main focus with motion on or reduced", async () => {
  for (const reduced of [false, true]) {
    const app = await mount({ path: "/about", reduced });
    try {
      await open();
      await click(query('.vne-menu-primary a[href="/about"]'));
      await settle(290);
      assert.equal(app.router.state.location.pathname, "/about");
      assert.equal(query('[role="dialog"]'), null);
      assert.equal(document.activeElement, query("#main-content"));
      assert.equal(document.body.hasAttribute("data-scroll-locked"), false);
    } finally {
      await app.destroy();
    }
  }
});

test.after(async () => {
  await window.happyDOM.close();
});
