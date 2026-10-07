import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { QR_TEMPLATES, parsePreviewSearch } from "../../src/lib/qr-studio/catalog";
import {
  parsePattern,
  patternFile,
  readPatternFile,
  TEMPLATE_IDS,
} from "../../src/lib/qr-studio/pattern";
import {
  parsePreviewDraft,
  savePreviewDraft,
  loadPreviewDraft,
} from "../../src/lib/qr-studio/ticket-preview";
import { PASS_QR_PALETTES, passTemplateImage } from "../../src/lib/qr-studio/pass-palette";
import type { PassAccess } from "../../src/components/tickets/types";
const storage: Record<string, any> = {
  getItem(k: string) {
    return this[k] ?? null;
  },
  setItem(k: string, v: string) {
    this[k] = v;
  },
  removeItem(k: string) {
    delete this[k];
  },
};
Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
assert.equal(QR_TEMPLATES.length, 16);
assert.equal(new Set(QR_TEMPLATES.map((t) => t.id)).size, 16);
assert.deepEqual(
  QR_TEMPLATES.map((t) => t.id),
  [...TEMPLATE_IDS],
);
for (const t of QR_TEMPLATES) {
  for (const access of Object.keys(PASS_QR_PALETTES) as PassAccess[]) {
    assert.ok(
      existsSync(resolve(import.meta.dirname, "../../public" + passTemplateImage(t.id, access))),
    );
    assert.equal(parsePreviewSearch({ template: t.id, access }).access, access);
  }
  for (const asset of ["reference.webp", "working.svg"])
    assert.ok(
      existsSync(
        resolve(import.meta.dirname, `../../public/assets/qr-studio/catalog/${t.id}-${asset}`),
      ),
      `${t.id}: missing ${asset}`,
    );
  const pattern = {
    ...t.pattern,
    event: "Лес · ночь",
    name: t.name + " / гость",
    palette: "paper" as const,
    accents: false,
  };
  const text = "на удачу 🌲";
  const id = savePreviewDraft(pattern, text);
  const saved = loadPreviewDraft(id);
  assert.deepEqual(saved.pattern, pattern);
  assert.equal(saved.text, text);
  assert.deepEqual(readPatternFile(patternFile(pattern)).pattern, pattern);
  assert.deepEqual(parsePreviewSearch({ view: "preview", template: t.id, draft: id }), {
    view: "preview",
    template: t.id,
    draft: id,
  });
}
for (let i = 0; i < 5; i++) savePreviewDraft(QR_TEMPLATES[0]!.pattern, "тест" + i);
assert.equal(Object.keys(storage).filter((k) => k.startsWith("vne-qr-card-preview:")).length, 16);
assert.deepEqual(
  parsePreviewSearch({
    view: "issue",
    template: "bad",
    draft: "<script>",
    text: "must-not-be-in-url",
  }),
  { view: undefined, template: undefined, draft: undefined },
);
assert.throws(() => loadPreviewDraft("not-a-draft"));
assert.throws(() => loadPreviewDraft(crypto.randomUUID()));
for (const raw of [
  null,
  {},
  [],
  { schema: 1, text: "x", pattern: QR_TEMPLATES[0]!.pattern, createdAt: NaN },
])
  assert.throws(() => parsePreviewDraft(raw));
assert.throws(() => savePreviewDraft(QR_TEMPLATES[0]!.pattern, "я".repeat(111)));
assert.throws(() => parsePattern({ ...QR_TEMPLATES[0]!.pattern, template: "<script>" }));
assert.equal(
  readPatternFile({ ...patternFile(QR_TEMPLATES[0]!.pattern), engineVersion: "vne-glyphs-0.4.0" })
    .legacy,
  true,
);
console.log(
  JSON.stringify({
    status: "PASS",
    templates: 16,
    fullPatternAndPayload: "PASS",
    boundedLocalDrafts: "PASS",
    invalidInput: "PASS",
    urlContainsNoPayload: true,
  }),
);
