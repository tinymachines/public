#!/usr/bin/env bash
# Link passkeys on the kit's account service to accounts here, once.
#
# notes/desk-move.md, step A. A person who signed in here with GitHub and on
# the account service with GitHub is the same person: both sides recorded the
# same GitHub numeric id. This writes one row of account_links per such pair,
# and from then on that person's passkey opens the same shelf as their GitHub
# sign-in. Nothing else changes: no account, cartridge or file moves.
#
# It finds both databases from their systemd units (StateDirectory), so no
# path is written here. It runs scripts/link-accounts.py's dry run, shows the
# pairs, asks, writes, and shows what is linked afterwards. The account
# service's file is only read. Running it again changes nothing.
#
#   ./scripts/link-passkey.sh          show, ask, write
#   ./scripts/link-passkey.sh --yes    show, write
#   ./scripts/link-passkey.sh --dry    show only
#
# Undo: sqlite3 <roof.db> 'DELETE FROM account_links'. Not covered: a
# database somewhere other than the units' StateDirectory (set TM_DB or
# KA_DB to point at it).
set -euo pipefail

ROOF_UNIT=tinymachines-api
KIT_UNIT=kit-accounts
YES=0
DRY=0
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    --dry) DRY=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "link-passkey: unknown argument $a" >&2; exit 2 ;;
  esac
done

here=$(cd "$(dirname "$0")/.." && pwd)

state_of() {
  local name
  name=$(systemctl show "$1" -p StateDirectory --value 2>/dev/null | awk '{print $1}')
  [ -n "$name" ] || { echo "link-passkey: $1 names no StateDirectory" >&2; exit 1; }
  echo "/var/lib/$name"
}

ROOF=${TM_DB:-$(state_of "$ROOF_UNIT")/roof.db}
KIT=${KA_DB:-$(state_of "$KIT_UNIT")/accounts.db}
for f in "$ROOF" "$KIT"; do
  [ -r "$f" ] || { echo "link-passkey: cannot read $f" >&2; exit 1; }
done

run() { /usr/bin/python3 "$here/scripts/link-accounts.py" --roof "$ROOF" --accounts "$KIT" "$@"; }

echo "== What would be linked"
run
[ "$DRY" -eq 1 ] && exit 0

if [ "$YES" -ne 1 ]; then
  read -r -p "Write these links? [y/N] " answer
  case "$answer" in y|Y|yes) ;; *) echo "Nothing written."; exit 0 ;; esac
fi

echo
echo "== Writing"
run --write

echo
echo "== Linked now"
/usr/bin/python3 - "$ROOF" <<'EOF'
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
rows = c.execute("SELECT u.handle, a.account_id, a.linked_at FROM account_links a JOIN users u ON u.id = a.user_id ORDER BY u.handle").fetchall()
for h, a, t in rows:
    print(f"  {h} -> {a} (since {t})")
print(f"{len(rows)} linked. Sign in with a passkey from the menu on the site, and your shelf should be there.")
EOF
