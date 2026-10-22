#!/usr/bin/env bash
# Recover the roof's admin key when the one you had is gone.
#
# The API answers the first-key question the way api/README.md describes: at
# startup, when no LIVE admin key exists, it mints one and prints it once to
# stderr, which under systemd is the journal. That is also the recovery path,
# on purpose: there is no break-glass flag, no second mechanism. But the API
# refuses to revoke its last live admin key over HTTP (a 409 that says to mint
# the replacement first), which is right when you hold a key and useless when
# you do not. So the one step the API will not take is taken here, on the
# host, by somebody who can already read the database: every live admin key is
# marked revoked, the service is restarted, and the key it mints is read back
# out of the journal and printed to this terminal, once.
#
# What this costs: the API is down for the restart (a few seconds), and every
# admin key that existed stops working, including one you may still have in a
# tab. Dev keys are untouched. The revoked rows stay, as the record that the
# credentials existed.
#
# Run it with no arguments and it shows what it would revoke and asks. --yes
# skips the question. Nothing is printed but the new key; keep it somewhere
# safe, then mint a dev key for everyday reading on /admin and keep the admin
# key for the controls.
#
#   ./scripts/recover-admin-key.sh          show, ask, do
#   ./scripts/recover-admin-key.sh --yes    do
#   ./scripts/recover-admin-key.sh --show   print the key the service minted
#                                           last, from the journal; changes
#                                           nothing. For when a run of this
#                                           script restarted the service and
#                                           then could not read the journal.
#
# Not covered: a database somewhere other than the unit's StateDirectory (set
# TM_DB to point at it), and a service run outside systemd (then the key is on
# the process's stderr, not in the journal).
set -euo pipefail

UNIT=tinymachines-api
YES=0
SHOW=0
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    --show) SHOW=1 ;;
    -h|--help) sed -n '2,35p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "recover-admin-key: unknown argument $a" >&2; exit 2 ;;
  esac
done

for tool in sqlite3 systemctl journalctl; do
  command -v "$tool" >/dev/null || { echo "recover-admin-key: $tool is not installed" >&2; exit 1; }
done

if [ "$SHOW" -eq 1 ]; then
  key=$(sudo journalctl -u "$UNIT" --no-pager -o cat | grep -o 'tmk_[A-Za-z0-9_-]*' | tail -1 || true)
  [ -n "$key" ] || { echo "recover-admin-key: the journal of $UNIT holds no minted key." >&2; exit 1; }
  echo "recover-admin-key: the admin key $UNIT minted last (it is live unless something revoked it since):"
  echo
  echo "    $key"
  echo
  exit 0
fi

# The database is where the unit keeps it: $STATE_DIRECTORY/roof.db
# (api/db.py), unless TM_DB names another.
if [ -n "${TM_DB:-}" ]; then
  DB="$TM_DB"
else
  state=$(systemctl show "$UNIT" -p StateDirectory --value 2>/dev/null || true)
  [ -n "$state" ] || { echo "recover-admin-key: $UNIT has no StateDirectory; set TM_DB" >&2; exit 1; }
  DB="/var/lib/$state/roof.db"
fi
[ -r "$DB" ] || sudo test -r "$DB" || { echo "recover-admin-key: no database at $DB" >&2; exit 1; }
sql() { sudo sqlite3 "$DB" "$@"; }

live=$(sql "select id || '  ' || substr(created_at,1,10) || '  ' || coalesce(note,'') from api_keys where scope = 'admin' and revoked_at is null order by created_at;")
if [ -z "$live" ]; then
  echo "recover-admin-key: no live admin key exists; a restart alone mints one."
else
  echo "recover-admin-key: these live admin keys will stop working:"
  echo "$live" | sed 's/^/    /'
fi
echo "recover-admin-key: $UNIT restarts (down for a few seconds); the new admin key prints here once."
if [ "$YES" -ne 1 ]; then
  read -r -p "Go ahead? [y/N] " answer
  case "$answer" in y|Y|yes) ;; *) echo "recover-admin-key: nothing done."; exit 0 ;; esac
fi

# The time is the same source the API uses (UTC, ISO 8601), so the row reads
# like one the API revoked. The journal gets the same instant as seconds since
# the epoch (@N): journalctl 249 refuses the Z form ("Failed to parse
# timestamp"), which is how the first two runs of this script revoked and
# restarted correctly and then reported no key (2026-10-21).
now=$(date +%s)
since=$(date -u -d "@$now" +%Y-%m-%dT%H:%M:%SZ)
jsince="@$now"
if [ -n "$live" ]; then
  sql "update api_keys set revoked_at = '$since' where scope = 'admin' and revoked_at is null;"
fi
sudo systemctl restart "$UNIT"

# The bootstrap prints a framed block to stderr; its key line is the one
# starting tmk_. Give the service a moment to start and the journal to take
# it, and look only at entries from this restart.
key=""
for _ in $(seq 1 20); do
  sleep 0.5
  key=$(sudo journalctl -u "$UNIT" --since "$jsince" --no-pager -o cat | grep -o 'tmk_[A-Za-z0-9_-]*' | tail -1 || true)
  [ -n "$key" ] && break
done
state=$(systemctl is-active "$UNIT" || true)
if [ -z "$key" ]; then
  echo "recover-admin-key: $UNIT is $state but no key appeared in the journal since $since." >&2
  echo "recover-admin-key: look yourself: $0 --show" >&2
  exit 1
fi
echo
echo "recover-admin-key: $UNIT is $state. The new admin key, shown once:"
echo
echo "    $key"
echo
echo "Keep it somewhere safe. On https://tinymachines.ai/admin it mints dev keys; on /nes/stream it works the bar."
