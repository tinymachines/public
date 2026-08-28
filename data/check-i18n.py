#!/usr/bin/env python3
"""How much of the site speaks Japanese, counted rather than felt.

Two numbers off the tree, both derived: how many overlay entries in
data/ja.json are LIVE (their English key still occurs somewhere the chrome
reads from: the manifest, the pieces, the docs frontmatter, their menu
module), and how many docs pages have a Japanese body in docs/ja/.

A dead overlay entry is the failure this overlay was designed to make visible:
somebody edited the English copy and the Japanese now translates a sentence
nobody ships. Reported as a warning with the orphaned key, never silently
dropped, because the fix is a human rereading a sentence.

--live adds the third number, and it is the one a reader feels: for every page
in the published sitemap, how much of the JAPANESE page's own body is actually
Japanese. The tree cannot answer that. A page can be fully wired for the
overlay, carry a translated menu, a translated title and a translated
breadcrumb, and still open with an English document under it, which is exactly
what /ja/6502/tracer does and what the owner reported on 2026-08-28 as "the
menu changes and the page does not". Counted on the served HTML, per page, so
the gap is a list of paths rather than an impression.

Informational by default; --strict exits nonzero on dead entries.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Kana and CJK. Latin letters are the other half of the ratio: a body that is
# all identifiers and code fences would read as untranslated by a raw kana
# count, so the share is against the letters actually competing with it.
KANA_CJK = re.compile(r"[぀-ヿ㐀-鿿]")
LATIN = re.compile(r"[A-Za-z]")


def corpus() -> str:
    parts = []
    for f in ("data/projects.json", "data/pieces.json"):
        parts.append((ROOT / f).read_text())
    # The landing item's label is the literal "Overview" now (the group
    # heading already names the project), which the tsx scan sees on its own;
    # the synthesizer that built "<name> overview" strings retired with the
    # template.
    for md in docs_files():
        parts.append(md.read_text(errors="replace"))
    parts.append((ROOT.parent / "6502" / "web" / "site-menu.js").read_text(errors="replace"))
    # The explorer pages' own titles and descriptions ship through
    # lib/explorer.ts, so their <head> is part of what the overlay may name.
    for h in (ROOT.parent / "6502" / "web").glob("*.html"):
        parts.append(h.read_text(errors="replace"))
    for tsx in (ROOT / "web").rglob("*.tsx"):
        parts.append(tsx.read_text(errors="replace"))
    for ts in (ROOT / "web" / "lib").glob("*.ts"):
        parts.append(ts.read_text(errors="replace"))
    return "\n".join(parts)


def docs_files() -> list[Path]:
    """Every English docs page, in both spellings the tree actually uses.

    `.mdx` is not a nicety here. This globbed `*.md` alone until 2026-08-28,
    and docs/6502/two-ways-in.mdx is a published page: it was outside the
    denominator, outside the corpus, and therefore untranslated without ever
    being counted as untranslated. A check that cannot see a page cannot
    report it missing.
    """
    out = []
    for pat in ("*.md", "*.mdx"):
        for p in (ROOT / "docs").rglob(pat):
            rel = str(p.relative_to(ROOT / "docs")).replace("\\", "/")
            if rel.startswith("ja/") or p.name == "README.md" or "styles/" in rel:
                continue
            out.append(p)
    return sorted(out)


def ja_share(text: str) -> float | None:
    """The share of the letters in this text that are Japanese, or None if none."""
    ja, latin = len(KANA_CJK.findall(text)), len(LATIN.findall(text))
    return ja / (ja + latin) if (ja + latin) else None


def visible(html: str) -> str:
    html = re.sub(r"<(script|style|template|noscript)\b.*?</\1>", " ", html, flags=re.S)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"&[a-z]+;|&#\d+;", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def body_of(html: str) -> str:
    """The page's own document, without the chrome around it.

    The chrome is translated everywhere, because it comes from the overlay,
    so counting a whole page hides the thing being looked for. <main> is the
    seam for every page that has one, which is every page but /6502/lab: the
    Lab is a full-bleed instrument and ships no <main>, so it falls back to
    the whole document and its number is a whole-page number, diluted by a
    chrome that IS translated. It reads 0% even so, which is the answer.
    """
    m = re.search(r"<main\b[^>]*>(.*?)</main>", html, re.S)
    return visible(m.group(1) if m else html)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "tinymachines check-i18n"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf8", "replace")


def live(base: str) -> int:
    """Every published page, against its own Japanese twin."""
    xml = fetch(f"{base}/sitemap.xml")
    paths = sorted({re.sub(r"/$", "", u.split(base, 1)[-1]) or "/" for u in re.findall(r"<loc>([^<]+)</loc>", xml)})
    english = [p for p in paths if p != "/ja" and not p.startswith("/ja/")]
    if len(english) < 50:
        print(f"check-i18n: the sitemap lists {len(english)} English pages; that is not this site", file=sys.stderr)
        return 1

    def one(p: str):
        twin = "/ja" if p == "/" else f"/ja{p}"
        try:
            en_html, ja_html = fetch(base + p), fetch(base + twin)
        except Exception as e:  # a page that will not answer is a finding, not a crash
            return (p, None, f"unreachable: {e}")
        # The BODIES, not the documents: the chrome is translated on every
        # page, so whole-page equality is a comparison that can never be true
        # and would report nothing forever.
        same = body_of(en_html) == body_of(ja_html)
        return (p, ja_share(body_of(ja_html)), "byte for byte the English page" if same else "")

    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        rows = list(pool.map(one, english))
    rows.sort(key=lambda r: (-1 if r[1] is None else r[1], r[0]))

    # The threshold is a floor, not a grade: below it, the page opens in
    # English however much of its chrome flipped.
    FLOOR = 0.2
    print(f"check-i18n: {len(rows)} published pages, measured at {base}")
    for p, share, note in rows:
        mark = "  " if share is not None and share >= FLOOR else "EN"
        print(f"  {mark} {p:44} {'-' if share is None else f'{share:.0%}':>5}  {note}")
    english_only = [p for p, s, _ in rows if s is None or s < FLOOR]
    print(f"check-i18n: {len(rows) - len(english_only)} of {len(rows)} pages have a Japanese body")
    return 0


def main() -> int:
    if "--live" in sys.argv:
        i = sys.argv.index("--live")
        arg = sys.argv[i + 1] if len(sys.argv) > i + 1 and not sys.argv[i + 1].startswith("-") else None
        return live((arg or os.environ.get("BASE") or "https://tinymachines.ai").rstrip("/"))

    overlay = json.loads((ROOT / "data" / "ja.json").read_text())
    text = corpus()
    dead = [k for k in overlay if k not in text]

    en_docs = [p.relative_to(ROOT / "docs") for p in docs_files()]
    # The Japanese twin keeps the English page's extension: docs/ja mirrors
    # the tree it translates.
    translated = [p for p in en_docs if (ROOT / "docs" / "ja" / p).exists()]

    print(f"check-i18n: overlay {len(overlay)} entries, {len(overlay) - len(dead)} live")
    print(f"check-i18n: docs {len(translated)} of {len(en_docs)} bodies translated")
    for p in sorted(set(en_docs) - set(translated)):
        print(f"  UNTRANSLATED: docs/{p}")
    for k in dead:
        print(f"  DEAD: the overlay translates {k[:70]!r}, which nothing ships any more")
    if dead and "--strict" in sys.argv:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
