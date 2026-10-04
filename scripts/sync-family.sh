#!/usr/bin/env bash
#
# Resync web/lib/family-data.ts from the family registry.
#
# Which sites are in the family, their hues and their order live in one
# place, meatball-labs/family/family.json (the parent's repository), whose
# build writes dist/family.ts. This copies that file in, so the dots in
# this site's footer agree with meatball.ai's, sysforge.ai's and
# bradley.io's. The copy is committed, so a clone builds without the
# family repository beside it; the deploy holds the copy to the registry.
# The dots' look stays the kit's .family component.
#
#   ./scripts/sync-family.sh --check   exit 1 if the copy has drifted
#   ./scripts/sync-family.sh           re-copy
#
set -euo pipefail

SRC="${FAMILY_KIT_SRC:-$HOME/projects/meatball-labs/family}/dist/family.ts"
DST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/web/lib/family-data.ts"

if [[ ! -f "$SRC" ]]; then
  echo "sync-family: the registry is not at $SRC (run meatball-labs/family/build.py)" >&2
  exit 2
fi
if [[ "${1:-}" == "--check" ]]; then
  if cmp -s "$SRC" "$DST"; then echo "sync-family: the family registry is current"; exit 0; fi
  echo "sync-family: the copy has drifted from the registry; run scripts/sync-family.sh" >&2
  exit 1
fi
cp "$SRC" "$DST"
echo "sync-family: copied $(basename "$SRC") to web/lib/family-data.ts"
