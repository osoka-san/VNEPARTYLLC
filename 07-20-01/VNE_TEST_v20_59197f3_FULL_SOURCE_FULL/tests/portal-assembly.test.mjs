import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
async function module(file) {
  const r = await build({
    entryPoints: [file],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64")
  );
}
const {
  motionConfig,
  rangeEase,
  advanceDisplayedProgress,
  createPortalPose,
  getPortalScrollPoseInto,
  getHiddenPoseInto,
  portalLightPass,
  portalPhase,
} = await module("src/config/motion-config.ts");
const { portalLinks } = await module("src/lib/portal-geometry.ts");
const manifest = JSON.parse(readFileSync("public/brand/portal/portal-manifest.json", "utf8"));
assert.equal(portalLinks.length, 3);
assert.deepEqual(motionConfig.presentation.rotation, [0, 0, 0]);
for (let i = 0; i < 3; i++) {
  assert.equal(
    portalLinks[i].path,
    manifest.links[i].bodyPath,
    "Full current logo contour is exact",
  );
  assert.deepEqual(portalLinks[i].anchor, manifest.links[i].anchorSvg);
  for (let axis = 0; axis < 3; axis++)
    assert.ok(
      Math.abs(
        motionConfig.assembled[i].position[axis] -
          manifest.links[i].suggestedFinalWorldPosition[axis],
      ) < 1e-12,
    );
  for (const mobile of [false, true]) {
    const pose = createPortalPose(),
      hidden = createPortalPose(),
      expectedHidden = createPortalPose();
    getPortalScrollPoseInto(i, 0, mobile, -4.2, pose, hidden);
    getHiddenPoseInto(i, -4.2, expectedHidden);
    assert.deepEqual(pose, expectedHidden);
    getPortalScrollPoseInto(i, 0.9, mobile, -4.2, pose, hidden);
    assert.deepEqual(pose, motionConfig.assembled[i]);
    let previous = null;
    for (let step = 0; step <= 1000; step++) {
      const p = step / 1000;
      getPortalScrollPoseInto(i, p, mobile, -4.2, pose, hidden);
      assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
      if (previous)
        assert.ok(
          Math.hypot(...pose.position.map((v, axis) => v - previous[axis])) < 0.08,
          "No trajectory discontinuities",
        );
      previous = [...pose.position];
      const reverse = createPortalPose();
      getPortalScrollPoseInto(i, p, mobile, -4.2, reverse, hidden);
      assert.deepEqual(reverse, pose, "Pose is reversible and contains no wall-clock state");
      assert.ok(portalLightPass(i, p) >= 0 && portalLightPass(i, p) <= 1);
    }
    assert.ok(portalLightPass(i, 1) < 1e-12, "No glow loop at rest");
  }
}
const results = [];
for (const hz of [30, 60, 120]) {
  let p = 0;
  for (let frame = 0; frame < hz; frame++) p = advanceDisplayedProgress(p, 1, 1 / hz);
  results.push(p);
}
assert.ok(Math.max(...results) - Math.min(...results) < 0.0005, "Refresh-rate independent timing");
for (const [a, b] of [
  [0, 1],
  [1, 0],
]) {
  let p = a;
  for (let i = 0; i < 240; i++) {
    const next = advanceDisplayedProgress(p, b, 1 / 60);
    assert.ok(next >= Math.min(p, b) && next <= Math.max(p, b));
    p = next;
  }
  assert.equal(p, b);
}
assert.equal(rangeEase(0.5, [0.5, 0.8]), 0);
assert.equal(rangeEase(0.8, [0.5, 0.8]), 1);
assert.equal(portalPhase(0.9).label, "ВНЕ привычного");
console.log(
  "PASS: exact 10C11-6 paths/anchors, three groups, 6006 bounded reversible poses, final hold, light envelope, 30/60/120Hz damping",
);
