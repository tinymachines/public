"""The chip API, as the mint reaches it: three calls, over loopback.

The registry lives in the 6502 service. Minting a token is a file open
(mint.py says why); claiming a page and publishing a cartridge are HTTP,
because those routes RUN the chip and the code that runs it belongs to that
service. Loopback rather than the public name so the call does not leave the
box, and configurable so a test can point it at nothing and a fake can stand
in. Every failure is returned as a sentence, never raised past the mint: a
token whose page could not be set up is still a token.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request


def base() -> str:
    return os.environ.get("TM_CHIP_API", "http://127.0.0.1:6502").rstrip("/")


def starter() -> tuple[str, str]:
    """handle/slug of the cartridge every new page starts with."""
    h, _, s = os.environ.get("TM_STARTER_CART", "tinymachines/die-runner").partition("/")
    return h, s


class ChipError(Exception):
    pass


def _call(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 60) -> bytes:
    headers = {"accept": "application/json"}
    data = None
    if body is not None:
        headers["content-type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base() + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        try:
            detail = json.loads(detail).get("detail", detail)
        except Exception:
            pass
        raise ChipError(f"{method} {path}: HTTP {e.code}: {detail}") from e
    except OSError as e:
        raise ChipError(f"{method} {path}: {e}") from e


class ChipClient:
    """What the mint asks the chip API for. Replaced whole in tests."""

    def claim(self, token: str, handle: str, name: str) -> dict:
        return json.loads(_call("POST", "/v1/registry/claim", token, {"handle": handle, "name": name}))

    def starter_blob(self) -> bytes:
        h, s = starter()
        return _call("GET", f"/v1/registry/b/{h}/roms/{s}/cart")

    def publish(self, token: str, handle: str, slug: str, blob: bytes, frames: int = 3) -> dict:
        body = {"cart": base64.b64encode(blob).decode(), "frames": frames}
        return json.loads(_call("PUT", f"/v1/registry/b/{handle}/roms/{slug}", token, body, timeout=180))
