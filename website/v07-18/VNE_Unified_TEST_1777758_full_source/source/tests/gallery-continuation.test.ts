import { describe, expect, test } from "bun:test";
import {
  galleryContinuationConfig,
  getGalleryPhase,
  growGalleryAllocation,
} from "../src/config/gallery-continuation";

describe("gallery continuation math", () => {
  test("maps forward and backward positions with modulo four", () => {
    expect(getGalleryPhase(4500, 500, 1000).sceneIndex).toBe(0);
    expect(getGalleryPhase(3500, 500, 1000).sceneIndex).toBe(3);
    expect(getGalleryPhase(2500, 500, 1000).sceneIndex).toBe(2);
  });

  test("keeps exact boundaries deterministic", () => {
    const before = getGalleryPhase(1499.999, 500, 1000);
    const at = getGalleryPhase(1500, 500, 1000);
    expect(before.absoluteIndex).toBe(0);
    expect(before.opacity).toBeLessThan(0.001);
    expect(at.absoluteIndex).toBe(1);
    expect(at.sceneProgress).toBe(0);
    expect(at.opacity).toBe(0);
  });

  test("supports arbitrary far jumps without accumulated state", () => {
    const phase = getGalleryPhase(500 + 803 * 900 + 417, 500, 900);
    expect(phase.absoluteIndex).toBe(803);
    expect(phase.sceneIndex).toBe(3);
    expect(phase.sceneProgress).toBeCloseTo(417 / 900);
  });

  test("grows in chunks and clamps to the practical limit", () => {
    expect(growGalleryAllocation(24, 4)).toBe(24);
    expect(growGalleryAllocation(24, 20)).toBe(88);
    expect(
      growGalleryAllocation(
        galleryContinuationConfig.maxScenes - 1,
        galleryContinuationConfig.maxScenes - 2,
      ),
    ).toBe(galleryContinuationConfig.maxScenes);
  });
});
