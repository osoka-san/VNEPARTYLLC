import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Real provider, ReactDOM and Motion in a synthetic DOM. This checks configuration
// and reduced-motion precedence, not visual browser pixels or GPU animation.
const { Window } = await import(process.env.VNE_DOM_RUNTIME || "happy-dom");
const window = new Window({ url: "https://motion-defaults.test/" });
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "SVGElement",
  "MutationObserver",
  "CustomEvent",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "getComputedStyle" ? window[key].bind(window) : window[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let systemReduced = false;
window.matchMedia = (query) => ({
  matches: query.includes("reduced-motion") ? systemReduced : true,
  addEventListener() {},
  removeEventListener() {},
});
let requests = 0;
globalThis.fetch = async () => {
  requests++;
  throw Error("Unified local-only provider must not request remote defaults");
};
const directory = mkdtempSync(join(tmpdir(), "vne-approved-motion-"));
const file = join(directory, "fixture.mjs");
await build({
  stdin: {
    contents: `import React,{act} from 'react';
      import {createRoot} from 'react-dom/client';
      import {MotionProvider,useMotionEnv} from './src/components/motion/MotionProvider';
      export {defaultMotionSettings,MOTION_SETTINGS_KEY} from './src/lib/motion-settings';
      export {act};
      export let observed;
      function Probe(){observed=useMotionEnv();return <div/>;}
      export async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(<MotionProvider localOnly><Probe/></MotionProvider>));return {async destroy(){await act(async()=>root.unmount());host.remove();}};}`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: file,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "import.meta.env": "{}" },
});
const fixture = await import(pathToFileURL(file));
after(async () => {
  await window.happyDOM.close();
  rmSync(directory, { recursive: true, force: true });
});

test("Unified fresh hydration applies the canonical loader without contacting shared settings", async () => {
  window.localStorage.clear();
  const app = await fixture.mount();
  try {
    assert.deepEqual(fixture.observed.settings, fixture.defaultMotionSettings);
    assert.deepEqual(fixture.observed.siteDefault, fixture.defaultMotionSettings);
    assert.equal(document.documentElement.style.getPropertyValue("--loading-darkness"), "0.4645");
    assert.equal(document.documentElement.style.getPropertyValue("--loader-count"), "6");
    assert.equal(document.documentElement.style.getPropertyValue("--loading-cyan"), "#f77245");
    assert.equal(fixture.observed.sharedDefaultsAvailable, false);
    assert.equal(window.localStorage.getItem(fixture.MOTION_SETTINGS_KEY), null);
    assert.equal(requests, 0);
  } finally {
    await app.destroy();
  }
});

test("stored override and live image cancellation survive hydration and a provider remount", async () => {
  const local = structuredClone(fixture.defaultMotionSettings);
  local.imageReveal = false;
  local.loading.darkness = 0.22;
  local.loading.ringCount = 11;
  window.localStorage.setItem(fixture.MOTION_SETTINGS_KEY, JSON.stringify(local));
  for (let i = 0; i < 2; i++) {
    const app = await fixture.mount();
    try {
      assert.deepEqual(fixture.observed.settings, local);
      assert.equal(document.documentElement.style.getPropertyValue("--loading-darkness"), "0.22");
      assert.equal(window.localStorage.getItem(fixture.MOTION_SETTINGS_KEY), JSON.stringify(local));
      assert.equal(requests, 0);
    } finally {
      await app.destroy();
    }
  }
});

test("system and manual reduced motion both override the approved animated loader", async () => {
  window.localStorage.clear();
  for (const source of ["system", "manual"]) {
    systemReduced = source === "system";
    document.documentElement.dataset.reduceMotion = String(source === "manual");
    const app = await fixture.mount();
    try {
      assert.equal(fixture.observed.reduced, true);
      assert.equal(document.documentElement.style.getPropertyValue("--loader-animation"), "none");
      assert.equal(document.documentElement.style.getPropertyValue("--loader-static-opacity"), "1");
      assert.equal(fixture.observed.settings.loading.mode, "wormhole");
      assert.equal(requests, 0);
    } finally {
      await app.destroy();
    }
  }
  systemReduced = false;
  delete document.documentElement.dataset.reduceMotion;
});
