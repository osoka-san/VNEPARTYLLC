import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import jsQR from "jsqr";
import { OwnerHangingCard } from "../../src/components/admission/OwnerHangingCard";
import { OwnerScanQr } from "../../src/components/admission/OwnerScanQr";
import type { AdmissionPass } from "../../src/lib/admission/contract";
import type { OwnerState } from "../../src/components/admission/owner-controller";
const token = "VNE2:" + "a".repeat(43);
const pass: AdmissionPass = {
  participationId: "11111111-1111-4111-8111-111111111111",
  eventId: "11111111-1111-4111-8111-111111111111",
  eventTitle: "Synthetic event",
  timezone: "Europe/Moscow",
  qrReleaseAt: null,
  addressRevealAt: null,
  entryOpensAt: null,
  entryClosesAt: null,
  passId: null,
  version: 0,
  generation: 0,
  status: "not_issued",
  secretContract: "explicit-rotation-v2",
  secretUnavailable: false,
  simulated: true,
  reentryAllowed: false,
};
const initial: OwnerState = {
  pass,
  fresh: false,
  busy: false,
  message: "loading",
  secret: null,
  pending: null,
  address: null,
  back: false,
};
let commands = 0;
const front = renderToStaticMarkup(
  <OwnerHangingCard
    pass={pass}
    state={initial}
    onShow={() => {
      commands++;
    }}
  />,
);
assert.equal(commands, 0, "render must not issue or rotate");
assert.ok(front.includes("Показать QR код"));
assert.ok(front.includes("wordmark-flow-light.svg"));
assert.ok(front.includes("metal-clasp-svg"));
assert.ok(front.includes("lanyard-ribbon-group"));
assert.ok(!front.includes("Тестовый QR для первичного прохода"));
assert.ok(
  front.indexOf('class="owner-show-button') === -1 ||
    front.indexOf("owner-show-button") > front.indexOf("owner-stage"),
);
const livePass: AdmissionPass = {
  ...pass,
  status: "active",
  passId: pass.eventId,
  version: 1,
  generation: 1,
};
const back = renderToStaticMarkup(
  <OwnerHangingCard
    pass={livePass}
    state={{
      ...initial,
      pass: livePass,
      fresh: true,
      secret: { value: token, version: 1, generation: 1 },
      back: true,
    }}
    onShow={() => {
      commands++;
    }}
  />,
);
assert.ok(back.includes('data-motion="static"'));
assert.ok(back.includes('data-back="yes"'));
assert.ok(back.includes("Тестовый QR для первичного прохода"));
assert.ok(!back.includes(token));
assert.equal(commands, 0);
const hidden = renderToStaticMarkup(
  <OwnerHangingCard
    pass={livePass}
    state={{ ...initial, pass: livePass, fresh: false, secret: null, back: false }}
    onShow={() => {
      commands++;
    }}
  />,
);
assert.ok(!hidden.includes("Тестовый QR для первичного прохода"));
const svg = renderToStaticMarkup(<OwnerScanQr value={token} />);
assert.ok(!svg.includes(token));
const size = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)?.[1]);
assert.ok(size > 20);
const scale = 8,
  width = size * scale,
  pixels = new Uint8ClampedArray(width * width * 4).fill(255);
const modules = [...svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g)];
assert.ok(modules.length > 200);
for (const match of modules) {
  const x = Number(match[1]),
    y = Number(match[2]);
  assert.ok(x >= 4 && y >= 4 && x < size - 4 && y < size - 4, "four-module quiet zone");
  for (let dy = 0; dy < scale; dy++)
    for (let dx = 0; dx < scale; dx++) {
      const at = ((y * scale + dy) * width + x * scale + dx) * 4;
      pixels[at] = 0;
      pixels[at + 1] = 0;
      pixels[at + 2] = 0;
    }
}
assert.equal(jsQR(pixels, width, width)?.data, token, "actual rendered SVG geometry decodes");
assert.equal(renderToStaticMarkup(<OwnerScanQr value="VNE1:disabled" />), "");
console.log(
  "PASS actual React server rendering: inert front, original SVG brand/hardware, explicit button, still private QR back, no raw token markup, decoded QR geometry with quiet zone, VNE1 denied",
);
