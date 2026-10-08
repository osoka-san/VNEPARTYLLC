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
const file = join(mkdtempSync(join(tmpdir(), "vne-unified-spa-")), "test.mjs");
await build({
  stdin: {
    contents: `
    import React,{act} from 'react';import {createRoot} from 'react-dom/client';
    import {createMemoryHistory,RouterProvider,createRoute,createRouter,Outlet,Link} from '@tanstack/react-router';
    import {QueryClient} from '@tanstack/react-query';
    import {Route as root} from './unified-stand/routes/__root';
    export const access={allowed:false,reads:0};
    globalThis.__unifiedAccess=access;
    delete root.options.shellComponent;delete root.options.head;
    root.options.component=()=> <><Link to='/admin'>Admin</Link><Link to='/'>Site</Link><Outlet/></>;
    const login=createRoute({getParentRoute:()=>root,path:'/login',component:()=> <h1>LOGIN</h1>});
    const admin=createRoute({getParentRoute:()=>root,path:'/admin',component:()=> <h1>ADMIN</h1>});
    const home=createRoute({getParentRoute:()=>root,path:'/',component:()=> <h1>PROTECTED PRESENTATION</h1>});
    const about=createRoute({getParentRoute:()=>root,path:'/about',component:()=> <h1>PROTECTED ABOUT</h1>});
    export {act};
    export async function mount(){access.allowed=false;access.reads=0;const router=createRouter({routeTree:root.addChildren([login,admin,home,about]),context:{queryClient:new QueryClient()},history:createMemoryHistory({initialEntries:['/login']}),defaultPreload:false});await router.load();const host=document.createElement('div');document.body.append(host);const element=createRoot(host);await act(async()=>element.render(<RouterProvider router={router}/>));return {host,router,async destroy(){await act(async()=>element.unmount());host.remove()}};}
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
      name: "synthetic-boundary",
      setup(p) {
        p.onResolve({ filter: /questionnaire\.functions$/ }, () => ({
          path: "availability",
          namespace: "fixture",
        }));
        p.onResolve({ filter: /@\/unified\/config\.mjs$/ }, () => ({
          path: join(process.cwd(), "unified-stand/config.mjs"),
        }));
        p.onResolve({ filter: /@\/unified\/session-gate$/ }, () => ({
          path: join(process.cwd(), "unified-stand/session-gate.ts"),
        }));
        p.onResolve({ filter: /@\/components\// }, (args) => ({
          path: args.path,
          namespace: "fixture",
        }));
        p.onResolve({ filter: /\.css\?url$/ }, () => ({ path: "css", namespace: "fixture" }));
        p.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "availability"
              ? 'export async function getQuestionnaireAvailability(){globalThis.__unifiedAccess.reads++;if(!globalThis.__unifiedAccess.allowed)throw new Error("401 synthetic");return {enabled:true};}'
              : args.path === "css"
                ? 'export default "";'
                : "export const ApplyDraftProvider=({children})=>children;export const CookieNoticeProvider=ApplyDraftProvider;export const MotionProvider=ApplyDraftProvider;export const SiteLoadingProvider=ApplyDraftProvider;export const PageTransition=ApplyDraftProvider;export const UtilityDock=()=>null;export const ClientTelemetry=()=>null;export const StatusScene=()=>null;export const recordBrowserEvent=()=>{};",
          loader: "tsx",
        }));
      },
    },
  ],
});
const { mount, act, access } = await import(pathToFileURL(file));
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
test("anonymous login → admin → presentation cannot bypass the document gate through SPA", async () => {
  const app = await mount();
  try {
    assert.equal(access.reads, 0);
    for (const to of ["/admin", "/", "/about"]) {
      await act(async () => app.router.navigate({ to }));
      await settle();
      assert.equal(app.router.state.location.pathname, "/login");
      assert.ok(!app.host.textContent.includes("PROTECTED"));
    }
    assert.equal(access.reads, 3);
  } finally {
    await app.destroy();
  }
});
test("each navigation and history restore revalidates; a former valid session is never reused", async () => {
  const app = await mount();
  try {
    access.allowed = true;
    await act(async () => app.router.navigate({ to: "/" }));
    await settle();
    assert.match(app.host.textContent, /PROTECTED PRESENTATION/);
    const first = access.reads;
    await act(async () => app.router.navigate({ to: "/about" }));
    await settle();
    assert.ok(access.reads > first);
    access.allowed = false;
    await act(async () => {
      app.router.history.back();
    });
    await settle();
    assert.equal(app.router.state.location.pathname, "/login");
    assert.ok(!app.host.textContent.includes("PROTECTED"));
    await act(async () => app.router.navigate({ to: "/" }));
    await settle();
    assert.equal(app.router.state.location.pathname, "/login");
  } finally {
    await app.destroy();
  }
});
test.after(async () => {
  await window.happyDOM.close();
});
