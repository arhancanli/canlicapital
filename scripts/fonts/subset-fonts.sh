#!/bin/sh
# Regenerate the served web fonts from their full sources, keeping every character the site and the
# company reference can show, every variable axis, and every OpenType feature (tabular figures,
# stylistic sets). Measured 2026-09-28: Inter 352,240 -> 154,844 bytes; Chakra Petch
# Medium 78,600 -> 14,228 and Bold 78,384 -> 14,052 bytes (TTF to WOFF2). The TTFs stay
# beside the WOFF2s as the @font-face fallback.
#
#   sh scripts/fonts/subset-fonts.sh          (needs uv; runs fonttools with brotli)
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# Basic Latin through Latin Extended-A, Greek, general punctuation, currency, letterlike symbols,
# arrows, mathematical operators, geometric shapes, and the warning sign, check and cross marks.
UNICODES="U+0000-017F,U+0370-03FF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+26A0,U+2713,U+2717"
# Everything but unused glyphs is kept (tables, names, notdef outline, glyph names, OS/2 Unicode
# ranges): with fonttools' default drops Chrome anti-aliased some Inter text differently on two
# pages; with these options screenshots of six pages at phone and desktop width match the full font
# to the pixel.
subset() {
  uv run --quiet --with fonttools==4.60.1 --with brotli==1.1.0 pyftsubset "$1" --unicodes="$UNICODES" \
    --layout-features='*' --flavor=woff2 --drop-tables= --hinting --name-IDs='*' --name-languages='*' \
    --notdef-outline --glyph-names --no-prune-unicode-ranges --legacy-kern --output-file="$2"
}
subset "$ROOT/fonts-src/inter/InterVariable.woff2" "$ROOT/public/fonts/inter/InterVariable.woff2"
subset "$ROOT/public/fonts/chakra-petch/ChakraPetch-Medium.ttf" "$ROOT/public/fonts/chakra-petch/ChakraPetch-Medium.woff2"
subset "$ROOT/public/fonts/chakra-petch/ChakraPetch-Bold.ttf" "$ROOT/public/fonts/chakra-petch/ChakraPetch-Bold.woff2"
ls -l "$ROOT/public/fonts/inter/InterVariable.woff2" "$ROOT/public/fonts/chakra-petch/"*.woff2
