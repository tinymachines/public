#!/usr/bin/env python3
"""The favicon and the Apple touch icon, both drawn from tokens.css.

Generated rather than committed, for the reason every shared fact in this
repository is read rather than copied. A colour typed into an SVG by hand is a
second copy of a token, and this is the drift nobody ever notices: a tab icon
one revision behind the palette looks exactly like a tab icon.

Both files come out of this one script so the geometry also exists once. An
SVG maintained beside a PNG that is supposed to be the same mark is two copies
of a shape, and they diverge the first time somebody nudges a rectangle.

    python3 style/build-icon.py

Outputs, both gitignored:

    web/app/icon.svg        the tab icon, and what Next links as the favicon
    web/app/apple-icon.png  180x180, because iOS accepts only PNG here

The mark is a DIP package. It is the subject of the whole site and it is the
one shape that still reads at 16 pixels, where a letterform would not.
Deliberately not a wordmark: the owner's mark is the owner's, and inventing
one here is the visual identity CLAUDE.md reserves. A chip outline describes
the subject rather than branding it.

Three tokens, each doing the job STYLE.md section 1 gives it. Paper is the
ground, because documentation sits on paper. Body and pins are ink. The dot is
Burnt Silicon, and it is where pin 1 is: the one thing a real package prints
on itself.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOKENS = HERE / "tokens.css"
OUT_SVG = HERE.parent / "web" / "app" / "icon.svg"
OUT_PNG = HERE.parent / "web" / "app" / "apple-icon.png"

# A 32 unit grid, 8 units to the site's 4px --u, so the mark sits on the same
# grid as everything else. Nothing is thinner than 3 units: at 16px a pin any
# finer than that vanishes into the ground.
BODY = (10, 7, 12, 18)          # x, y, w, h
PINS = [(4, 10), (4, 15), (4, 20), (24, 10), (24, 15), (24, 20)]
PIN_W, PIN_H = 4, 3
DOT = (16, 11, 2)               # cx, cy, r
CORNER = 6


def token(name: str) -> str:
    css = TOKENS.read_text()
    m = re.search(rf"--{name}\s*:\s*(#[0-9A-Fa-f]{{3,8}})", css)
    if not m:
        sys.exit(f"build-icon: --{name} is not in {TOKENS.name}. "
                 "The icon cannot be drawn from a palette that does not have it.")
    return m.group(1)


def svg(paper: str, ink: str, burnt: str) -> str:
    pins = "\n".join(
        f'    <rect x="{x}" y="{y}" width="{PIN_W}" height="{PIN_H}" rx="1"/>'
        for x, y in PINS
    )
    bx, by, bw, bh = BODY
    cx, cy, r = DOT
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="tinymachines">
  <rect width="32" height="32" rx="{CORNER}" fill="{paper}"/>
  <g fill="{ink}">
    <rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="1.5"/>
{pins}
  </g>
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="{burnt}"/>
</svg>
'''


def raster(paper: str, ink: str, burnt: str, size: int, rounded: bool):
    """One raster of the mark at `size` pixels."""
    from PIL import Image, ImageDraw

    s = size / 32  # one grid unit in pixels
    # Drawn at 4x and downsampled, because PIL has no antialiasing on shapes.
    ss = 4
    img = Image.new("RGB", (size * ss, size * ss), paper)
    d = ImageDraw.Draw(img)

    def box(x, y, w, h, radius, fill):
        d.rounded_rectangle(
            [x * s * ss, y * s * ss, (x + w) * s * ss, (y + h) * s * ss],
            radius=radius * s * ss, fill=fill,
        )

    bx, by, bw, bh = BODY
    box(bx, by, bw, bh, 1.5, ink)
    for x, y in PINS:
        box(x, y, PIN_W, PIN_H, 1, ink)
    cx, cy, r = DOT
    d.ellipse([(cx - r) * s * ss, (cy - r) * s * ss, (cx + r) * s * ss, (cy + r) * s * ss], fill=burnt)

    return img.resize((size, size), Image.LANCZOS)


def rasters(paper: str, ink: str, burnt: str) -> None:
    from PIL import Image  # noqa: F401  (imported for the error message above)

    # No rounded corner on the Apple icon: iOS masks it itself, and a rounded
    # source under that mask shows a paper rim inside the system's own radius.
    raster(paper, ink, burnt, 180, rounded=False).save(OUT_PNG, "PNG", optimize=True)

    # No favicon.ico. Next's image pipeline rejected the multi-size ICO that
    # Pillow writes ("Processing image failed"), and app/favicon.ico is a
    # reserved filename it insists on processing. Modern browsers use the
    # <link rel="icon"> SVG above and never ask for /favicon.ico, so what is
    # lost is a legacy fallback rather than the icon. Left undone on purpose
    # rather than worked around with a hand-made binary, which would be a
    # second copy of the mark that nothing regenerates.


def main() -> int:
    paper, ink, burnt = token("color-paper"), token("color-ink"), token("color-burnt")
    OUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUT_SVG.write_text(svg(paper, ink, burnt))
    try:
        rasters(paper, ink, burnt)
    except ImportError:
        sys.exit("build-icon: Pillow is needed for the raster icons (pip install Pillow).")
    print(f"build-icon: icon.svg and apple-icon.png from tokens.css "
          f"(paper {paper}, ink {ink}, burnt {burnt})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
