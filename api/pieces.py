"""The six pieces, as data. This is the one copy of that fact.

The same six are described in prose in `notes/inventory.md` and linked from
`docs/index.md`. Prose is the part of a site most likely to go quietly wrong,
so rather than keeping three lists in step by hand, this module is the list
and `test_api.py` fails when the prose and this disagree. A seventh piece
added here and nowhere else is a red test, not a silent omission.

Licence facts come from `NOTICE.md` and are split in two on purpose. The code
licence and the terms on the die data are different questions, and collapsing
them into one "licence" field is what produces a sentence like "halfphi is
MIT, so the netlist is fine".
"""

from __future__ import annotations

from models import Piece

# NonCommercial and ShareAlike travel with anything derived from the die data.
# NOTICE.md has the reasoning; this is the sentence it reduces to.
DIE_TERMS = "CC BY-NC-SA 3.0, derived from visual6502 die data"
NO_DIE_DATA = "none: embeds no die data"

PIECES: list[Piece] = [
    Piece(
        key="halfphi",
        name="halfphi",
        what="The switch-level engine: die-data parser, netlist, solver. It names no "
             "chip and embeds no die data, which is the whole reason it can be "
             "depended on freely. Loads the 6502, the 6800 and the Z80 through "
             "identical calls.",
        source="https://github.com/tinymachines/halfphi",
        ships_as="a Rust crate",
        code_licence="MIT",
        data_terms=NO_DIE_DATA,
        public_url=None,
        not_hosted_because="A crate is a dependency, not a running service. There is "
                           "nothing to answer an HTTP request, so this piece has no "
                           "reachability to report.",
    ),
    Piece(
        key="explorer",
        name="the 6502 info site",
        what="The info site: a WebGL2 die renderer, around 25 derived container kinds, "
             "the chip map, the primer, the labs and the measured tables.",
        source="https://github.com/tinymachines/6502",
        ships_as="built into a content-hashed dist/, served from a release symlink",
        code_licence="MIT",
        data_terms=DIE_TERMS,
        public_url="https://6502.tinymachines.ai",
        not_hosted_because=None,
    ),
    Piece(
        key="chip-api",
        name="the 6502 API",
        what="Stateless HTTP over the real chip: the whole machine travels in every "
             "request and the server keeps no sessions. FastAPI and Pydantic, plus the "
             "chip atlas, the cartridge mint and an MCP endpoint.",
        source="https://github.com/tinymachines/6502",
        ships_as="uvicorn, with --root-path /api behind nginx",
        code_licence="MIT",
        data_terms=DIE_TERMS,
        public_url="https://6502.tinymachines.ai/api",
        not_hosted_because=None,
    ),
    Piece(
        key="halfwave",
        name="halfwave",
        what="The warm engine process the API talks to: a line protocol, one parsed "
             "netlist, one machine, zero dependencies. Plus a reviewer-built lab on a "
             "property of its own.",
        source="https://github.com/tinymachines/6502",
        ships_as="a release binary, plus a static lab",
        code_licence="MIT",
        data_terms=DIE_TERMS,
        public_url="https://halfwave.tinymachines.ai",
        not_hosted_because=None,
    ),
    Piece(
        key="console",
        name="Die Runner",
        what="The console: a 6502 ROM, a page of its memory as the screen, and the "
             "browser drawing it. Cartridges, builder pages and the editor.",
        source="https://github.com/tinymachines/6502",
        ships_as="static ES modules",
        code_licence="MIT",
        data_terms=DIE_TERMS,
        public_url="https://games.tinymachines.ai",
        not_hosted_because=None,
    ),
    Piece(
        key="registry",
        name="Die Runner API",
        what="The cartridge mint, the console spec and the registry. Publishing "
             "re-runs every cartridge on the chip rather than believing the verify "
             "block the file arrived with, because a file is something its author "
             "can edit.",
        source="https://github.com/tinymachines/6502",
        ships_as="routes on the same FastAPI app as the 6502 API, not a service of its own",
        code_licence="MIT",
        data_terms=DIE_TERMS,
        public_url=None,
        not_hosted_because="Not a separate service. It is routes on the 6502 API, so "
                           "probing it would report that service's health a second "
                           "time under a different name. See the chip-api piece.",
    ),
]

BY_KEY = {p.key: p for p in PIECES}

assert len(BY_KEY) == len(PIECES), "two pieces share a key"
