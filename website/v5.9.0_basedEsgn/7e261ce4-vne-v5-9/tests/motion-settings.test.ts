import { describe, expect, test } from "bun:test";
import {
  MOTION_SCHEMA_VERSION,
  defaultMotionSettings,
  exportMotionSettings,
  parseImportedSettings,
  sanitizeMotionSettings,
} from "../src/lib/motion-settings";

describe("motion settings v6", () => {
  test("exports v6 and round-trips all known settings", () => {
    const exported = exportMotionSettings(defaultMotionSettings);
    expect(JSON.parse(exported).schemaVersion).toBe(MOTION_SCHEMA_VERSION);
    const parsed = parseImportedSettings(exported, defaultMotionSettings);
    expect(parsed.ok && parsed.settings).toEqual(defaultMotionSettings);
  });

  test("migrates v1-v5 and preserves new current values", () => {
    for (const schemaVersion of [1, 2, 3, 4, 5]) {
      const parsed = parseImportedSettings(
        JSON.stringify({ schemaVersion, duration: 0.55, shatterEnabled: false }),
        { ...defaultMotionSettings, loopInterval: 4.8 },
      );
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.settings.duration).toBe(0.55);
        expect(parsed.settings.rollEnabled).toBe(false);
        expect(parsed.settings.loopInterval).toBe(4.8);
      }
    }
  });

  test("rejects invalid shapes and clamps v6 ranges", () => {
    for (const raw of ["null", "[]", '{"schemaVersion":99,"duration":1}']) {
      expect(parseImportedSettings(raw, defaultMotionSettings).ok).toBe(false);
    }
    const settings = sanitizeMotionSettings({
      ...defaultMotionSettings,
      loopInterval: 99,
      loopDuration: -1,
      backgroundDuration: 4,
      scrambleDuration: 4,
      scrambleTick: 0,
      scrambleDelay: 4,
      scrambleIntensity: 5,
      scrambleDirection: "diagonal",
      scrambleCharset: "html",
      scrambleGroups: { home: false, unknown: true },
      scrambleTargets: { "home.hero.eyebrow": false, unknown: true },
      sectionIntensity: 5,
      sectionStart: -1,
      sectionEnd: 2,
    });
    expect(settings.loopInterval).toBe(5);
    expect(settings.loopDuration).toBe(0.3);
    expect(settings.backgroundDuration).toBe(0.36);
    expect(settings.scrambleDuration).toBe(1.5);
    expect(settings.scrambleTick).toBe(0.025);
    expect(settings.scrambleDelay).toBe(0.5);
    expect(settings.scrambleIntensity).toBe(1);
    expect(settings.scrambleDirection).toBe("left");
    expect(settings.scrambleCharset).toBe("auto");
    expect(settings.scrambleGroups.home).toBe(false);
    expect("unknown" in settings.scrambleGroups).toBe(false);
    expect(settings.scrambleTargets["home.hero.eyebrow"]).toBe(false);
    expect("unknown" in settings.scrambleTargets).toBe(false);
    expect(settings.sectionIntensity).toBe(1);
    expect(settings.sectionStart).toBe(0);
    expect(settings.sectionEnd).toBe(1);
  });

  test("legacy partial target maps preserve current known values and discard unknown ids", () => {
    const current = {
      ...defaultMotionSettings,
      scrambleGroups: { ...defaultMotionSettings.scrambleGroups, events: false },
      scrambleTargets: {
        ...defaultMotionSettings.scrambleTargets,
        "about.page.eyebrow": false,
      },
    };
    const parsed = parseImportedSettings(
      JSON.stringify({
        schemaVersion: 5,
        scrambleGroups: { home: false, unknown: true },
        scrambleTargets: { "home.hero.eyebrow": false, unknown: true },
      }),
      current,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.settings.scrambleGroups.home).toBe(false);
      expect(parsed.settings.scrambleGroups.events).toBe(false);
      expect(parsed.settings.scrambleTargets["home.hero.eyebrow"]).toBe(false);
      expect(parsed.settings.scrambleTargets["about.page.eyebrow"]).toBe(false);
      expect("unknown" in parsed.settings.scrambleTargets).toBe(false);
    }
  });
});
