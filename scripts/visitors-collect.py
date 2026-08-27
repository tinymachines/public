#!/usr/bin/env python3
"""Who visited: the aggregation behind /api/v1/visitors and /visitors.

Reads the nginx access logs for the apex and the three 6502 subdomains over
a window, counts what a person would call a visit, and writes one JSON
snapshot atomically for the API to serve. A timer runs it
(deploy/tinymachines-visitors.timer). Nothing on any page reports back:
there is no script, no cookie, no beacon. The log is a fact the server
already has, and this measures it rather than adding a tracker to measure
the same thing worse.

The shape is bradley.io's `visitors_collector.py` (2026), the parts of it
that apply here. What it learned the hard way and this inherits:

- Next's <Link> prefetches (`?_rsc=`) are not reads. They made everyone who
  landed on a page look like they toured the site.
- A polled API endpoint is not a read either. A tab left open polling
  twice a minute was the busiest "visitor" on the map.
- A read is a document: not an asset, not /api/, not a prefetch, and only
  a 2xx or 3xx (a 404 is a scanner or a broken link, and those are counted
  separately as what they are).

PRIVACY, and this is the design rather than a setting: no address leaves
this process. A visitor surfaces as a /24 network at most, and only as a
count of distinct networks; the snapshot carries paths, referrers, days,
hours and status codes, and no IP, no user agent, no session list. That
is less than bradley.io publishes (it shows scanners in full) because this
site has no scanner tier of its own: the scanner trap logs to one global
file with no host field, so a count from it would be a claim about the
box, not this site, and this repo does not ship numbers it did not
measure.

What is us rather than a visitor: loopback and the RFC 1918 ranges by
default, plus whatever TM_SELF_NETS names (comma-separated prefixes; set
in the unit's EnvironmentFile, which is host detail and stays out of git).

    python3 scripts/visitors-collect.py                 # to $TM_VISITORS_OUT,
                                                        # else $STATE_DIRECTORY/visitors.json,
                                                        # else ./visitors.json
    TM_VISITORS_LOG_DIR=/path python3 scripts/visitors-collect.py   # tests use this
"""
from __future__ import annotations

import gzip
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

LOG_DIR = os.environ.get("TM_VISITORS_LOG_DIR", "/var/log/nginx")
WINDOW_DAYS = int(os.environ.get("TM_VISITORS_WINDOW_DAYS", "30"))
TOP_N = 40

# One entry per site. The stem is the file nginx writes for that vhost; the
# apex's is the line deploy/tinymachines.ai.nginx adds, and until that line
# is installed the apex source reports `present: false` rather than a zero.
SITES = [
    {"key": "apex", "host": "tinymachines.ai", "stem": "tinymachines.ai.access.log"},
    {"key": "6502", "host": "6502.tinymachines.ai", "stem": "6502.access.log"},
    {"key": "games", "host": "games.tinymachines.ai", "stem": "games.access.log"},
    {"key": "halfwave", "host": "halfwave.tinymachines.ai", "stem": "halfwave.access.log"},
]

SELF_NETS = ["127.", "::1", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
             "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.",
             "172.27.", "172.28.", "172.29.", "172.30.", "172.31."]
SELF_NETS += [p.strip() for p in os.environ.get("TM_SELF_NETS", "").split(",") if p.strip()]

BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|scrap|curl|wget|python-requests|python-urllib|go-http|"
    r"okhttp|java/|libwww|headless|phantomjs|puppeteer|playwright|monitor|uptime|"
    r"pingdom|statuscake|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|dataforseo|"
    r"gptbot|claudebot|anthropic|perplexity|ccbot|applebot|facebookexternalhit|"
    r"embedly|preview|feedfetcher|zgrab|masscan|nmap|censys|expanse|internet-measurement|"
    r"googleother|google-|lighthouse|chrome-privacy|feedburner|apis-google",
    re.I,
)
ASSET_RE = re.compile(r"\.(?:webp|png|jpe?g|svg|ico|css|js|mjs|wasm|bin|gz|woff2?|map|txt|xml|json|webmanifest|chr|rom)(?:$|\?)", re.I)
LINE_RE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\] "(?P<req>[^"]*)" '
    r'(?P<status>\d{3}) (?P<bytes>\S+) "(?P<ref>[^"]*)" "(?P<ua>[^"]*)"'
)


def net24(ip: str) -> str:
    if ":" in ip:
        return ":".join(ip.split(":")[:3]) + "::/48"
    parts = ip.split(".")
    return ".".join(parts[:3]) + ".0/24" if len(parts) == 4 else ip


def is_self(ip: str) -> bool:
    return any(ip.startswith(p) for p in SELF_NETS)


def log_files(stem: str) -> list[str]:
    """The current file plus enough rotations to cover the window, newest first."""
    out = [os.path.join(LOG_DIR, stem)]
    for i in range(1, WINDOW_DAYS + 2):
        for cand in (f"{stem}.{i}", f"{stem}.{i}.gz"):
            p = os.path.join(LOG_DIR, cand)
            if os.path.exists(p):
                out.append(p)
    return out


def read_lines(path: str):
    op = gzip.open if path.endswith(".gz") else open
    try:
        with op(path, "rt", errors="replace") as fh:
            yield from fh
    except OSError as e:
        print(f"skip {path}: {e}", file=sys.stderr)


def parse_ts(s: str):
    try:
        return datetime.strptime(s, "%d/%b/%Y:%H:%M:%S %z")
    except ValueError:
        return None


def scan(stem: str, cutoff: datetime, on_row) -> dict:
    """Walk one log family newest-first; stop once a whole file predates the window."""
    rows = files = 0
    present = os.path.exists(os.path.join(LOG_DIR, stem))
    for path in log_files(stem):
        if not os.path.exists(path):
            continue
        newest = None
        for line in read_lines(path):
            m = LINE_RE.match(line)
            if not m:
                continue
            ts = parse_ts(m.group("ts"))
            if ts is None:
                continue
            if newest is None or ts > newest:
                newest = ts
            if ts < cutoff:
                continue
            on_row(m, ts)
            rows += 1
        files += 1
        if newest is not None and newest < cutoff:
            break
    return {"stem": stem, "present": present, "rows": rows, "files": files}


def collect_site(site: dict, cutoff: datetime) -> dict:
    reads = bots = selfs = prefetches = redirects = errors = 0
    nets: set[str] = set()
    day = defaultdict(lambda: {"reads": 0, "bots": 0})
    hour = [0] * 24
    paths: dict[str, int] = defaultdict(int)
    refs: dict[str, int] = defaultdict(int)
    statuses: dict[str, int] = defaultdict(int)
    langs = {"en": 0, "ja": 0}

    def on_row(m, ts):
        nonlocal reads, bots, selfs, prefetches, redirects, errors
        ip, ua = m.group("ip"), m.group("ua")
        if is_self(ip):
            selfs += 1
            return
        d = ts.astimezone(timezone.utc).strftime("%Y-%m-%d")
        if BOT_RE.search(ua) or ua in ("-", ""):
            bots += 1
            day[d]["bots"] += 1
            return
        req = m.group("req").split(" ")
        path = req[1] if len(req) > 1 else "-"
        status = m.group("status")
        statuses[status] += 1
        if status.startswith("3"):
            redirects += 1
        if status.startswith(("4", "5")):
            errors += 1
            return
        prefetch = "_rsc=" in path
        if prefetch:
            prefetches += 1
            return
        bare = path.split("?")[0]
        api = bare == "/api" or bare.startswith("/api/") or "/api/" in bare or bare.endswith("/api")
        if ASSET_RE.search(bare) or api:
            return
        reads += 1
        day[d]["reads"] += 1
        hour[ts.astimezone(timezone.utc).hour] += 1
        nets.add(net24(ip))
        paths[bare[:120]] += 1
        langs["ja" if bare == "/ja" or bare.startswith("/ja/") else "en"] += 1
        ref = m.group("ref")
        if ref and ref != "-" and "tinymachines.ai" not in ref:
            refs[ref[:160]] += 1

    source = scan(site["stem"], cutoff, on_row)
    days = sorted(day)
    return {
        "key": site["key"],
        "host": site["host"],
        "source": source,
        "reads": reads,
        "bot_hits": bots,
        "self_hits": selfs,
        "prefetches": prefetches,
        "redirects": redirects,
        "errors": errors,
        "unique_nets": len(nets),
        "by_lang": langs,
        "by_day": [{"d": d, **day[d]} for d in days],
        "by_hour_utc": hour,
        "top_paths": sorted(({"path": p, "hits": n} for p, n in paths.items()), key=lambda x: -x["hits"])[:TOP_N],
        "referrers": sorted(({"ref": r, "hits": n} for r, n in refs.items()), key=lambda x: -x["hits"])[:20],
        "statuses": dict(sorted(statuses.items())),
    }


def out_path() -> str:
    explicit = os.environ.get("TM_VISITORS_OUT")
    if explicit:
        return explicit
    state = os.environ.get("STATE_DIRECTORY")
    if state:
        return os.path.join(state.split(":")[0], "visitors.json")
    return "visitors.json"


def main() -> int:
    t0 = time.time()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=WINDOW_DAYS)
    sites = [collect_site(s, cutoff) for s in SITES]
    snap = {
        "generated": now.isoformat(timespec="seconds"),
        "window_days": WINDOW_DAYS,
        "took_ms": 0,
        "privacy": "Visitors are counted as distinct /24 networks and never listed. No address, "
                   "user agent or session leaves the collector; the snapshot carries paths, "
                   "referrers, days, hours and status codes.",
        "self_nets": len(SELF_NETS),
        "sites": sites,
        "totals": {
            "reads": sum(s["reads"] for s in sites),
            "bot_hits": sum(s["bot_hits"] for s in sites),
            "unique_nets": sum(s["unique_nets"] for s in sites),
            "sources_present": sum(1 for s in sites if s["source"]["present"]),
        },
    }
    snap["took_ms"] = round((time.time() - t0) * 1000)
    out = out_path()
    tmp = out + ".tmp"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(tmp, "w") as fh:
        json.dump(snap, fh, separators=(",", ":"))
    os.replace(tmp, out)
    print(f"visitors: {snap['totals']['reads']} reads on {snap['totals']['sources_present']} of {len(SITES)} logs "
          f"over {WINDOW_DAYS} days, {snap['took_ms']} ms, wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
