import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreviewPages } from "../scripts/test-preview-pages.mjs";
const runtime = process.env.VNE_DOM_RUNTIME;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  "opaque srcdoc menu preserves selection, collapse, memory navigation and cancels native anchors",
  { skip: !runtime },
  async () => {
    const { Window } = await import(runtime);
    const { pages } = await buildPreviewPages();
    const encoded = pages["/preview/menu"].match(/srcdoc="([\s\S]*?)"/)[1];
    const html = encoded
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
    // srcdoc inherits its embedding document's base URL even though its own URL
    // is about:srcdoc. Happy DOM models this through an explicit base element;
    // this is a synthetic DOM check, not browser CSP or pixel acceptance.
    const window = new Window({
      url: "about:srcdoc",
      width: 390,
      height: 844,
      settings: {
        enableJavaScriptEvaluation: true,
        disableCSSFileLoading: true,
        disableJavaScriptFileLoading: true,
        navigation: {
          disableMainFrameNavigation: true,
          disableChildFrameNavigation: true,
          disableChildPageNavigation: true,
          disableFallbackToSetURL: true,
        },
      },
    });
    let network = 0;
    window.fetch = async () => {
      network++;
      throw Error("No network in synthetic demo");
    };
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    window.document.write(
      html
        .replace(
          "<head>",
          '<head><base href="https://vne-test-20261007.can-avci48.chatgpt.site/preview/menu">',
        )
        .replace(/<script>[\s\S]*?<\/script>/g, "")
        .replace(/<style>[\s\S]*?<\/style>/g, ""),
    );
    for (const script of scripts) window.eval(script);
    try {
      await pause(190);
      const query = (s) => window.document.querySelector(s);
      assert.equal(window.location.href, "about:srcdoc");
      assert.equal(window.location.origin, "null");
      if (!query(".vne-menu-panel")) {
        query(".vne-menu-trigger").click();
        await pause(30);
      }
      query(".vne-menu-events-trigger").click();
      await pause(30);
      query(".vne-menu-event").click();
      await pause(20);
      assert.equal(query(".vne-menu-panel")?.getAttribute("data-phase"), "selecting");
      await pause(85);
      assert.equal(query(".vne-menu-panel")?.getAttribute("data-phase"), "collapsing");
      await pause(220);
      assert.equal(query(".vne-menu-panel"), null);
      assert.match(window.document.body.textContent, /\/events\/light-study-01/);
      assert.equal(window.location.href, "about:srcdoc");
      const raw = window.document.createElement("a");
      raw.href = "/apply";
      raw.textContent = "Unrecognised fixture link";
      window.document.body.append(raw);
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      raw.dispatchEvent(click);
      assert.equal(click.defaultPrevented, true);
      assert.equal(window.location.href, "about:srcdoc");
      assert.equal(network, 0);
    } finally {
      await window.happyDOM.close();
    }
  },
);
