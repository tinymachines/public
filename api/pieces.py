"""The six pieces, loaded from data/pieces.json. That file is the one copy.

It used to be a Python literal here, which was fine while only the API needed
it. The front page needs it too, and a TypeScript copy of six records that a
Python module also holds is the drift this repository keeps finding at the
bottom of its bugs. So the data moved out to JSON that both sides read, and
neither side owns it.

What stays here is the part that is not data: the Pydantic model still
validates every record and still generates the OpenAPI schema, so the
reference cannot drift from the behaviour. A malformed or half-edited
pieces.json fails at import, loudly, rather than serving a piece with a
missing field.

The same six are described in prose in `notes/inventory.md` and linked from
`docs/index.md`. `test_api.py` fails when those disagree with this, so a
seventh piece added in one place only is a red test rather than a silent
omission.

Licence facts come from `NOTICE.md` and are two fields on purpose. The code
licence and the terms on the die data are different questions, and collapsing
them into one is what produces a sentence like "halfphi is MIT, so the netlist
is fine".
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from models import Piece

DATA = Path(__file__).resolve().parent.parent / "data" / "pieces.json"

try:
    _raw = json.loads(DATA.read_text())
except FileNotFoundError as e:  # pragma: no cover - a broken checkout
    raise RuntimeError(
        f"{DATA} is missing. It is the source of the six pieces and is committed; "
        "a checkout without it is incomplete rather than empty."
    ) from e

if not isinstance(_raw, list) or not _raw:
    raise RuntimeError(f"{DATA} should be a non-empty list of pieces.")

try:
    PIECES: list[Piece] = [Piece(**row) for row in _raw]
except ValidationError as e:
    # Name the file. A Pydantic traceback pointing at models.py sends the
    # reader to the wrong place when the fault is in the data.
    raise RuntimeError(f"{DATA} does not match the Piece model:\n{e}") from e

BY_KEY = {p.key: p for p in PIECES}

if len(BY_KEY) != len(PIECES):
    raise RuntimeError(f"{DATA} has two pieces sharing a key.")
