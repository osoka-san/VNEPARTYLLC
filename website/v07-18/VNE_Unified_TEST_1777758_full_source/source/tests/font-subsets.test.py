#!/usr/bin/env python3
"""Static font data comparison; this does not claim browser visual acceptance."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
import hashlib
import json
import itertools

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'public/fonts'
manifest = json.loads((FONTS / 'subsets-v1/manifest.json').read_text())
results = []
corpus = 'ВНЕ вне Ёё АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ абвгдежзийклмнопрстуфхцчшщъыьэюя ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 ←→↑↓↗↘✓✔✕×≥≤ «» „“ ”‘’ — – … № ₽ $ € £ ¥ % + = / : ; ! ? ( ) [ ] { } @ # & * _ − \u0301'
css = (FONTS / 'fonts.css').read_text()
for family in ('Unbounded', 'Onest'):
    source = FONTS / f'{family}-Variable.woff2'
    original = TTFont(source)
    cmap = original.getBestCmap()
    combined = set()
    for entry in (e for e in manifest if e['source'] == source.name):
        assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['sourceSha256']
        derived = TTFont(FONTS / entry['derivative'])
        points = set(derived.getBestCmap())
        assert not combined & points, f'{family}: overlapping Unicode ranges'
        combined |= points
        assert ''.join(entry['unicodeRange'].split()) in ''.join(css.split())
        assert [vars(a) for a in derived['fvar'].axes] == [vars(a) for a in original['fvar'].axes]
        assert [(i.subfamilyNameID, i.coordinates, i.postscriptNameID) for i in derived['fvar'].instances] == [(i.subfamilyNameID, i.coordinates, i.postscriptNameID) for i in original['fvar'].instances]
        if entry['derivative'].endswith('-core.woff2'):
            assert {ord(c) for c in corpus if ord(c) in cmap} <= points
        glyphs_checked = 0
        locations = [{}] + [{a.axisTag: w for a, w in zip(original['fvar'].axes, values)}
                            for values in itertools.product(*[(a.minValue, a.maxValue) for a in original['fvar'].axes])]
        for location in locations:
            before = original.getGlyphSet(location=location)
            after = derived.getGlyphSet(location=location)
            for point in points:
                name_before = cmap[point]
                name_after = derived.getBestCmap()[point]
                a, b = DecomposingRecordingPen(before), DecomposingRecordingPen(after)
                before[name_before].draw(a)
                after[name_after].draw(b)
                assert a.value == b.value, (family, hex(point), location, 'outline changed')
                assert before[name_before].width == after[name_after].width, (family, hex(point), location, 'advance changed')
                glyphs_checked += 1
        results.append({'font': entry['derivative'], 'codepoints': len(points), 'glyphLocationComparisons': glyphs_checked, 'bytes': (FONTS / entry['derivative']).stat().st_size})
    assert combined == set(cmap), f'{family}: incomplete original Unicode coverage'
print(json.dumps({'status': 'PASS', 'evidence': 'static original-vs-derivative font data', 'results': results}, indent=2))
