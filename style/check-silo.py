#!/usr/bin/env python3
"""A project silo may change identity. It may not change meaning, or legibility.

Projects are siloed visually by scoping token overrides to `[data-project=...]`
rather than by forking the kit. One set of components, one type scale, one
spacing rhythm; what changes per project is the part that says *which project
this is*.

That only works if the line between identity and meaning is enforced, because
the two look identical in a CSS file. `--color-burnt` is identity: it assigns
a hue to a region and a project may have its own. `--color-red` is not. It
means ASSERTION FAILED, and tokens.css says so in as many words: "Not
categorical. State only, and each one has exactly one meaning." A project that
redefines red has not been given its own accent, it has made a failed
assertion look different depending on which page you are on.

So this fails when:

  1. a silo assigns a token outside the identity set below
  2. a silo introduces a token name the kit does not define, which is a token
     the style guide can never reach and a var() nothing will resolve
  3. a silo produces a text pair that drops below WCAG AA, computed rather
     than eyeballed, against the palette it would actually render with

    python3 style/check-silo.py
    python3 style/check-silo.py --self-test

**--self-test is not optional decoration.** Every silo that exists today
overrides nothing, on purpose: 6502 is the ground the palette was sampled for,
and hotbits has not been designed. So the three checks above have nothing to
bite on, and a check that can pass on nothing is not a check. The self test
feeds the checker three synthetic silos that each break one rule and requires
it to reject all three. `--self-test` runs as part of a normal run; the flag
runs it alone and prints what it caught.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOKENS = HERE / "tokens.css"
SILOS = HERE / "projects"

# --------------------------------------------------------------------------
# What a project owns, and what it does not. Every line here is traceable to a
# sentence in tokens.css; none of it is a preference.
# --------------------------------------------------------------------------

IDENTITY = {
    # "THE EARTH CONDUCTOR. Categorical. Assigns identity to a region, a bus,
    # a signal class." Categorical is exactly what a project silo is for.
    "--color-burnt", "--color-burnt-ink",
    "--color-mustard", "--color-mustard-ink",
    "--color-forest", "--color-forest-ink",
    "--color-ocean", "--color-ocean-ink",
    # The accent knob: the one pair a section turns to get its colour. It is
    # identity by definition, and it is contrast-checked below like the rest.
    "--color-accent", "--color-accent-ink",

    # The two grounds. Semantically fixed (paper is documentation, panel is the
    # machine talking) but their VALUES are identity, and warming or cooling a
    # ground is the loudest silo available without touching a component.
    # Allowed, and contrast-checked below, because a ground is also the fastest
    # way to make a page illegible.
    "--color-paper", "--color-paper-sunk",
    "--color-panel", "--color-panel-raised", "--color-panel-sunk",
    "--color-ink", "--color-ink-muted", "--color-ink-faint",
    "--color-glass", "--color-glass-muted",

    # tokens.css: "--font-display is the swap seam: change this one line to
    # drop in a licensed display face without touching a component." The other
    # three are one superfamily on purpose, so a doc page carrying prose, a
    # table and a register dump stays coherent. Those do not swap.
    "--font-display",
}

# Why each excluded group is excluded, so this list is arguable rather than
# arbitrary. Printed in the failure message.
WHY_NOT = {
    "--color-blue": "ACTIVE / driven high. State, not identity.",
    "--color-orange": "ATTENTION / needs a human. State, not identity.",
    "--color-red": "ASSERTION FAILED. Nothing else, on any project.",
    "--color-drive": "halfphi's Drive enum given colour, in resolution order. "
                     "Per-project drive colours means the same chip state drawn two ways.",
    "--color-chrome": "Bezel material: two gradients and four flats, and that is the whole set.",
    "--bezel": "Bezel material.",
    "--color-rule": "Hairlines are ink, never grey, and never a project's own.",
    "--font-sans": "One superfamily keeps a page coherent. Only display swaps.",
    "--font-mono": "One superfamily keeps a page coherent. Only display swaps.",
    "--font-serif": "One superfamily keeps a page coherent. Only display swaps.",
    "--u": "The grid unit. A project that does not line up with the kit is a fork.",
    "--text": "The type scale is the system's rhythm.",
    "--tracking": "The type scale is the system's rhythm.",
    "--leading": "The type scale is the system's rhythm.",
    "--t-": "Motion is TAC-MOTION and it is the same machine everywhere.",
    "--ease": "Motion is TAC-MOTION and it is the same machine everywhere.",
    "--shadow": "Two shadows. A third would be someone inventing a level.",
    "--radius": "Two radii, and which ground you are on decides which.",
}

# Text pairs that have to stay legible whatever a silo does to the grounds.
# (foreground token, background token, minimum ratio, what it is)
PAIRS = [
    ("--color-ink",         "--color-paper", 4.5, "body text on paper"),
    ("--color-ink-muted",   "--color-paper", 4.5, "muted text on paper"),
    ("--color-glass",       "--color-panel", 4.5, "text on panel"),
    ("--color-glass-muted", "--color-panel", 4.5, "muted text on panel"),
    ("--color-ink",         "--color-paper-sunk", 4.5, "body text in a well"),
    ("--color-burnt-ink",   "--color-paper", 4.5, "Burnt Silicon on paper"),
    ("--color-mustard-ink", "--color-paper", 4.5, "Mustard on paper"),
    ("--color-forest-ink",  "--color-paper", 4.5, "Forest on paper"),
    ("--color-ocean-ink",   "--color-paper", 4.5, "Ocean on paper"),
    ("--color-burnt",       "--color-panel", 4.5, "Burnt Silicon on panel"),
    ("--color-mustard",     "--color-panel", 4.5, "Mustard on panel"),
    ("--color-forest",      "--color-panel", 4.5, "Forest on panel"),
    ("--color-ocean",       "--color-panel", 4.5, "Ocean on panel"),
    ("--color-accent-ink",  "--color-paper", 4.5, "the accent on paper"),
    ("--color-accent",      "--color-panel", 4.5, "the accent on panel"),
]

DECL = re.compile(r"(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+);")


# --------------------------------------------------------------------------
# Contrast, computed. tokens.css says every ratio in its comments was computed
# rather than estimated; this is the same arithmetic, run on whatever a silo
# leaves behind.
# --------------------------------------------------------------------------

def rgb(value: str):
    v = value.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", v)
    if not m:
        return None                      # not a flat colour: gradients, var(), keywords
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminance(c) -> float:
    def chan(n: int) -> float:
        s = n / 255
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (chan(x) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg) -> float:
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


# --------------------------------------------------------------------------

def base_tokens() -> dict[str, str]:
    src = TOKENS.read_text()
    body = re.search(r"@theme\s+static\s*\{(.*)\n\}", src, re.S)
    if not body:
        sys.exit("check-silo: no `@theme static {}` block in tokens.css")
    text = re.sub(r"/\*.*?\*/", "", body.group(1), flags=re.S)
    return {k: " ".join(v.split()) for k, v in DECL.findall(text)}


def excluded_reason(token: str) -> str:
    for prefix, why in WHY_NOT.items():
        if token.startswith(prefix):
            return why
    return "not in the identity set."


def check_silo(name: str, css: str, base: dict[str, str]) -> list[str]:
    """Every problem with one silo. Empty list means it is fine."""
    bad: list[str] = []

    # Strip comments so a token named in prose is not read as an assignment.
    text = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    assigned = {k: " ".join(v.split()) for k, v in DECL.findall(text)}

    for token in sorted(assigned):
        if token not in base:
            bad.append(
                f"{name}: --{token.lstrip('-')} is not a token tokens.css defines.\n"
                f"    A silo overrides the palette; it cannot extend it. A var() naming "
                f"this resolves to nothing and the whole declaration is dropped, silently."
            )
        elif token not in IDENTITY:
            bad.append(
                f"{name}: {token} may not be siloed.\n"
                f"    {excluded_reason(token)}\n"
                f"    A silo changes which project this is. It does not change what a colour means."
            )

    # Contrast, against the palette this silo would actually render with.
    resolved = {**base, **assigned}
    for fg_t, bg_t, floor, what in PAIRS:
        fg, bg = rgb(resolved.get(fg_t, "")), rgb(resolved.get(bg_t, ""))
        if fg is None or bg is None:
            continue                     # not a flat colour; nothing to compute
        r = ratio(fg, bg)
        if r < floor:
            bad.append(
                f"{name}: {what} is {r:.1f}:1, below {floor}:1.\n"
                f"    {fg_t} {resolved[fg_t]} on {bg_t} {resolved[bg_t]}.\n"
                f"    Computed, not estimated, the same way tokens.css computed the ones in its comments."
            )
    return bad


SELF_TEST = [
    ("changes what a colour means",
     '[data-project="x"] { --color-red: #22aa55; }'),
    ("invents a token the kit cannot reach",
     '[data-project="x"] { --color-hotbits-pink: #ff00aa; }'),
    ("makes body text illegible",
     '[data-project="x"] { --color-paper: #16150F; }'),
]


def self_test(base: dict[str, str]) -> list[str]:
    """Three silos that each break one rule. All three must be caught.

    Without this the checker asserts nothing: every silo shipped today
    overrides no tokens at all, so the rules have nothing to bite on and a
    green run would mean only that the directory was read.
    """
    missed = []
    for label, css in SELF_TEST:
        if not check_silo("self-test", css, base):
            missed.append(f"self-test: a silo that {label} was NOT caught.")
    return missed


def main() -> int:
    only_self = "--self-test" in sys.argv
    base = base_tokens()
    if not base:
        sys.exit("check-silo: tokens.css parsed to no declarations")

    problems = self_test(base)
    if only_self:
        for p in problems:
            print(p, file=sys.stderr)
        if problems:
            return 1
        print(f"check-silo self-test: {len(SELF_TEST)} deliberate violations, all caught")
        return 0

    if not SILOS.is_dir():
        sys.exit(f"check-silo: no {SILOS}. Every project needs a silo file, even an empty one.")
    files = sorted(SILOS.glob("*.css"))
    if not files:
        sys.exit(f"check-silo: no silo files in {SILOS}; this check would pass on nothing")

    for f in files:
        problems += check_silo(f"style/projects/{f.name}", f.read_text(), base)

    if problems:
        print(f"\ncheck-silo: {len(problems)} problem(s):\n", file=sys.stderr)
        for p in problems:
            print("  " + p + "\n", file=sys.stderr)
        return 1

    overrides = sum(
        len(DECL.findall(re.sub(r"/\*.*?\*/", "", f.read_text(), flags=re.S))) for f in files
    )
    print(f"check-silo: {len(files)} silos, {overrides} overrides, "
          f"{len(IDENTITY)} tokens siloable, {len(PAIRS)} contrast pairs, "
          f"{len(SELF_TEST)} deliberate violations caught")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
