#!/usr/bin/env python3
"""Every Japanese character the site ships must be drawable on a link card.

The card renderer (web/lib/card.tsx) has one Japanese face, a subset of Noto
Sans CJK JP in style/fonts/og. A character outside it renders as nothing at
all on the card, and a card with a hole in its title is a card nobody
reports, so this checks the shipped Japanese against the font's own cmap.

The corpus is what reaches a card: the overlay (titles and descriptions
travel through it), the Japanese docs (their titles do), and the Japanese
strings in the page dictionaries. Exit nonzero on the first character the
face cannot draw, naming it.
"""

import json
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FACE = ROOT / "style" / "fonts" / "og" / "NotoSansJP-Bold.woff"


def corpus() -> str:
    parts = [json.dumps(json.load(open(ROOT / "data" / "ja.json")), ensure_ascii=False)]
    for md in (ROOT / "docs" / "ja").rglob("*.md"):
        parts.append(md.read_text(errors="replace"))
    for tsx in (ROOT / "web" / "app").rglob("*.tsx"):
        parts.append(tsx.read_text(errors="replace"))
    for ts in (ROOT / "web" / "lib").glob("*.ts"):
        parts.append(ts.read_text(errors="replace"))
    return "".join(parts)


def main() -> int:
    cmap = TTFont(FACE).getBestCmap()
    # What counts as Japanese here: kana, the CJK punctuation block, the
    # ideographs and the fullwidth forms. Latin is drawn by the other faces.
    jp = re.compile(r"[　-ヿ㐀-鿿＀-￯]")
    missing = sorted({ch for ch in jp.findall(corpus()) if ord(ch) not in cmap})
    if missing:
        print(f"check-og-font: {len(missing)} character(s) the card face cannot draw:")
        print("  " + " ".join(f"{c} (U+{ord(c):04X})" for c in missing))
        print("  Widen the subset (style/fonts/og/README.md) or change the copy.")
        return 1
    print(f"check-og-font: every shipped Japanese character is in {FACE.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
