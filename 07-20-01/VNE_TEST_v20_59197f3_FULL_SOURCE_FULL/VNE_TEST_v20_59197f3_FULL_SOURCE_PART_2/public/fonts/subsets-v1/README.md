# VNE web-font subsets v1

These are Unicode subsets of the existing OFL 1.1 Unbounded and Onest fonts, not new designs. The original WOFF2 files and complete copyright/license files remain unchanged in the parent directory and `../licenses/`. The supplied licenses specify no Reserved Font Name after their copyright statements. HealthGoth is not modified.

`core` contains Russian/Cyrillic and English/basic Latin, combining marks, digits, punctuation, currencies, arrows, and common interface symbols. `extended` contains every remaining codepoint from its original. The CSS Unicode ranges are disjoint; the usual Russian/English page needs one file per family, not separate Latin and Cyrillic downloads. Unsupported characters retain the same system fallback as the original font.

Original variable weight axes, glyph outlines, advance widths, and original named instances are retained. The tests compare all supported codepoints at default/minimum/maximum weights and use system HarfBuzz for 64 RU/EN shaping comparisons, including ligatures, accents, punctuation, and currency. These are font-data tests; browser rendering remains a separate check.

Rebuild from the unchanged originals with Python fontTools + Brotli:

    /usr/bin/python3 scripts/performance/subset-fonts.py
    node node_modules/prettier/bin/prettier.cjs --write public/fonts/fonts.css

Validate:

    /usr/bin/python3 tests/font-subsets.test.py
    /usr/bin/python3 tests/font-shaping.test.py

The second test additionally needs the system HarfBuzz library. No production dependency was added. The manifest records all original and derivative SHA-256 values and exact Unicode ranges.

The versioned `subsets-v1` URL is immutable-cacheable. For a future font or subset change after publication, create a new versioned directory and update CSS/preloads; do not overwrite an already published immutable asset.
