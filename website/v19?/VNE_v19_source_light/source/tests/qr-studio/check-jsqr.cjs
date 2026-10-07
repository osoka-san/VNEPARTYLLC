const fs = require("node:fs");
const { PNG } = require("pngjs");
const jsQR = require("jsqr");
const root = process.argv[2];
const cases = JSON.parse(fs.readFileSync(root + "/manifest.json"));
const failures = [];
for (const c of cases)
  for (const size of [900, 420, 280]) {
    const im = PNG.sync.read(fs.readFileSync(`${root}/${c.name}-${size}.png`));
    const q = jsQR(new Uint8ClampedArray(im.data), im.width, im.height, {
      inversionAttempts: "attemptBoth",
    });
    if (!q || q.data !== c.text || !Buffer.from(q.binaryData).equals(Buffer.from(c.text)))
      failures.push(`${c.name}-${size}`);
  }
const result = { checks: cases.length * 3, failures };
fs.writeFileSync(root + "/jsqr-validation.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (failures.length) process.exit(1);
