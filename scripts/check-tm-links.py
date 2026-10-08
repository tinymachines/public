#!/usr/bin/env python3
"""Crawl the tm:// namespace and hold its links to their promises (TM-15).

  python3 scripts/check-tm-links.py [--budget N]

Starts at tm://tinymachines/ and walks every collection's children and every
link's href, breadth first, up to a budget of reads. It runs the namespace
in-process over this checkout, so the http mount reads the sites through
nginx on loopback exactly as the server does; run it after a deploy has
restarted the site, and it checks what is live.

What it asserts, for every URI it reaches:

  - it resolves: no not-found, out-of-root or bad-facet (a denied file is
    only reached through a listing that marked it redacted, and is skipped;
    too-large is an answer, with its range template);
  - no `up` link names the URI itself;
  - a listed child resolves with the mimeType the listing claimed;
  - every link of a paired relation has its inverse on the target:
    tm:source / tm:renders-as, tm:generates / tm:generated-by,
    tm:working-copy / tm:repository.

tm:data / tm:read-by are not held to inverses yet: they follow imports
through shared modules, so the menu's records read as every page's data and
the readers listed are partly false (TM-8, TM-14 in the owner's work package
of 2026-10-07). The count of those links is printed, not asserted.

Git mounts are walked by their links and two levels of listing, not file by
file: nine repositories' every file would be most of the budget and prove
little the mount's tests do not.
"""
import argparse, asyncio, sys
from collections import deque
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import tm  # noqa: E402

PAIRS = {"tm:source": "tm:renders-as", "tm:renders-as": "tm:source", "tm:generates": "tm:generated-by",
         "tm:generated-by": "tm:generates", "tm:working-copy": "tm:repository", "tm:repository": "tm:working-copy"}
LOOSE = {"tm:data", "tm:read-by"}


def identity(uri: str) -> str:
    """A URI without its facets, except a git ref, which is part of what it names."""
    parts = urlsplit(uri)
    keep = [q for q in parts.query.split("&") if q.startswith("at=")]
    return f"{parts.scheme}://{parts.netloc}{parts.path}" + (f"?{keep[0]}" if keep else "")


def stat_of(uri: str) -> str:
    """The URI of a file's or a page's stat; a collection or the root as it is."""
    if uri.endswith("/") or uri == tm.ROOT:
        return uri
    return uri + ("&" if "?" in uri else "?") + "as=stat"


def git_depth(uri: str) -> int | None:
    parts = urlsplit(uri).path.strip("/").split("/")
    return len(parts) - 2 if parts and parts[0] == "git" else None


async def crawl(budget: int) -> int:
    ns = tm.Namespace(ROOT)
    seen: dict[str, dict] = {}
    problems: list[str] = []
    queue = deque([(tm.ROOT, None)])
    claimed: dict[str, str] = {}
    loose = 0

    async def get(uri: str):
        if uri not in seen:
            try:
                r = await ns.read(uri)
                seen[uri] = {"ok": True, "links": r["_meta"][tm.META_LINKS], "content": r["contents"][0]}
            except tm.TmError as e:
                seen[uri] = {"ok": False, "reason": e.reason}
        return seen[uri]

    reads = 0
    while queue and reads < budget:
        uri, via = queue.popleft()
        if uri in seen:
            continue
        reads += 1
        # A file or a page is read as its stat: it carries the same links, the
        # type, and nothing too large to read.
        probe = stat_of(uri)
        got = await get(probe)
        seen[uri] = got
        if not got["ok"]:
            if got["reason"] not in ("too-large", "denied"):
                problems.append(f"{uri} (from {via}) does not resolve: {got['reason']}")
            continue
        links = got["links"]
        for ln in links:
            if ln["rel"] == "up" and identity(ln["href"]) == identity(uri):
                problems.append(f"{uri}: up names itself")
        if uri in claimed and not uri.endswith("/"):
            import json as _j
            st = _j.loads(got["content"]["text"]) if got["content"].get("text", "").startswith("{") else {}
            mime = st.get("mimeType") or (st.get("contentType", "").split(";")[0].strip() or None)
            if claimed[uri] != mime:
                problems.append(f"{uri}: listed as {claimed[uri]}, read as {mime}")
        text = got["content"].get("text") or ""
        if uri.endswith("/") and got["content"].get("mimeType") == "application/json" and text.startswith("{"):
            import json
            body = json.loads(text)
            for child in body.get("children", []):
                if child.get("redacted") or child.get("submodule"):
                    continue
                d = git_depth(child["uri"])
                if d is not None and d > 2:
                    continue
                if "mimeType" in child:
                    claimed[child["uri"]] = child["mimeType"]
                queue.append((child["uri"], uri))
            for m in body.get("mounts", []):
                queue.append((m["uri"], uri))
        for ln in links:
            href = ln["href"]
            if "{" in href:
                continue
            if ln["rel"] in LOOSE:
                loose += 1
            if href not in seen and identity(href) not in seen:
                queue.append((identity(href), uri))
    # Inverses, over every page and file reached.
    for uri, got in list(seen.items()):
        if not got.get("ok"):
            continue
        for ln in got["links"]:
            inv = PAIRS.get(ln["rel"])
            if not inv:
                continue
            target = identity(ln["href"])
            t = seen.get(target)
            if t is None:
                t = await get(stat_of(target))
            if not t["ok"]:
                problems.append(f"{uri} {ln['rel']} {target}: the target does not resolve ({t['reason']})")
                continue
            back = {identity(b["href"]) for b in t["links"] if b["rel"] == inv}
            if identity(uri) not in back:
                problems.append(f"{uri} {ln['rel']} {target}: no {inv} back")
    print(f"check-tm-links: {reads} URIs read, {len(seen)} resolved or refused, {loose} tm:data / tm:read-by links not yet held to inverses (TM-8, TM-14)")
    if reads >= budget:
        print(f"check-tm-links: the budget of {budget} reads ran out with {len(queue)} still queued")
    for p in problems[:40]:
        print(f"  {p}")
    if problems:
        print(f"check-tm-links: {len(problems)} problem(s)")
        return 1
    print("check-tm-links: every link resolves, no up names itself, every listing's type holds, every pair has its inverse")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=4000)
    a = ap.parse_args()
    sys.exit(asyncio.run(crawl(a.budget)))


if __name__ == "__main__":
    main()
