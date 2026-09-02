#!/usr/bin/env bash
# Cut src/favicon.ico from the app's mark. Run: npm run icons (needs ImageMagick).
#
# The mark is "Marked passage" (1C in the design project's "App Icon.dc.html"):
# a ribbon marker cut from paper on a steel field, rules standing in for the
# passage it holds. The design draws it three times rather than once, because a
# rule that reads at 220px closes up into grey at 16px, so each size is cut
# from the drawing made for it, and this script is where that mapping lives.
#
#   48, 32  src/icon.svg      the design's 48px cut, two rules at 3.2
#   16      the heredoc below  the 24px cut, two rules at 4.6
#
# The 16px source is nudged off the design's own coordinates so that every edge
# lands on a whole pixel once 64 is divided by 4: the ribbon to x20-44, the
# rules to stroke 4 on y22/y34. Unhinted, those edges fall on half pixels and
# the whole mark renders soft. That is hinting, not redrawing, it is the same
# ribbon, moved by a quarter of a pixel.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/cut16.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1d2d3d"/>
  <polygon points="20,8 44,8 44,56 32,46 20,56" fill="#f2f2f3"/>
  <g stroke="#1d2d3d" stroke-width="4"><path d="M24 22H40"/><path d="M24 34H36"/></g>
</svg>
SVG

magick -background none src/icon.svg -resize 48x48 "$tmp/48.png"
magick -background none src/icon.svg -resize 32x32 "$tmp/32.png"
magick -background none "$tmp/cut16.svg" -resize 16x16 "$tmp/16.png"
magick "$tmp/48.png" "$tmp/32.png" "$tmp/16.png" src/favicon.ico

echo "Cut src/favicon.ico (48, 32 from src/icon.svg; 16 from the hinted 24px cut)"
