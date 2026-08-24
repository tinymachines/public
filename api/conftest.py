"""Test setup: one temporary database, wiped between tests.

Two things happen here and both are about isolation rather than convenience.

**`TM_DB` is set before anything imports the app.** pytest imports conftest
before test modules, and `db.path()` reads the environment on every call rather
than at import, so this is enough to point the entire service at a temp file no
matter what order the imports happen in. That combination is deliberate: an
import-time constant in `db` would make the isolation depend on module load
order, which works until somebody adds an import.

**The tables are truncated before every test rather than the file being
recreated.** The service migrates on connect, so recreating the file would mean
every test paid for a migration and, worse, that a broken migration would show
up as thirty failures instead of one.

The safety net is the assertion below: if the resolved path is not inside the
temp directory, the run stops before a single test touches a real database.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.TemporaryDirectory(prefix="tinymachines-tests-")
os.environ["TM_DB"] = str(Path(_TMP.name) / "test.db")

import db  # noqa: E402  (imported after TM_DB is set, on purpose)

# A check that can pass on nothing is not a check, and this one can do worse
# than pass on nothing: a suite that truncates tables against the deployed file
# is the last mistake it ever makes. So the path is asserted, once, here.
assert str(db.path()).startswith(_TMP.name), (
    f"tests resolved TM_DB to {db.path()}, which is not under {_TMP.name}. "
    "Refusing to run: these fixtures truncate tables."
)


@pytest.fixture(autouse=True)
def fresh_db():
    """Empty tables before each test.

    autouse, so a test cannot forget it. Autouse fixtures of the same scope run
    before the named ones, which is what makes this land before any `client`
    fixture starts the app and its bootstrap.
    """
    conn = db.connect()
    with conn:
        conn.execute("DELETE FROM api_keys")
        conn.execute("DELETE FROM users")
        conn.execute("DELETE FROM token_mints")
    conn.close()
    yield
