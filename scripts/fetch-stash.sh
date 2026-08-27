#!/usr/bin/env bash
# Fetch a shared zip (a brief, screenshots, notes) into the session scratchpad
# and unpack it, so the agent can read it without downloading anything itself.
#
#   scripts/fetch-stash.sh <url> [dest-dir]
#
# dest-dir defaults to $CLAUDE_SCRATCHPAD/stash, else ./notes/stash (gitignored
# is your job: nothing here is committed). Prints the unpacked file list.
set -euo pipefail

URL="${1:?usage: fetch-stash.sh <url> [dest-dir]}"
DEST="${2:-${CLAUDE_SCRATCHPAD:-notes}/stash}"

mkdir -p "$DEST"
ZIP="$DEST/stash.zip"
curl -sSL -o "$ZIP" "$URL"
echo "fetched $(stat -c %s "$ZIP") bytes -> $ZIP"
file "$ZIP"
unzip -o -q "$ZIP" -d "$DEST"
find "$DEST" -type f ! -name stash.zip | sort
