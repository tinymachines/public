#!/usr/bin/env python3
"""Every var() in the kit must name a token that exists.

This is the check for a trap the 6502 work already paid for: a `var()` naming
a custom property that was never defined does not error, does not warn, and
does not fall back. The whole declaration is dropped, and the symptom is
"slightly wrong" rather than anything a build would catch. One typo in a token
name is a component that quietly loses its border.

Run it:

    python3 style/check-tokens.py

It reads tokens.css for what is defined and components.css for what is used,
and exits non-zero naming every miss. It deliberately also fails when it finds
nothing to check, because a check that can pass on nothing is not a check.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Properties that come from somewhere other than tokens.css and are therefore
# not misses. Each one needs a reason, or this list becomes the place failures
# go to be silenced.
EXTERNAL = {
    # Bound by next/font in web/app/layout.tsx, which emits them on <html>.
    # tokens.css declares these too; listed here so the check still passes if
    # the owner ever moves the declaration out to the font loader.
    "--font-display",
    "--font-sans",
    "--font-mono",
    "--font-serif",

    # Measured by web/app/components/AppMetrics.tsx and written onto the
    # document element: the heights of the two sticky bands. They are not
    # palette, they are geometry the browser owns, and they cannot be in
    # tokens.css because the number changes with the viewport. Every var()
    # reading them carries a fallback, so a page is correct before the script
    # runs and correct if it never does.
    "--app-head-h",
    "--app-foot-h",

    # Measured by the strip itself (web/app/[lang]/6502/explorer/
    # ChipTransport.tsx) the same way: the floor strip's height, so the
    # console shell's stage and the schematic's study view can stop above
    # it. Falls back in every var() that reads it.
    "--strip-h",

    # Set inline by the shell per cartridge: the accent a loaded cartridge
    # gives the shell, and the label colour of one cart on the shelf. Each
    # is a var() of a real token (--color-accent, --color-ocean, ...), so
    # the palette is still the only source; the name is the indirection.
    "--shell-accent",
    "--cart",
}

DEFINE = re.compile(r"^\s*(--[A-Za-z0-9-]+)\s*:", re.MULTILINE)
USE = re.compile(r"var\(\s*(--[A-Za-z0-9-]+)")


def defined_in(path: Path) -> set[str]:
    return set(DEFINE.findall(path.read_text()))


def used_in(path: Path) -> dict[str, list[int]]:
    where: dict[str, list[int]] = {}
    for n, line in enumerate(path.read_text().splitlines(), 1):
        for name in USE.findall(line):
            where.setdefault(name, []).append(n)
    return where


def main() -> int:
    tokens = HERE / "tokens.css"
    # Everything in the kit that can reference a token. tokens.css is included
    # because a token may be defined in terms of another one.
    # The kit, plus every surface-local stylesheet under web/app. A surface may
    # carry its own components (Die Runner's .gate and .pad are not the design
    # system's), and those are exactly as able to name a token that does not
    # exist. Globbed rather than listed, so the next surface to arrive is
    # covered by arriving rather than by somebody remembering this file.
    consumers = [HERE / "components.css", HERE / "tokens.css", HERE / "zoo.html"]
    consumers += sorted((HERE.parent / "web" / "app").rglob("*.css"))
    consumers += sorted((HERE / "projects").glob("*.css"))

    defined = defined_in(tokens) | EXTERNAL
    if len(defined) < 20:
        print(f"check-tokens: only {len(defined)} tokens found in {tokens.name}; "
              "that is not a token file, so this check would pass on nothing")
        return 2

    bad = 0
    checked = 0
    for path in consumers:
        if not path.exists():
            print(f"check-tokens: {path.name} is missing")
            return 2
        uses = used_in(path)
        # zoo.html declares its own standalone copy of the tokens, so what it
        # defines counts as defined for its own file.
        local = defined | defined_in(path)
        checked += sum(len(v) for v in uses.values())
        for name, lines in sorted(uses.items()):
            if name not in local:
                bad += 1
                at = ", ".join(str(n) for n in lines[:6])
                print(f"{path.name}:{at}: var({name}) names no token")

    if checked < 100:
        print(f"check-tokens: only {checked} var() uses found; expected the kit "
              "to be far denser than that, so this check would pass on nothing")
        return 2

    if bad:
        print(f"\ncheck-tokens: {bad} undefined token(s) across {checked} uses")
        return 1

    print(f"check-tokens: {checked} var() uses, all defined")
    return 0


if __name__ == "__main__":
    sys.exit(main())
