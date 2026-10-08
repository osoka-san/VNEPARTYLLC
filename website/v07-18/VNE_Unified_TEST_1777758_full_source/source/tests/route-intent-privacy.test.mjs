import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// TanStack/ReactDOM in a synthetic DOM: private-loader intent isolation, not network latency or pixels.
const { Window } = await import(process.env.VNE_DOM_RUNTIME || "happy-dom");
const window = new Window({
  url: "https://preload.test/",
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
  "history",
  "location",
  "sessionStorage",
  "HTMLElement",
  "HTMLAnchorElement",
  "Node",
  "Element",
  "MutationObserver",
  "Event",
  "MouseEvent",
  "FocusEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "scrollTo",
  "addEventListener",
  "removeEventListener",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value:
      typeof window[key] === "function" &&
      [
        "getComputedStyle",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "scrollTo",
        "addEventListener",
        "removeEventListener",
      ].includes(key)
        ? window[key].bind(window)
        : window[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const file = join(mkdtempSync(join(tmpdir(), "vne-preload-")), "test.mjs");
await build({
  stdin: {
    contents: `
 import React,{act} from 'react';import {createRoot} from 'react-dom/client';
 import {createMemoryHistory,RouterProvider} from '@tanstack/react-router';
 import {getRouter} from './src/router';import {calls} from './src/routeTree.gen';
 export {act,calls};
 export async function mount(){calls.length=0;const router=getRouter();router.update({history:createMemoryHistory({initialEntries:['/']})});await router.load();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>{root.render(<RouterProvider router={router}/>);});return {host,router,async destroy(){await act(async()=>root.unmount());host.remove();}};}
`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: file,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "isolated-test-routes",
      setup(p) {
        p.onResolve({ filter: /routeTree\.gen$/ }, () => ({
          path: "route-tree",
          namespace: "fixture",
        }));
        p.onResolve({ filter: /components\/app\/States$/ }, () => ({
          path: "states",
          namespace: "fixture",
        }));
        p.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "states"
              ? "export const ErrorState=()=>null;"
              : `
 import React from 'react';import {createRootRoute,createRoute,Link,Outlet} from '@tanstack/react-router';
 export const calls=[];
 const root=createRootRoute({component:()=> <><Link to='/member'>Target</Link><main><Outlet/></main></>});
 const home=createRoute({getParentRoute:()=>root,path:'/',component:()=> <h1>Home</h1>});
 const target=createRoute({getParentRoute:()=>root,path:'/member',loader:({preload})=>{calls.push({preload});return {ok:true};},component:()=> <h1>Member ready</h1>});
 export const routeTree=root.addChildren([home,target]);
`,
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const { mount, act, calls } = await import(pathToFileURL(file));
const settle = (ms) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
for (const width of [360, 390, 430, 1440, 1920])
  for (const trigger of ["focus", "hover", "touch"])
    test(`${width}px ${trigger} does not load private data before an explicit navigation`, async () => {
      window.happyDOM.setWindowSize({ width, height: width < 640 ? 844 : 1080 });
      const app = await mount();
      try {
        assert.equal(app.router.options.defaultPreload ?? false, false);
        assert.equal(app.router.options.defaultPreloadDelay, 50);
        assert.equal(app.router.options.defaultPreloadStaleTime, 0);
        const anchor = app.host.querySelector("a");
        await act(async () => {
          if (trigger === "focus")
            anchor.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
          else if (trigger === "hover")
            anchor.dispatchEvent(
              new window.MouseEvent("mouseover", { bubbles: true, relatedTarget: null }),
            );
          else anchor.dispatchEvent(new window.Event("touchstart", { bubbles: true }));
        });
        await settle(140);
        assert.equal(app.router.state.location.pathname, "/");
        assert.equal(calls.length, 0, `${trigger}: no private loader before click`);
        await settle(5);
        await act(async () =>
          anchor.dispatchEvent(
            new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
          ),
        );
        await settle(40);
        assert.equal(app.router.state.location.pathname, "/member");
        assert.ok(
          calls.some((x) => !x.preload),
          "loader runs on committed navigation",
        );
        assert.match(app.host.textContent, /Member ready/);
      } finally {
        await app.destroy();
      }
    });
test.after(async () => {
  await window.happyDOM.close();
});
