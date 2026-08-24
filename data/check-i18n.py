#!/usr/bin/env python3
"""How much of the site speaks Japanese, counted rather than felt.

Two numbers, both derived: how many overlay entries in data/ja.json are LIVE
(their English key still occurs somewhere the chrome reads from: the manifest,
the pieces, the docs frontmatter, their menu module), and how many docs pages
have a Japanese body in docs/ja/.

A dead overlay entry is the failure this overlay was designed to make visible:
somebody edited the English copy and the Japanese now translates a sentence
nobody ships. Reported as a warning with the orphaned key, never silently
dropped, because the fix is a human rereading a sentence.

Informational by default; --strict exits nonzero on dead entries.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def corpus() -> str:
    parts = []
    for f in ("data/projects.json", "data/pieces.json"):
        parts.append((ROOT / f).read_text())
    # The landing item's label is the literal "Overview" now (the group
    # heading already names the project), which the tsx scan sees on its own;
    # the synthesizer that built "<name> overview" strings retired with the
    # template.
    for md in (ROOT / "docs").rglob("*.md*"):
        if "docs/ja/" in str(md):
            continue
        parts.append(md.read_text(errors="replace"))
    parts.append((ROOT.parent / "6502" / "web" / "site-menu.js").read_text(errors="replace"))
    for tsx in (ROOT / "web").rglob("*.tsx"):
        parts.append(tsx.read_text(errors="replace"))
    for ts in (ROOT / "web" / "lib").glob("*.ts"):
        parts.append(ts.read_text(errors="replace"))
    return "\n".join(parts)


def main() -> int:
    overlay = json.loads((ROOT / "data" / "ja.json").read_text())
    text = corpus()
    dead = [k for k in overlay if k not in text]

    en_docs = [
        p.relative_to(ROOT / "docs")
        for p in (ROOT / "docs").rglob("*.md")
        if "ja/" not in str(p.relative_to(ROOT / "docs")).replace("\\", "/")
        and p.name != "README.md"
        and "styles/" not in str(p.relative_to(ROOT / "docs"))
    ]
    translated = [p for p in en_docs if (ROOT / "docs" / "ja" / p).exists()]

    print(f"check-i18n: overlay {len(overlay)} entries, {len(overlay) - len(dead)} live")
    print(f"check-i18n: docs {len(translated)} of {len(en_docs)} bodies translated")
    for k in dead:
        print(f"  DEAD: the overlay translates {k[:70]!r}, which nothing ships any more")
    if dead and "--strict" in sys.argv:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
