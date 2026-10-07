import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  defaultMotionSettings,
  exportMotionSettings,
  matchPreset,
  motionPresets,
  parseImportedSettings,
  sanitizeMotionSettings,
} from "../src/lib/motion-settings";
import {
  createScrambleFrameGraphemes,
  orderedLetterIndexes,
  scrambleTargetById,
  splitScrambleGraphemes,
} from "../src/lib/text-scramble";

type Key = keyof typeof motionPresets;
const keys = Object.keys(motionPresets) as Key[];
const full = (k: Key) =>
  sanitizeMotionSettings({ ...defaultMotionSettings, ...motionPresets[k].values });

describe("preset matching after sanitize", () => {
  for (const k of keys) {
    test(`${k} survives sanitize and JSON roundtrip`, () => {
      expect(matchPreset(full(k))).toBe(k);
      const round = parseImportedSettings(exportMotionSettings(full(k)), defaultMotionSettings);
      expect(round.ok).toBe(true);
      if (round.ok) expect(matchPreset(round.settings)).toBe(k);
      const stored = sanitizeMotionSettings(JSON.parse(JSON.stringify(full(k))));
      expect(matchPreset(stored)).toBe(k);
    });
  }
  test("changing one target breaks the match", () => {
    const k = keys.find((key) => "scrambleTargets" in motionPresets[key].values) ?? keys[0]!;
    const s = full(k);
    const id = Object.keys(s.scrambleTargets)[0] as keyof typeof s.scrambleTargets;
    const changed = {
      ...s,
      scrambleTargets: { ...s.scrambleTargets, [id]: !s.scrambleTargets[id] },
    };
    expect(matchPreset(changed)).not.toBe(k);
  });
});

describe("scramble geometry contract", () => {
  test("frame keeps grapheme count, whitespace and punctuation", () => {
    const src = "Ёлка Йога / 2026 — Night, supercalifragilistic";
    const g = splitScrambleGraphemes(src);
    for (const p of [0, 0.3, 0.7]) {
      const f = createScrambleFrameGraphemes({
        graphemes: g,
        order: orderedLetterIndexes(g, "ltr"),
        progress: p,
        intensity: 1,
        charset: "auto",
      });
      expect(f.length).toBe(g.length);
      g.forEach((c, i) => {
        if (!/\p{L}/u.test(c)) expect(f[i]).toBe(c);
      });
    }
  });
  test("TextScramble uses transparent original anchor, no whitespace-pre", () => {
    const src = readFileSync("src/components/motion/Interactive.tsx", "utf8");
    expect(src).toContain('color: "transparent"');
    expect(src).not.toMatch(/whitespace-pre/);
  });
});

describe("event route wiring", () => {
  test("event.page.eyebrow is on EventPage, not EventNotFound", () => {
    const src = readFileSync("src/routes/events.$slug.tsx", "utf8");
    const notFound = src.slice(
      src.indexOf("function EventNotFound"),
      src.indexOf("function EventPage"),
    );
    const page = src.slice(src.indexOf("function EventPage"));
    expect(notFound).not.toContain("scrambleEyebrow");
    expect(page).toContain('scrambleEyebrow="event.page.eyebrow"');
  });
  test("registry count", () => {
    expect(scrambleTargetById.size).toBe(23);
  });
});
