#!/usr/bin/env python3
"""Crawl the tm:// namespace and hold its links to their promises (TM-15).

  python3 scripts/check-tm-links.py [--budget N] [--repo PATH]

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
    tm:working-copy / tm:repository, tm:data / tm:read-by (the last pair
    since TM-8 and TM-14: a page's data is what its own code reads; since
    TM-18 a record names each route that reads it once, by its page or by
    the collection its pages are listed in, and a page anywhere is answered
    by that one link, at the same confidence), and the entity mount's
    pairs (TM-16): tm:found-in / tm:exhibits, tm:instance / tm:instance-of,
    tm:demonstrated-by / tm:demonstrates, tm:measures / tm:measured-by,
    tm:cartridge / tm:cartridge-of, each at the same confidence both ways.
    An entity's tm:data is answered by its record's one link to the
    collection of its kind, as a page's is by its route's, and every
    entity carries one;
  - an `alternate` to another version of a page (the other language, the
    other site) is answered by one back (TM-20), since TM-18 counts on
    those links to carry a reader from the one route it names;
  - a submodule is listed with a type and resolves to what it pins (TM-19:
    it used to be skipped, which is how a submodule that read as not-found
    went unnoticed).

Git mounts are walked by their links and two levels of listing, not file by
file: nine repositories' every file would be most of the budget and prove
little the mount's tests do not.

A budget that runs out is a failure, not a pass: whatever was still queued
was not checked. --repo crawls another checkout with this one's code, which
is how a change is crawled against the box's build before it is deployed.
"""
import argparse, asyncio, sys
from collections import deque
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import tm  # noqa: E402

PAIRS = {"tm:source": "tm:renders-as", "tm:renders-as": "tm:source", "tm:generates": "tm:generated-by",
         "tm:generated-by": "tm:generates", "tm:working-copy": "tm:repository", "tm:repository": "tm:working-copy",
         "tm:data": "tm:read-by", "tm:read-by": "tm:data", "tm:input": "tm:input-of", "tm:input-of": "tm:input"}
# The entity mount's pairs (TM-16).
ENTITY_PAIRS = {"tm:found-in": "tm:exhibits", "tm:instance": "tm:instance-of", "tm:demonstrated-by": "tm:demonstrates",
                "tm:measures": "tm:measured-by", "tm:cartridge": "tm:cartridge-of"}
PAIRS.update(ENTITY_PAIRS)
PAIRS.update({v: k for k, v in ENTITY_PAIRS.items()})
# Pairs whose two ends must agree on how sure they are.
SAME_CONFIDENCE = {"tm:data", "tm:read-by"} | set(ENTITY_PAIRS) | set(ENTITY_PAIRS.values())


def identity(uri: str) -> str:
    """A URI without its facets, except a git ref, which is part of what it names."""
    parts = urlsplit(uri)
    keep = [q for q in parts.query.split("&") if q.startswith("at=")]
    return f"{parts.scheme}://{parts.netloc}{parts.path}" + (f"?{keep[0]}" if keep else "")


def stat_of(uri: str) -> str:
    """The URI of a file's or a page's stat; a collection or the root as it is.
    A collection is a path ending in /, whatever query follows it: a tree at
    a ref (git/<repo>/?at=<commit>, where a submodule's pin points) is still
    a tree, and a tree refuses ?as=stat (TM-11)."""
    if urlsplit(uri).path.endswith("/") or uri == tm.ROOT:
        return uri
    return uri + ("&" if "?" in uri else "?") + "as=stat"


def git_depth(uri: str) -> int | None:
    parts = urlsplit(uri).path.strip("/").split("/")
    return len(parts) - 2 if parts and parts[0] == "git" else None


async def crawl(budget: int, repo: Path = ROOT, ns=None) -> int:
    ns = ns or tm.Namespace(repo)
    seen: dict[str, dict] = {}
    problems: list[str] = []
    queue = deque([(tm.ROOT, None)])
    claimed: dict[str, str] = {}

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
        # TM-16: an entity says where in its record it is read from. No pair
        # would miss the link if it went, so it is asked for outright.
        if urlsplit(uri).path.startswith("/entity/") and not uri.endswith("/") and not any(ln["rel"] == "tm:data" for ln in links):
            problems.append(f"{uri}: an entity with no tm:data to its record")
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
                if child.get("redacted"):
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
            if href not in seen and identity(href) not in seen:
                queue.append((identity(href), uri))
    # Inverses, over every page and file reached.
    for uri, got in list(seen.items()):
        if not got.get("ok"):
            continue
        for ln in got["links"]:
            if ln["rel"] == "alternate" and identity(ln["href"]) != identity(uri) and "/http/" in uri:
                # Another version of the page, not another facet of it (TM-20).
                t = seen.get(identity(ln["href"])) or await get(stat_of(identity(ln["href"])))
                if not t["ok"]:
                    problems.append(f"{uri} alternate {ln['href']}: the target does not resolve ({t['reason']})")
                elif identity(uri) not in {identity(b["href"]) for b in t["links"] if b["rel"] == "alternate"}:
                    problems.append(f"{uri} alternate {ln['href']}: no alternate back")
                continue
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
            back = {identity(b["href"]): b.get("confidence") for b in t["links"] if b["rel"] == inv}
            # A record names each route that reads it once (TM-18): a page on
            # either site, in either language, is answered by the one link
            # that stands for its route.
            me = ns.reader_uri(identity(uri)) if ln["rel"] == "tm:data" else identity(uri)
            if me not in back:
                problems.append(f"{uri} {ln['rel']} {target}: no {inv} back" + (f" to {me}" if me != identity(uri) else ""))
            elif ln["rel"] in SAME_CONFIDENCE and back[me] != ln.get("confidence"):
                problems.append(f"{uri} {ln['rel']} {target}: {ln.get('confidence')} one way, {back[me]} back")
    print(f"check-tm-links: {reads} URIs read, {len(seen)} resolved or refused")
    unread = [u for u, _ in queue if u not in seen]
    if unread:
        problems.append(f"the budget of {budget} reads ran out with {len(unread)} URIs still queued and unchecked; raise --budget")
    for p in problems[:40]:
        print(f"  {p}")
    if problems:
        print(f"check-tm-links: {len(problems)} problem(s)")
        return 1
    print("check-tm-links: every link resolves, no up names itself, every listing's type holds, every pair has its inverse, every version links back")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=12000)
    ap.add_argument("--repo", type=Path, default=ROOT, help="the checkout to crawl (default: the one this script is in)")
    a = ap.parse_args()
    sys.exit(asyncio.run(crawl(a.budget, a.repo.resolve())))


if __name__ == "__main__":
    main()
