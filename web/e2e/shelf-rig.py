#!/usr/bin/env python3
"""A real API with a throwaway database, for shelf.spec.ts's signed-in half.

The shelf is private to a GitHub account, so the live site cannot be tested
signed in: there is no account a suite could hold. This starts THIS tree's
API on a spare port against a temp database and a temp cartridge directory,
opens sessions for three made-up people the way a sign-in would, and writes
where it all is to e2e/out/shelf-rig.json. shelf.spec.ts passes the page's
/api requests through to it, so the web and the API under test are both the
real ones and only GitHub is missing.

    python3 e2e/shelf-rig.py            # port 6532, runs until interrupted
    SHELF_RIG_PORT=6533 python3 e2e/shelf-rig.py

Nothing here touches the deployed database: TM_DB is set before the service
is imported, and the path is asserted to be inside the temp directory.
"""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
API = HERE.parent.parent / "api"
PORT = int(os.environ.get("SHELF_RIG_PORT", "6532"))
OUT = HERE / "out" / "shelf-rig.json"

# Who is on the rig, and how many cartridges each may keep.
PEOPLE = {"owner": 3, "stranger": 3, "noshelf": 0}


def main() -> int:
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", PORT)) == 0:
            # A held port fails to bind quietly and every request then goes to
            # whatever holds it (CLAUDE.md). Refuse, and say so.
            sys.exit(f"shelf-rig: 127.0.0.1:{PORT} is already held. Set SHELF_RIG_PORT to a free one (ss -ltn).")

    tmp = tempfile.TemporaryDirectory(prefix="tinymachines-shelf-rig-")
    env = {**os.environ, "TM_DB": str(Path(tmp.name) / "rig.db"), "TM_CARTS": str(Path(tmp.name) / "carts"),
           "TM_MINT_SECRET": "rig", "TM_GITHUB_CLIENT_ID": "rig", "TM_GITHUB_CLIENT_SECRET": "rig"}
    os.environ.update(env)
    sys.path.insert(0, str(API))
    import auth  # noqa: E402  (after TM_DB, on purpose)
    import carts  # noqa: E402
    import db  # noqa: E402

    assert str(db.path()).startswith(tmp.name), f"the rig resolved its database to {db.path()}, outside {tmp.name}"

    conn = db.connect()
    sessions = {}
    for n, (who, shelf) in enumerate(PEOPLE.items(), start=1):
        uid = auth.upsert_github_user(conn, {"id": n, "login": who, "name": who.title(), "avatar_url": None, "email": None})
        sessions[who], _ = auth.open_session(conn, uid)
        if shelf:
            assert carts.grant(who, shelf) == who
    conn.close()

    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"], cwd=API, env=env)
    for _ in range(100):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", PORT)) == 0:
                break
        if proc.poll() is not None:
            sys.exit(f"shelf-rig: the API exited with {proc.returncode} before it listened")
        time.sleep(0.1)
    else:
        proc.kill()
        sys.exit("shelf-rig: the API never listened")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"api": f"http://127.0.0.1:{PORT}", "cookie": auth.SESSION_COOKIE, "sessions": sessions, "shelves": PEOPLE}, indent=1))
    print(f"shelf-rig: API on 127.0.0.1:{PORT}, state in {tmp.name}, written to {OUT}", flush=True)

    def stop(*_):
        proc.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    code = proc.wait()
    OUT.unlink(missing_ok=True)
    tmp.cleanup()
    return 0 if code in (0, -signal.SIGTERM, -signal.SIGINT) else code


if __name__ == "__main__":
    sys.exit(main())
