import { describe, expect, test } from "bun:test";
import {
  createScrambleFrame,
  defaultScrambleGroups,
  defaultScrambleTargets,
  glyphPool,
  isScrambleTargetEnabled,
  orderedLetterIndexes,
  scrambleTargetById,
  splitScrambleGraphemes,
} from "../src/lib/text-scramble";

describe("text scramble registry and algorithm", () => {
  test("registry excludes protected UI and keeps stable unique ids", () => {
    const ids = [...scrambleTargetById.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    for (const forbidden of ["cta", "status", "form", "auth", "member", "scan", "price", "date"])
      expect(ids.some((id) => id.includes(forbidden))).toBe(false);
    expect(ids).not.toContain("about.space.heading");
  });

  test("target requires its group and target toggle", () => {
    expect(
      isScrambleTargetEnabled("home.hero.eyebrow", defaultScrambleGroups, defaultScrambleTargets),
    ).toBe(true);
    expect(isScrambleTargetEnabled("unknown", defaultScrambleGroups, defaultScrambleTargets)).toBe(
      false,
    );
    expect(
      isScrambleTargetEnabled("home.space.heading", defaultScrambleGroups, defaultScrambleTargets),
    ).toBe(false);
    expect(
      isScrambleTargetEnabled(
        "home.hero.eyebrow",
        { ...defaultScrambleGroups, home: false },
        defaultScrambleTargets,
      ),
    ).toBe(false);
  });

  test("keeps digits punctuation slash and Ё/Й positions while letters reveal", () => {
    const graphemes = splitScrambleGraphemes("ЁЙ / VNE 2026!");
    const order = orderedLetterIndexes(graphemes, "left");
    const frame = createScrambleFrame({
      graphemes,
      order,
      progress: 0,
      intensity: 1,
      charset: "auto",
      random: () => 0,
    });
    expect(
      frame
        .split("")
        .filter((_, index) => !order.includes(index))
        .join(""),
    ).toBe(" /  2026!");
    expect(glyphPool("Ё", "auto")).toContain("Ё");
    expect(glyphPool("Й", "auto")).toContain("Й");
    expect(glyphPool("V", "auto")).toContain("V");
  });

  test("supports left, right and deterministic random reveal order", () => {
    const letters = splitScrambleGraphemes("АБВГ");
    expect(orderedLetterIndexes(letters, "left")).toEqual([0, 1, 2, 3]);
    expect(orderedLetterIndexes(letters, "right")).toEqual([3, 2, 1, 0]);
    expect(orderedLetterIndexes(letters, "random", () => 0)).toEqual([1, 2, 3, 0]);
  });

  test("intensity limits simultaneous changing letters and final frame is exact", () => {
    const graphemes = splitScrambleGraphemes("АБВГДЕ");
    const order = orderedLetterIndexes(graphemes, "left");
    const sparse = createScrambleFrame({
      graphemes,
      order,
      progress: 0,
      intensity: 0.2,
      charset: "auto",
      random: () => 0,
    });
    const changed = sparse.split("").filter((char, index) => char !== graphemes[index]).length;
    expect(changed).toBeLessThanOrEqual(2);
    expect(
      createScrambleFrame({ graphemes, order, progress: 1, intensity: 1, charset: "symbols" }),
    ).toBe("АБВГДЕ");
  });
});
