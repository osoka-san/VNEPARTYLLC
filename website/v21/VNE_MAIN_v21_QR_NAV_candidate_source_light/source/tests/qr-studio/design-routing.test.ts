import assert from "node:assert/strict";
import { QR_TEMPLATES } from "../../src/lib/qr-studio/catalog";
import {
  currentDesignRecipe,
  savedDesignRecipe,
  importedDesignRecipe,
  isNewDesignChoice,
} from "../../src/lib/qr-studio/design-recipe";
import { ENGINE_VERSION, engineForPattern, patternFile } from "../../src/lib/qr-studio/pattern";
import {
  loadPreviewDraft,
  parsePreviewDraft,
  savePreviewDraft,
} from "../../src/lib/qr-studio/ticket-preview";
import {
  designQrPalette,
  REFERENCE_PASS_PALETTES,
} from "../../src/lib/qr-studio/reference-pass-palette";
import { PASS_QR_PALETTES, passTemplateImage } from "../../src/lib/qr-studio/pass-palette";
import type { PassAccess } from "../../src/components/tickets/types";
const data: Record<string, string> = {};
const storage = {
  getItem: (k: string) => data[k] ?? null,
  setItem: (k: string, v: string) => {
    data[k] = v;
  },
  removeItem: (k: string) => {
    delete data[k];
  },
};
// Object.keys must reflect stored draft keys as in real sessionStorage.
Object.defineProperty(globalThis, "sessionStorage", {
  value: new Proxy(storage, {
    ownKeys: () => Reflect.ownKeys(data),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  }),
  configurable: true,
});
let checks = 0;
for (const t of QR_TEMPLATES) {
  const current = currentDesignRecipe(t.pattern);
  assert.equal(
    isNewDesignChoice(current),
    ["origami", "basalt", "portals", "constellation", "weave", "folds"].includes(t.id),
  );
  assert.equal(current.engineVersion, engineForPattern(t.pattern));
  for (const engineVersion of new Set([ENGINE_VERSION, current.engineVersion])) {
    const recipe = savedDesignRecipe({ pattern: t.pattern, engineVersion });
    if (engineVersion === ENGINE_VERSION) assert.equal(isNewDesignChoice(recipe), false);
    const id = savePreviewDraft(recipe.pattern, "на удачу", recipe.engineVersion),
      draft = loadPreviewDraft(id);
    assert.equal(draft.engineVersion, engineVersion);
    assert.deepEqual(draft.pattern, recipe.pattern);
    assert.equal(draft.text, "на удачу");
    const issueSnapshot = JSON.parse(JSON.stringify({ design: recipe })).design;
    assert.deepEqual(issueSnapshot, recipe);
    assert.equal(
      importedDesignRecipe({ ...patternFile(t.pattern), engineVersion }).engineVersion,
      engineVersion,
    );
    for (const access of Object.keys(PASS_QR_PALETTES) as PassAccess[]) {
      assert.deepEqual(
        designQrPalette(access, recipe),
        engineVersion === ENGINE_VERSION
          ? PASS_QR_PALETTES[access]
          : REFERENCE_PASS_PALETTES[access],
      );
      if (engineVersion === ENGINE_VERSION)
        assert.equal(
          passTemplateImage(t.id, access, engineVersion),
          `/assets/qr-studio/passes/${t.id}-${access.toLowerCase()}.webp`,
        );
    }
    checks++;
  }
  const oldDraft = parsePreviewDraft({ schema: 1, pattern: t.pattern, text: "x", createdAt: 0 });
  assert.equal(oldDraft.engineVersion, ENGINE_VERSION);
}
assert.throws(() =>
  savedDesignRecipe({ pattern: QR_TEMPLATES[0]!.pattern, engineVersion: "unknown" }),
);
assert.throws(() =>
  parsePreviewDraft({
    schema: 1,
    pattern: QR_TEMPLATES[0]!.pattern,
    text: "x",
    createdAt: 0,
    engineVersion: "vne-origami-1.0.0",
  }),
);
console.log(
  JSON.stringify({
    status: "PASS",
    recipeRoutes: checks,
    legacyDraftDefault: ENGINE_VERSION,
    legacyPaletteAndAssetRouting: "exact",
    network: "none",
  }),
);
