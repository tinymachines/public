"""The projects and their surfaces, loaded from data/projects.json.

The same arrangement as pieces.py and for the same reason: one file, read by
both sides. `web/lib/projects.ts` reads it to build the navigation, the
breadcrumbs and the menu; this module reads it to describe the structure over
HTTP. Neither owns it.

It answers a question `/v1/pieces` cannot. A piece is a thing that exists; a
surface is one addressable thing a project serves. halfphi is a piece and not a
surface, because it is a library with no address. The documentation tree is a
surface and not a piece, because it is not one of the six. The site is
organised by projects, and until this route the API could not say so.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from models import Project

DATA = Path(__file__).resolve().parent.parent / "data" / "projects.json"

try:
    _raw = json.loads(DATA.read_text())
except FileNotFoundError as e:  # pragma: no cover - a broken checkout
    raise RuntimeError(
        f"{DATA} is missing. It is the source of the site's own structure and is "
        "committed; a checkout without it is incomplete rather than empty."
    ) from e

if not isinstance(_raw, dict) or "projects" not in _raw:
    raise RuntimeError(f"{DATA} should be an object with a 'projects' list.")

MEASURED_ON: str = _raw.get("measured_on", "")

try:
    PROJECTS: list[Project] = [Project(**row) for row in _raw["projects"]]
except ValidationError as e:
    raise RuntimeError(f"{DATA} does not match the Project model:\n{e}") from e

BY_KEY = {p.key: p for p in PROJECTS}

if len(BY_KEY) != len(PROJECTS):
    raise RuntimeError(f"{DATA} has two projects sharing a key.")

SURFACES = [s for p in PROJECTS for s in p.surfaces]

# "not started" is the manifest's own words for a surface that has not moved.
# Counted rather than tracked, so the number cannot disagree with the list.
ARRIVED = [s for s in SURFACES if s.status != "not started"]
