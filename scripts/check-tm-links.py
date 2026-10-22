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
  - no read carries more links than the cap, and a read that says the rest
    is behind ?as=links is walked page by page: every link once, as many as
    it said, the inline ones among them (tinypeek#2). The inverse checks
    below run on the whole set, so a link on a later page still counts;
  - a link that carries a count is answered by the same count (tinypeek#3);
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
    went unnoticed);
  - every read carries a media type that says what it is (tinypeek#23): a
    vendor type whose kind the namespace's vocabulary knows, or a file's own
    type, and never bare application/json; every link that carries its
    target's type (RFC 8288 `type`) is followed and the target reads as that
    type, and at least one did, since a check that can pass on nothing is
    not a check; and when the walk is done the kind registry at kinds/ lists
    every kind the walk was served, each reading with a count.

Git mounts are walked by their links and two levels of listing, not file by
file: nine repositories' every file would be most of the budget and prove
little the mount's tests do not.

A budget that runs out is a failure, not a pass: whatever was still queued
was not checked. --repo crawls another checkout with this one's code, which
is how a change is crawled against the box's build before it is deployed.
"""
import argparse, asyncio, json, sys
from collections import deque
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import tm  # noqa: E402

PAIRS = {"tm:source": "tm:renders-as", "tm:renders-as": "tm:source", "tm:generates": "tm:generated-by",
         "tm:generated-by": "tm:generates", "tm:working-copy": "tm:repository", "tm:repository": "tm:working-copy",
         "tm:data": "tm:read-by", "tm:read-by": "tm:data", "tm:input": "tm:input-of", "tm:input-of": "tm:input",
         "tm:step": "tm:step-of", "tm:step-of": "tm:step"}
# The entity mount's pairs (TM-16).
ENTITY_PAIRS = {"tm:found-in": "tm:exhibits", "tm:instance": "tm:instance-of", "tm:demonstrated-by": "tm:demonstrates",
                "tm:measures": "tm:measured-by", "tm:cartridge": "tm:cartridge-of"}
PAIRS.update(ENTITY_PAIRS)
PAIRS.update({v: k for k, v in ENTITY_PAIRS.items()})
# The mcp mount's pair (tinypeek#22): a tool and the server that lists it.
# tm:schema is unpaired: it names a piece of the tool itself.
MCP_PAIRS = {"tm:served-by": "tm:serves"}
PAIRS.update(MCP_PAIRS)
PAIRS.update({v: k for k, v in MCP_PAIRS.items()})
# Pairs whose two ends must agree on how sure they are.
SAME_CONFIDENCE = {"tm:data", "tm:read-by", "tm:step", "tm:step-of"} | set(ENTITY_PAIRS) | set(ENTITY_PAIRS.values()) | set(MCP_PAIRS) | set(MCP_PAIRS.values())


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
    if urlsplit(uri).path.endswith("/") or uri in (tm.ROOT, tm.TOP):
        return uri
    return uri + ("&" if "?" in uri else "?") + "as=stat"


def git_depth(uri: str) -> int | None:
    parts = urlsplit(uri).path.strip("/").split("/")
    return len(parts) - 2 if parts and parts[0] == "git" else None


async def crawl(budget: int, repo: Path = ROOT, ns=None) -> int:
    ns = ns or tm.Namespace(repo)
    seen: dict[str, dict] = {}
    problems: list[str] = []
    queue = deque([(tm.TOP, None)])
    claimed: dict[str, str] = {}

    async def whole(uri: str, inline: list) -> list:
        """A read over the cap carries its first page and a tm:links to the
        rest (tinypeek#2). Walk the pages, so an inverse on a later one is
        still seen, and hold the walk to what it promises: no read over the
        cap, every inline link in it, no link twice, as many as it said."""
        more = [ln for ln in inline if ln["rel"] == "tm:links"]
        if not more:
            return inline
        out, at, total, pages = [], more[0]["href"], None, 0
        while at and pages < 500:
            r = await ns.read(at)
            pages += 1
            page = r["_meta"][tm.META_LINKS]
            if len(page) > tm.LINK_CAP:
                problems.append(f"{at}: {len(page)} links in one read, over the cap of {tm.LINK_CAP}")
            total = json.loads(r["contents"][0]["text"])["total"]
            out += [ln for ln in page if ln["rel"] != "next"]
            nxt = [ln["href"] for ln in page if ln["rel"] == "next"]
            at = nxt[0] if nxt else None
        keys = [json.dumps(ln, sort_keys=True) for ln in out]
        if len(out) != total or more[0].get("count") != total:
            problems.append(f"{uri}: walked {len(out)} links behind ?as=links, which said {total} (and the read itself said {more[0].get('count')})")
        if len(set(keys)) != len(keys):
            problems.append(f"{uri}: a link comes twice behind ?as=links")
        # A stat's own pointer back at the thing it describes is not one of
        # the thing's links, and is not behind ?as=links.
        back = lambda ln: ln["rel"] == "alternate" and ln["href"] == identity(uri)
        missing = [ln for ln in inline if ln["rel"] != "tm:links" and not back(ln) and json.dumps(ln, sort_keys=True) not in set(keys)]
        if missing:
            problems.append(f"{uri}: {len(missing)} inline link(s) are not behind ?as=links, first {missing[0]['rel']} {missing[0]['href']}")
        return out

    async def get(uri: str):
        if uri not in seen:
            try:
                r = await ns.read(uri)
                links = r["_meta"][tm.META_LINKS]
                if len(links) > tm.LINK_CAP:
                    problems.append(f"{uri}: {len(links)} links in one read, over the cap of {tm.LINK_CAP}")
                seen[uri] = {"ok": True, "links": await whole(uri, links), "content": r["contents"][0]}
                # tinypeek#23: the type says what the thing is, in words the vocabulary knows.
                mime = r["contents"][0].get("mimeType") or ""
                if mime == "application/json":
                    problems.append(f"{uri}: reads as bare application/json; a thing the server composes says its kind")
                elif tm.kind_of(mime) != "file" and tm.kind_of(mime) not in tm.KINDS:
                    problems.append(f"{uri}: reads as {mime}, a kind the vocabulary does not know")
                kinds_served.add(tm.kind_of(mime))
            except tm.TmError as e:
                seen[uri] = {"ok": False, "reason": e.reason}
        return seen[uri]

    async def reads_as(href: str) -> str | None:
        """What following a link comes back as: a facet or a piece read as
        given; a leaf by its stat, which names the thing's type; a collection
        as itself."""
        keys = {q.split("=")[0] for q in urlsplit(href).query.split("&") if q}
        if keys & {"as", "pointer", "lines", "range"}:
            got = await get(href)
            return got["content"].get("mimeType") if got["ok"] else None
        got = await get(stat_of(href))
        if not got["ok"]:
            return None
        mime = got["content"].get("mimeType")
        if mime == tm.T_STAT:
            return json.loads(got["content"]["text"]).get("mimeType")
        return mime

    kinds_served: set[str] = set()
    typed = 0
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
            st = json.loads(got["content"]["text"]) if got["content"].get("text", "").startswith("{") else {}
            mime = st.get("mimeType") or (st.get("contentType", "").split(";")[0].strip() or None)
            if claimed[uri] != mime:
                problems.append(f"{uri}: listed as {claimed[uri]}, read as {mime}")
        text = got["content"].get("text") or ""
        if uri.endswith("/") and tm.is_json(got["content"].get("mimeType") or "") and text.startswith("{"):
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
            # tinypeek#16: a link to a piece of a thing (?pointer=, ?lines=)
            # is read as given, not only as the thing: the piece must be there.
            if any(q.split("=")[0] in ("pointer", "lines", "range") for q in urlsplit(href).query.split("&")):
                piece = await get(href)
                if not piece["ok"]:
                    problems.append(f"{uri} {ln['rel']} {href}: the piece does not read ({piece['reason']})")
    # Inverses, over every page and file reached; and every type a link claims.
    for uri, got in list(seen.items()):
        if not got.get("ok"):
            continue
        for ln in got["links"]:
            if "type" in ln and "{" not in ln["href"] and not any(f"as={a}" in ln["href"] for a in ("rendered", "log", "blame")):
                # A target that does not resolve is the resolution rule's
                # finding, above; here only what reads is held to its type.
                # A facet's type is the facet's by construction, and the three
                # that cost a fetch or a git process each (a page's HTML, a
                # log, a blame) are not read a second time for it: that
                # doubled the walk's time when they were.
                actual = await reads_as(ln["href"])
                if actual is not None:
                    typed += 1
                    if actual != ln["type"]:
                        problems.append(f"{uri} {ln['rel']} {ln['href']}: the link says {ln['type']}, the target reads as {actual}")
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
            counts = {identity(b["href"]): b.get("count") for b in t["links"] if b["rel"] == inv}
            # A record names each route that reads it once (TM-18): a page on
            # either site, in either language, is answered by the one link
            # that stands for its route.
            me = ns.reader_uri(identity(uri)) if ln["rel"] == "tm:data" else identity(uri)
            if me not in back:
                problems.append(f"{uri} {ln['rel']} {target}: no {inv} back" + (f" to {me}" if me != identity(uri) else ""))
            elif "count" in ln and counts.get(me) != ln["count"]:
                problems.append(f"{uri} {ln['rel']} {target}: count {ln['count']} one way, {counts.get(me)} back")
            elif ln["rel"] in SAME_CONFIDENCE and back[me] != ln.get("confidence"):
                problems.append(f"{uri} {ln['rel']} {target}: {ln.get('confidence')} one way, {back[me]} back")
    if typed == 0:
        problems.append("no link carried its target's type, so none was checked (tinypeek#23)")
    # tinypeek#23: the registry lists what the walk was served, and each kind reads.
    try:
        reg = json.loads((await ns.read(f"{tm.ROOT}kinds/"))["contents"][0]["text"])
        listed = {c["name"] for c in reg.get("children", [])}
        for kind in sorted(kinds_served - listed):
            problems.append(f"kinds/: {kind} was served during the walk and is not listed")
        for kind in sorted(listed):
            entry = json.loads((await ns.read(f"{tm.ROOT}kinds/{kind}"))["contents"][0]["text"])
            if entry.get("served", 0) < 1 or not entry.get("mediaTypes"):
                problems.append(f"kinds/{kind}: listed with no count or no media type")
    except tm.TmError as e:
        problems.append(f"kinds/: the registry does not read ({e.reason})")
    print(f"check-tm-links: {reads} URIs read, {len(seen)} resolved or refused, {typed} typed links followed, {len(kinds_served)} kinds served")
    unread = [u for u, _ in queue if u not in seen]
    if unread:
        problems.append(f"the budget of {budget} reads ran out with {len(unread)} URIs still queued and unchecked; raise --budget")
    for p in problems[:40]:
        print(f"  {p}")
    if problems:
        print(f"check-tm-links: {len(problems)} problem(s)")
        return 1
    print("check-tm-links: every link resolves, no up names itself, every listing's type holds, every typed link reads as it says, every pair has its inverse, every version links back, the registry lists every kind served")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=12000)
    ap.add_argument("--repo", type=Path, default=ROOT, help="the checkout to crawl (default: the one this script is in)")
    a = ap.parse_args()
    sys.exit(asyncio.run(crawl(a.budget, a.repo.resolve())))


if __name__ == "__main__":
    main()
