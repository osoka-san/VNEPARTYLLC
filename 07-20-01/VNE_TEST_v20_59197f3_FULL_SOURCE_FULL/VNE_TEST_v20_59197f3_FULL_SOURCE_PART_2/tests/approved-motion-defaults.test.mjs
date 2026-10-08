import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const owner = JSON.parse(
  await readFile("tests/fixtures/motion-owner-schema9-20261008.json", "utf8"),
);
const approved = JSON.parse(await readFile("src/config/motion-defaults.schema9.json", "utf8"));
const bundle = await build({
  stdin: {
    contents: `export * from './src/lib/motion-settings';
      export * from './src/lib/loading-settings';
      export * from './src/lib/navbar-settings';
      export * from './src/lib/event-backgrounds';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  write: false,
});
const api = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("the versioned baseline is the exact owner schema 9 with only the requested backdrop change", () => {
  const expected = structuredClone(owner);
  expected.loading.darkness = 0.4645;
  assert.equal(owner.schemaVersion, 9);
  assert.equal(owner.loading.darkness, 0.37);
  assert.deepEqual(approved, expected);
  assert.deepEqual(JSON.parse(api.exportMotionSettings(api.defaultMotionSettings)), expected);
  assert.deepEqual(
    api.sanitizeMotionSettings(api.defaultMotionSettings),
    api.defaultMotionSettings,
  );
  assert.deepEqual(api.defaultLoadingSettings, expected.loading);
  assert.deepEqual(api.defaultNavbarSettings, expected.navbar);
  assert.deepEqual(api.defaultEventBackgrounds, expected.eventBackgrounds);
  const roundTrip = api.parseImportedSettings(JSON.stringify(approved), api.defaultMotionSettings);
  assert.equal(roundTrip.ok, true);
  assert.deepEqual(roundTrip.settings, api.defaultMotionSettings);
});

test("15% less transmitted backdrop never dims rings, text or the complete surface", async () => {
  const before = api.loadingVariables(owner.loading);
  const after = api.loadingVariables(approved.loading);
  assert.deepEqual(
    Object.keys(after).filter((key) => after[key] !== before[key]),
    ["--loading-darkness"],
  );
  assert.equal(after["--loading-darkness"], "0.4645");
  assert.ok(
    Math.abs((1 - approved.loading.darkness) / (1 - owner.loading.darkness) - 0.85) < 1e-12,
  );
  // Alpha compositing approaches the unchanged #070a09 tint. Contrast above that
  // tint drops 15%; this is not a global brightness filter on the ring or label.
  for (const tint of [7, 10, 9]) {
    for (const page of [24, 128, 255]) {
      const composite = (alpha) => tint * alpha + page * (1 - alpha);
      assert.ok(Math.abs((composite(0.4645) - tint) / (composite(0.37) - tint) - 0.85) < 1e-12);
    }
  }
  const css = await readFile("public/loading/wormhole.css", "utf8");
  assert.match(
    css,
    /background: rgb\(var\(--loading-background-rgb\) \/ var\(--loading-darkness\)\)/,
  );
  assert.equal((css.match(/var\(--loading-darkness\)/g) ?? []).length, 1);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important/);
  assert.equal(api.loadingVariables(approved.loading, true)["--loader-animation"], "none");
  assert.equal(api.loadingVariables(approved.loading, true)["--loader-static-opacity"], "1");
});

test("fresh and denied storage use the baseline; explicit local settings remain untouched", () => {
  const previous = globalThis.window;
  let writes = 0;
  try {
    for (const stored of [null, "invalid json", "throw"]) {
      globalThis.window = {
        localStorage: {
          getItem() {
            if (stored === "throw") throw Error("Storage denied");
            return stored;
          },
          setItem() {
            writes++;
          },
          removeItem() {
            writes++;
          },
          clear() {
            writes++;
          },
        },
      };
      assert.deepEqual(api.readStoredMotionSettings(), api.defaultMotionSettings);
    }
    const local = structuredClone(api.defaultMotionSettings);
    local.imageReveal = false;
    local.loading.darkness = 0.22;
    local.loading.ringCount = 11;
    local.navbar.radius = 20;
    globalThis.window.localStorage.getItem = (key) => {
      assert.equal(key, "vne.motion.settings");
      return JSON.stringify(local);
    };
    assert.deepEqual(api.readStoredMotionSettings(), local);
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
