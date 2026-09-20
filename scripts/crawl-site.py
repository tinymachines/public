#!/usr/bin/env python3
"""The site as a visitor meets it, counted rather than remembered.

    python3 scripts/crawl-site.py              # against the live site
    python3 scripts/crawl-site.py --base URL   # against a preview
    python3 scripts/crawl-site.py --check      # refuse if the record is stale

The owner could not find /nes/playground on 2026-09-20, the day it was
published. It was in the sitemap, in the menu and linked from the front page,
and none of that told anybody where it was NOT: the NES section it belongs to
never mentioned it. Nothing on this site could answer "how does a reader reach
this page", because the answer is not in the tree. It is in the pages.

So this fetches every page and follows only the links a reader can see. The
site's own chrome comes out first, nav, header and footer, because a page that
only the menu knows about is a page nobody finds, and counting the menu would
have called the playground well connected. What is left is what each page
itself puts on the screen, including the strip a tool page hangs under its
instrument, which is the only door its article has.

It records rather than asserts: data/site-map.json carries the origin, the
date, and for each page its title, section, how many pages link to it, how
many clicks it sits from the front page, its length, and how much of its
Japanese twin is Japanese. /style/map renders that file. Re-run it after a
deploy that adds or links a page; --check fails when the record names a page
the sitemap no longer serves, or misses one it does.
"""

from __future__ import annotations

import argparse
import collections
import concurrent.futures
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "site-map.json"

# Routes a visitor can reach that the sitemap deliberately leaves out, and why
# it leaves them out (app/sitemap.ts holds the same list with its reasons).
# They are counted because a page nobody links to is exactly what this looks
# for, and the sitemap's omissions are where those collect.
UNLISTED = ["/admin", "/hotbits/space", "/visitors", "/style/zoo", "/6502/manage", "/6502/consolev2"]

KANA_CJK = re.compile(r"[぀-ヿ㐀-鿿]")
LATIN = re.compile(r"[A-Za-z]")


def fetch(base: str, path: str) -> str:
    url = base + ("" if path == "/" else path)
    req = urllib.request.Request(url, headers={"User-Agent": "tinymachines crawl-site"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf8", "replace")


def tidy(path: str) -> str:
    path = re.sub(r"/$", "", path)
    return path or "/"


def strip_chrome(html: str) -> str:
    """Everything the page itself shows, without the frame every page carries."""
    for tag in ("nav", "header", "footer"):
        html = re.sub(rf"<{tag}\b.*?</{tag}>", " ", html, flags=re.S | re.I)
    return html


def body_text(html: str) -> str:
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    # The notice is Japanese text a page prints BECAUSE its body is English,
    # so counting it raises the share of exactly the pages it reports on.
    html = re.sub(r'<p[^>]*class="[^"]*untranslated[^"]*"[^>]*>.*?</p>', " ", html, flags=re.S)
    m = re.search(r"<main\b[^>]*>(.*?)</main>", html, re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1) if m else html))


def ja_share(text: str) -> float | None:
    ja, latin = len(KANA_CJK.findall(text)), len(LATIN.findall(text))
    return round(ja / (ja + latin), 3) if ja + latin else None


def section(path: str) -> str:
    if path == "/":
        return "front"
    head = path.strip("/").split("/")[0]
    return head if head in ("docs", "6502", "nes", "hotbits", "style") else "other"


def crawl(base: str) -> dict:
    xml = fetch(base, "/sitemap.xml")
    listed = {tidy(re.sub(r"^https?://[^/]+", "", u)) for u in re.findall(r"<loc>([^<]+)</loc>", xml)}
    english = sorted({p for p in listed if not p.startswith("/ja")} | set(UNLISTED))

    def one(path: str):
        try:
            html = fetch(base, path)
        except Exception as e:  # a listed page that does not answer is the finding
            return path, {"error": str(e)[:80]}
        title = re.sub(r"\s*·\s*tinymachines\s*$", "", (re.search(r"<title>(.*?)</title>", html, re.S) or ["", ""])[1]).strip()
        seen = strip_chrome(html)
        links = {tidy(h) for h in re.findall(r'href="(/[^"#?]*)', seen) if not h.startswith("/ja")}
        try:
            twin = fetch(base, "/ja" if path == "/" else "/ja" + path)
            share = ja_share(body_text(twin))
        except Exception:
            share = None
        return path, {"title": title, "words": len(body_text(html).split()), "ja": share, "links": sorted(links)}

    pages: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        for path, row in pool.map(one, english):
            pages[path] = row

    inbound: collections.Counter[str] = collections.Counter()
    for path, row in pages.items():
        for target in row.get("links", []):
            if target in pages and target != path:
                inbound[target] += 1

    # Clicks from the front page, through those same visible links.
    depth = {"/": 0}
    frontier = ["/"]
    while frontier:
        nxt = []
        for path in frontier:
            for target in pages.get(path, {}).get("links", []):
                if target in pages and target not in depth:
                    depth[target] = depth[path] + 1
                    nxt.append(target)
        frontier = nxt

    out = {}
    for path, row in sorted(pages.items()):
        if "error" in row:
            out[path] = {"error": row["error"]}
            continue
        out[path] = {
            "title": row["title"] or path,
            "section": section(path),
            "words": row["words"],
            "ja": row["ja"],
            "inbound": inbound[path],
            "depth": depth.get(path),
            "listed": path in listed,
        }
    return {
        "_": "Every page and how a reader reaches it, counted by scripts/crawl-site.py. "
             "Links are the ones a reader can see: the site's nav, header and footer come out first.",
        "origin": base,
        "crawled": date.today().isoformat(),
        "pages": out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://tinymachines.ai")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    base = a.base.rstrip("/")

    if a.check:
        if not OUT.is_file():
            print("crawl-site: no data/site-map.json; run scripts/crawl-site.py")
            return 1
        record = json.loads(OUT.read_text())
        xml = fetch(base, "/sitemap.xml")
        listed = {tidy(re.sub(r"^https?://[^/]+", "", u)) for u in re.findall(r"<loc>([^<]+)</loc>", xml)}
        listed = {p for p in listed if not p.startswith("/ja")}
        known = {p for p, v in record["pages"].items() if v.get("listed")}
        missing, gone = sorted(listed - known), sorted(known - listed)
        if missing or gone:
            print(f"crawl-site: the record is from {record['crawled']} and the site has moved on")
            for p in missing:
                print(f"  NOT IN THE MAP: {p}")
            for p in gone:
                print(f"  NO LONGER SERVED: {p}")
            print("  Re-run: python3 scripts/crawl-site.py")
            return 1
        print(f"crawl-site: the map matches the sitemap, {len(known)} pages, crawled {record['crawled']}")
        return 0

    record = crawl(base)
    OUT.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n")
    pages = record["pages"]
    doors = collections.Counter(v.get("inbound") for v in pages.values())
    print(f"crawl-site: {len(pages)} pages from {base}, recorded in data/site-map.json")
    print(f"  no door at all: {doors[0]}   one door: {doors[1]}")
    deepest = max((v.get("depth") or 0) for v in pages.values())
    print(f"  deepest page: {deepest} clicks from the front")
    return 0


if __name__ == "__main__":
    sys.exit(main())
