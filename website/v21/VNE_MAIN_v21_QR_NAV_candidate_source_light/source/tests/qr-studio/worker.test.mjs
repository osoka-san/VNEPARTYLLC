// Executes the actual bundled worker message handler in a separate Node thread.
// This is a worker contract test, not browser E2E.
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/qr-studio/render.worker.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const url =
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64");
const code = `const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(data)=>parentPort.postMessage(data)};import(${JSON.stringify(url)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true})});`;
const direct = await build({
  stdin: {
    contents:
      'export {createArtwork} from "./src/lib/qr-studio/core"; export {getQrTemplate} from "./src/lib/qr-studio/catalog"; export {NEW_RENDERER_ENGINES} from "./src/lib/qr-studio/pattern";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const { createArtwork, getQrTemplate, NEW_RENDERER_ENGINES } = await import(
  "data:text/javascript;base64," + Buffer.from(direct.outputFiles[0].text).toString("base64")
);
const w = new Worker(code, { eval: true });
const next = () =>
  new Promise((resolve, reject) => {
    const onMessage = (value) => {
      w.off("error", onError);
      resolve(value);
    };
    const onError = (error) => {
      w.off("message", onMessage);
      reject(error);
    };
    w.once("message", onMessage);
    w.once("error", onError);
  });
try {
  assert.equal((await next()).ready, true);
  const pattern = {
    schema: 1,
    name: "Проверка",
    event: "",
    geometry: "flow",
    palette: "mint",
    rounding: 0.36,
    accents: true,
  };
  w.postMessage({ text: "на удачу", pattern });
  let result = await next();
  assert.equal(result.error, "");
  assert.match(result.art.svg, /<svg/);
  assert.equal(result.art.matrix.length, result.art.size ** 2);
  w.postMessage({
    text: "на удачу",
    pattern: { ...pattern, template: "marble" },
    passAccess: "VIP",
  });
  result = await next();
  assert.equal(result.error, "");
  assert.match(result.art.svg, /#181b16/);
  assert.match(result.art.svg, /#eddbb3/);
  w.postMessage({ text: "на удачу", pattern, passAccess: "invalid" });
  result = await next();
  assert.equal(result.art, null);
  assert.match(result.error, /тип пропуска/);
  w.postMessage({ text: "на удачу", pattern: { ...pattern, template: "marble" } });
  result = await next();
  assert.equal(result.error, "");
  assert.match(result.art.svg, /vne-mat-marble/);
  assert.equal(result.art.matrix.length, result.art.size ** 2);
  w.postMessage({ text: "", pattern });
  result = await next();
  assert.equal(result.art, null);
  assert.match(result.error, /Введите текст/);
  for (const [id, currentEngine] of Object.entries(NEW_RENDERER_ENGINES)) {
    const recipe = getQrTemplate(id).pattern;
    for (const engineVersion of ["vne-glyphs-0.5.0", currentEngine]) {
      w.postMessage({ text: "на удачу", pattern: recipe, passAccess: "GENERAL", engineVersion });
      result = await next();
      assert.equal(result.error, "", id + ": " + engineVersion);
      assert.deepEqual(result.art, createArtwork("на удачу", recipe, "GENERAL", engineVersion));
    }
  }
  for (const engineVersion of ["vne-unknown-1.0.0", "vne-basalt-1.0.0"]) {
    w.postMessage({ text: "на удачу", pattern: getQrTemplate("origami").pattern, engineVersion });
    result = await next();
    assert.equal(result.art, null);
    assert.match(result.error, /версия оформления/);
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      worker: "actual bundled message handler",
      cases: 19,
      selectedStyleVersionRouting: "12 exact worker/direct comparisons PASS",
      browser: "NOT VERIFIED",
    }),
  );
} finally {
  await w.terminate();
}
