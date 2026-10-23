#!/usr/bin/env python3
"""Link accounts on the kit's account service to accounts here, by GitHub id.

notes/desk-move.md, step A. A person who signed in here with GitHub and on the
account service with GitHub has the same GitHub numeric id on both sides; this
writes one row of account_links per such pair, so their passkey session on
this host opens the same shelf as their GitHub session (api/auth.py,
current_user). Nobody is matched by name, handle or address.

    scripts/link-accounts.py --roof <roof.db> --accounts <accounts.db>          # the pairs, nothing written
    scripts/link-accounts.py --roof <roof.db> --accounts <accounts.db> --write  # and write them

The account service's file is only ever read (a read-only connection). The
roof's file is read the same way for the dry run and opened for writing only
with --write. Neither is migrated: only the service moves its own file forward,
when it restarts on new code, so --write refuses a roof file without
account_links (the API has not yet restarted on migration 9) rather than make
the table here. Running it twice changes nothing the second time. A clash, an
account already linked to a different user or a user already linked to a
different account, stops the run before anything is written.

The owner runs --write, as with the admin key: this session never writes the
live database. Undo is `DELETE FROM account_links`.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone


def read_only(path: str) -> sqlite3.Connection:
    c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c


def has_table(c: sqlite3.Connection, name: str) -> bool:
    return c.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)).fetchone() is not None


def pairs(roof: sqlite3.Connection, accounts: sqlite3.Connection) -> list[dict]:
    """Every roof user with a GitHub login whose GitHub id has an account on the service."""
    kit = {r["provider_id"]: r for r in accounts.execute(
        "SELECT l.provider_id, l.user_id, u.handle FROM logins l JOIN users u ON u.id = l.user_id WHERE l.provider = 'github'")}
    out = []
    for r in roof.execute(
        "SELECT l.provider_id, l.user_id, u.handle FROM logins l JOIN users u ON u.id = l.user_id "
        "WHERE l.provider = 'github' ORDER BY u.handle"):
        k = kit.get(r["provider_id"])
        out.append({
            "github_id": r["provider_id"],
            "user_id": r["user_id"],
            "handle": r["handle"],
            "account_id": k["user_id"] if k else None,
            "account_handle": k["handle"] if k else None,
        })
    return out


def plan(roof: sqlite3.Connection, found: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    """What --write would insert, what is already there, and what clashes."""
    existing = {}
    if has_table(roof, "account_links"):
        existing = {r["account_id"]: r["user_id"] for r in roof.execute("SELECT account_id, user_id FROM account_links")}
    by_user = {u: a for a, u in existing.items()}
    new, have, clash = [], [], []
    for p in found:
        a, u = p["account_id"], p["user_id"]
        if a is None:
            continue
        if existing.get(a) == u:
            have.append(f"{p['handle']}: already linked")
        elif a in existing:
            clash.append(f"{p['handle']}: the account is linked to another user here")
        elif u in by_user:
            clash.append(f"{p['handle']}: this user is linked to another account")
        else:
            new.append(p)
    return new, have, clash


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--roof", required=True, help="the roof's sign-in database")
    ap.add_argument("--accounts", required=True, help="the account service's database, read only")
    ap.add_argument("--write", action="store_true", help="write the new links (otherwise only print them)")
    a = ap.parse_args(argv)

    accounts = read_only(a.accounts)
    roof = read_only(a.roof)
    found = pairs(roof, accounts)
    new, have, clash = plan(roof, found)
    for p in found:
        there = f"account {p['account_id']} ({p['account_handle']})" if p["account_id"] else "no account on the service"
        print(f"{p['handle']}: GitHub id {p['github_id']}, {there}")
    for line in have:
        print(line)
    for line in clash:
        print(f"CLASH {line}")
    if clash:
        print("Nothing written: a clash is for a person to look at, not for this script to settle.")
        return 1
    print(f"{len(new)} to link, {len(have)} already linked, {sum(1 for p in found if not p['account_id'])} with no account on the service.")
    if not a.write:
        print("A dry run: nothing written. --write writes the links.")
        return 0
    roof.close()
    rw = sqlite3.connect(a.roof, timeout=5.0)
    rw.execute("PRAGMA foreign_keys = ON")
    rw.execute("PRAGMA busy_timeout = 5000")
    if not has_table(rw, "account_links"):
        print("The roof's file has no account_links: the API has not restarted on migration 9 yet. Nothing written.")
        return 2
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with rw:
        for p in new:
            rw.execute("INSERT INTO account_links (account_id, user_id, github_id, linked_at) VALUES (?, ?, ?, ?)",
                       (p["account_id"], p["user_id"], p["github_id"], now))
    print(f"Wrote {len(new)} link{'s' if len(new) != 1 else ''}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
