#!/usr/bin/env python3
"""Re-derive chip.json from the service that publishes it.

The rule this implements: the thing that publishes must not be the thing that
claims. chip.json holds two figures the front page prints, and they are the
6502 API's numbers rather than ours, so this asks that API and compares.

    python3 data/verify-chip.py

Deliberately NOT part of the build. The build reaches no network on purpose
(see style/fonts/README.md for the other half of that decision), and a check
that needs the internet fails for reasons unrelated to the code and then gets
ignored. Run this when the figures are worth re-checking, or after the engine
changes.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHIP = HERE / "chip.json"
FIELDS = ("nodes", "transistors")


def verify_atlas(recorded: dict) -> int:
    """The atlas figures come from a different endpoint and one of them is a
    derivation rather than a field, so it is re-derived rather than read.

    The derivation is the whole point: the partition covers 1547 of the die's
    1725 nodes, and summing over leaf groups instead gives 1443. A figure like
    that is worth re-computing rather than trusting, because the number alone
    does not say which sum produced it."""
    url = recorded["atlas_measured_from"]
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            live = json.load(r)
    except Exception as e:  # noqa: BLE001
        print(f"verify-chip: could not reach {url}: {e}")
        return 0

    bad = 0
    groups = live.get("groups") or []
    if live.get("count") != recorded["atlas_partition_groups"]:
        print(f"verify-chip: atlas_partition_groups is {live.get('count')} live, "
              f"{recorded['atlas_partition_groups']} in chip.json.")
        bad += 1
    else:
        print(f"  {'groups':<12} {live['count']}  agrees")

    total = sum(g.get("count", 0) for g in groups)
    if total != recorded["atlas_partition_nodes"]:
        print(f"verify-chip: atlas_partition_nodes derives to {total} live, "
              f"{recorded['atlas_partition_nodes']} in chip.json.")
        bad += 1
    else:
        print(f"  {'atlas nodes':<12} {total}  agrees (sum of count over all groups)")
    return bad


def main() -> int:
    recorded = json.loads(CHIP.read_text())
    url = recorded["measured_from"]
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            live = json.load(r)
    except Exception as e:  # noqa: BLE001
        print(f"verify-chip: could not reach {url}: {e}")
        print("Nothing is asserted. This check needs the network and says so.")
        return 2

    bad = 0
    bad += verify_atlas(recorded)
    for field in FIELDS:
        if field not in live:
            print(f"verify-chip: {url} no longer reports {field!r}.")
            bad += 1
            continue
        if live[field] != recorded[field]:
            print(f"verify-chip: {field} is {live[field]} live, {recorded[field]} in chip.json.")
            bad += 1
        else:
            print(f"  {field:<12} {live[field]}  agrees")

    if bad:
        print(f"\nverify-chip: {bad} figure(s) disagree. Update chip.json and "
              "measured_on, and check anything that quotes them.")
        return 1
    print(f"verify-chip: chip.json agrees with {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
