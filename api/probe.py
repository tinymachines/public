"""Reachability, measured.

The registry's rule, applied to the roof: the thing that publishes must not be
the thing that claims. So `/v1/status` does not read a list of services that
somebody wrote down as up. It asks each URL and reports what came back, with
the time it was asked.

Three properties this deliberately has:

  - **A refusal carries its reason.** A probe that got no response reports
    `unreachable` with the client's own words, not `up: false`. "The host is
    answering 502" and "nothing is listening" are different failures and are
    different words here.
  - **It is cached, and it says so.** Every response carries `checked_at` and
    `cache_seconds`, so a stale reading cannot be mistaken for a fresh one.
    Without the cache, reloading a status page would be a way to generate
    traffic against the three live subdomains from anyone who found it.
  - **It is injectable.** `probe_all` takes the prober, so the tests measure
    the logic without going near the network. A test suite that needs the
    internet fails for reasons that have nothing to do with the code.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable, Iterable

import httpx

from models import PieceStatus

# Long enough that a slow TLS handshake is not called dead, short enough that
# a hung host cannot hold a request open. One retry is not attempted: this is
# a smoke test, and a retry would turn one slow host into a slow endpoint.
TIMEOUT_S = 4.0

# A probe result is reused for this long. See the note above on why this is
# not zero.
CACHE_S = 30

Prober = Callable[[str], Awaitable["Probe"]]


class Probe:
    """One raw measurement, before it is joined to a piece."""

    __slots__ = ("status", "latency_ms", "detail")

    def __init__(self, status: int | None, latency_ms: int | None, detail: str | None):
        self.status, self.latency_ms, self.detail = status, latency_ms, detail


async def http_probe(url: str) -> Probe:
    """Ask the URL, and time it. HEAD first, because the body is not wanted and
    some of these pages are large; falling back to GET because a server is
    entitled to refuse HEAD and a 405 is not a health signal."""
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
            r = await client.head(url)
            if r.status_code == 405:
                r = await client.get(url)
        return Probe(r.status_code, int((time.monotonic() - started) * 1000), None)
    except httpx.TimeoutException:
        return Probe(None, None, f"timed out after {TIMEOUT_S}s")
    except httpx.HTTPError as e:
        # The class name carries the useful part: ConnectError, ReadError,
        # ConnectTimeout. str(e) alone is often empty.
        return Probe(None, None, f"{type(e).__name__}: {e}".strip().rstrip(":").strip())


class Cache:
    """Probe results, held for CACHE_S. One process, one dict, no eviction: the
    keyspace is the six piece keys and it does not grow."""

    def __init__(self, ttl: float = CACHE_S):
        self.ttl = ttl
        self._by_key: dict[str, tuple[float, PieceStatus]] = {}
        self._lock = asyncio.Lock()

    def get(self, key: str, now: float) -> PieceStatus | None:
        hit = self._by_key.get(key)
        if hit is None:
            return None
        at, value = hit
        return value if now - at < self.ttl else None

    def put(self, key: str, value: PieceStatus, now: float) -> None:
        self._by_key[key] = (now, value)

    def clear(self) -> None:
        self._by_key.clear()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def probe_all(pieces: Iterable, cache: Cache, prober: Prober = http_probe) -> list[PieceStatus]:
    """Measure every piece, concurrently, using the cache where it is warm.

    Pieces with no public URL are not probed and are not counted as failures.
    They are reported as `not_probed`, because silently omitting them would
    make the totals lie about how many pieces there are.
    """
    pieces = list(pieces)
    mono = time.monotonic()

    results: dict[str, PieceStatus] = {}
    to_probe: list = []

    for p in pieces:
        if p.public_url is None:
            results[p.key] = PieceStatus(
                key=p.key, url=None, reachability="not_probed",
                http_status=None, latency_ms=None, detail=None, checked_at=_now(),
            )
            continue
        cached = cache.get(p.key, mono)
        if cached is not None:
            results[p.key] = cached
        else:
            to_probe.append(p)

    if to_probe:
        raw = await asyncio.gather(*(prober(p.public_url) for p in to_probe))
        for p, probe in zip(to_probe, raw):
            if probe.status is None:
                reach = "unreachable"
            elif probe.status < 400:
                reach = "up"
            else:
                reach = "down"
            status = PieceStatus(
                key=p.key, url=p.public_url, reachability=reach,
                http_status=probe.status, latency_ms=probe.latency_ms,
                detail=probe.detail, checked_at=_now(),
            )
            cache.put(p.key, status, mono)
            results[p.key] = status

    # The pieces' own order, so the response is stable between calls.
    return [results[p.key] for p in pieces]
