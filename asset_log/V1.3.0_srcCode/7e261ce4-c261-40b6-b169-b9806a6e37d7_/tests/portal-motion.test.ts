import { describe, expect, test } from "bun:test";
import {
  advanceDisplayedProgress,
  createPortalPose,
  getHiddenPoseInto,
  getPortalScrollPoseInto,
  motionConfig,
  rangeEase,
} from "../src/config/motion-config";

function simulate(hz: number, seconds: number, start: number, target: number) {
  let value = start;
  const frames = Math.round(hz * seconds);
  for (let frame = 0; frame < frames; frame += 1) {
    value = advanceDisplayedProgress(value, target, 1 / hz);
  }
  return value;
}

describe("portal premium motion", () => {
  test("damping follows the same path at 30, 60, and 120 Hz", () => {
    const samples = [30, 60, 120].map((hz) => simulate(hz, 0.5, 0, 0.82));
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.0005);
  });

  test("damping never overshoots in either direction", () => {
    for (const [start, target] of [
      [0, 1],
      [1, 0],
    ] as const) {
      let value = start;
      for (let frame = 0; frame < 240; frame += 1) {
        const next = advanceDisplayedProgress(value, target, 1 / 60);
        expect(next).toBeGreaterThanOrEqual(Math.min(value, target));
        expect(next).toBeLessThanOrEqual(Math.max(value, target));
        value = next;
      }
      expect(value).toBe(target);
    }
  });

  test("long resume delta is clamped", () => {
    expect(advanceDisplayedProgress(0.3, 0.9, 10)).toBe(
      advanceDisplayedProgress(0.3, 0.9, motionConfig.smoothing.maxDeltaSeconds),
    );
  });

  test("quintic easing has fixed endpoints and continuous endpoint velocity", () => {
    const range: [number, number] = [0.2, 0.6];
    expect(rangeEase(0.2, range)).toBe(0);
    expect(rangeEase(0.6, range)).toBe(1);
    expect(rangeEase(0.20001, range)).toBeLessThan(1e-10);
    expect(1 - rangeEase(0.59999, range)).toBeLessThan(1e-10);
  });

  test("hidden and assembled endpoints remain exact", () => {
    for (let index = 0; index < 3; index += 1) {
      const output = createPortalPose();
      const hidden = createPortalPose();
      getPortalScrollPoseInto(index, 0, false, -4.2, output, hidden);
      const expectedHidden = createPortalPose();
      getHiddenPoseInto(index, -4.2, expectedHidden);
      expect(output).toEqual(expectedHidden);
      getPortalScrollPoseInto(index, 1, false, -4.2, output, hidden);
      expect(output).toEqual(motionConfig.assembled[index]);
    }
  });

  test("every link keeps moving after reveal until final hold", () => {
    for (let index = 0; index < 3; index += 1) {
      const outputA = createPortalPose();
      const outputB = createPortalPose();
      const hiddenA = createPortalPose();
      const hiddenB = createPortalPose();
      const start = motionConfig.scroll.reveal[index]?.[1] ?? 0;
      getPortalScrollPoseInto(index, start + 0.02, false, -4.2, outputA, hiddenA);
      getPortalScrollPoseInto(index, start + 0.08, false, -4.2, outputB, hiddenB);
      expect(outputA.position).not.toEqual(outputB.position);
    }
  });
});
