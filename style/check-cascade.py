#!/usr/bin/env python3
"""A media query override that a later rule defeats is not an override.

This check exists because the same mistake shipped twice in this file, and
both times it was invisible:

  - `.masthead h1` was given a smaller size inside a narrow media query, and a
    later unconditional rule set it back. The heading overflowed at 390px and
    the whole page scrolled sideways.
  - `.docs-nav` was set to position: static inside a narrow media query, and a
    later unconditional rule set it back to sticky. Below 60rem the shell is
    one column, so a transparent sticky nav sat on top of the prose scrolling
    under it: two sets of words in the same place, on every phone.

CSS has no error for this. Equal specificity, later wins, and the rule that
loses looks exactly like a rule that works. The fix in both cases was to move
the override below the declaration it overrides, so this fails when a media
query sets a property on a selector that a LATER unconditional rule with the
same selector also sets.

    python3 style/check-cascade.py

It is deliberately narrow: same selector text, same property. Anything cleverer
would need real specificity arithmetic and would start guessing.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGETS = ["components.css", "tokens.css"]


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def rules(css: str):
    """Yield (selector, property, position, in_media) for every declaration.

    A hand-rolled scan rather than a parser, because the only structure that
    matters here is nesting depth and the file is plain CSS with no nesting of
    its own.
    """
    i, depth, media_depth = 0, 0, None
    buf = ""
    stack = []
    while i < len(css):
        c = css[i]
        if c == "{":
            head = buf.strip()
            buf = ""
            depth += 1
            if head.startswith("@media"):
                if media_depth is None:
                    media_depth = depth
                stack.append(None)
            else:
                stack.append((head, i))
            i += 1
            continue
        if c == "}":
            top = stack.pop() if stack else None
            if top is not None:
                sel, start = top
                body = css[start + 1 : i]
                for prop in re.findall(r"([a-zA-Z-]+)\s*:", body):
                    yield sel, prop.strip(), start, media_depth is not None
            depth -= 1
            if media_depth is not None and depth < media_depth:
                media_depth = None
            # Clearing buf here is load-bearing. Without it the declaration
            # body just consumed stays in the buffer and prefixes the NEXT
            # selector, so "@media (...)" arrived as
            # "color: red ... @media (...)" and never matched startswith.
            # The result was zero media-scoped declarations and a check that
            # passed on everything.
            buf = ""
            i += 1
            continue
        buf += c
        i += 1


def main() -> int:
    problems = 0
    checked = 0
    media_seen = 0
    for name in TARGETS:
        path = HERE / name
        css = strip_comments(path.read_text())
        decls = list(rules(css))
        checked += len(decls)

        in_media = [(s, p, pos) for s, p, pos, m in decls if m]
        media_seen += len(in_media)
        plain = [(s, p, pos) for s, p, pos, m in decls if not m]

        for sel, prop, pos in in_media:
            later = [q for s2, p2, q in plain if s2 == sel and p2 == prop and q > pos]
            if later:
                line = css[: pos].count("\n") + 1
                after = css[: later[0]].count("\n") + 1
                print(f"{name}:{line}: `{sel} {{ {prop} }}` inside a media query is "
                      f"defeated by the same rule at line {after}.")
                print("    Equal specificity, later wins. Move the override below it.")
                problems += 1

    if checked < 200:
        print(f"check-cascade: only {checked} declarations parsed; this check "
              "would pass on nothing.")
        return 2
    # The count that actually matters. The first version of this parser found
    # 917 declarations and ZERO inside a media query, so every comparison had
    # an empty left-hand side and the check could not fail. Counting the total
    # was not enough of a guard, because the total was fine.
    if media_seen < 5:
        print(f"check-cascade: only {media_seen} declarations found inside a "
              "media query. This file has several, so the scan is wrong and "
              "this check would pass on nothing.")
        return 2
    if problems:
        print(f"\ncheck-cascade: {problems} defeated override(s) across {checked} declarations")
        return 1
    print(f"check-cascade: {checked} declarations, no defeated overrides")
    return 0


if __name__ == "__main__":
    sys.exit(main())
