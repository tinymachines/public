#!/usr/bin/env bash
#
# Resync the Computer Tree from bradley.io, where it lives.
#
# The dataset (computer_tree.json, nodes.csv, edges.csv, DATACARD.md) and
# its layout (lib/computer-tree.ts) are bradley.io's, at
# ~/projects/bradleyio. This copies them in so tinymachines.ai can draw the
# same tree; the copies are committed, so a clone builds without bradley.io
# beside it, and the deploy holds them to the source. One change on the way
# in: the layout imports the dataset from this site's web/data/computer-tree
# rather than bradley.io's public/, because nothing here writes web/public
# outside the deploy (live serves from this checkout). The page and its
# component are this site's own, written against the same layout.
#
#   ./scripts/sync-computer-tree.sh --check   exit 1 if a copy has drifted
#   ./scripts/sync-computer-tree.sh           re-copy
#
set -euo pipefail

SRC="${COMPUTER_TREE_SRC:-$HOME/projects/bradleyio}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/web/data/computer-tree"
LIB="$ROOT/web/lib/computer-tree.ts"
FILES=(computer_tree.json nodes.csv edges.csv DATACARD.md)
FROM='import raw from "@/public/computer-tree/computer_tree.json"'
TO='import raw from "@/data/computer-tree/computer_tree.json"'

if [[ ! -f "$SRC/lib/computer-tree.ts" ]]; then
  echo "sync-computer-tree: bradley.io is not at $SRC" >&2
  exit 2
fi
lib() {
  grep -qF "$FROM" "$SRC/lib/computer-tree.ts" || { echo "sync-computer-tree: bradley.io's layout no longer imports the dataset as expected; look before copying" >&2; exit 2; }
  sed "s|$FROM|$TO|" "$SRC/lib/computer-tree.ts"
}
if [[ "${1:-}" == "--check" ]]; then
  bad=0
  for f in "${FILES[@]}"; do cmp -s "$SRC/public/computer-tree/$f" "$DATA/$f" || { echo "sync-computer-tree: $f has drifted" >&2; bad=1; }; done
  lib | cmp -s - "$LIB" || { echo "sync-computer-tree: lib/computer-tree.ts has drifted" >&2; bad=1; }
  [[ $bad == 0 ]] && { echo "sync-computer-tree: the tree is current with bradley.io"; exit 0; }
  echo "sync-computer-tree: run scripts/sync-computer-tree.sh" >&2
  exit 1
fi
mkdir -p "$DATA"
for f in "${FILES[@]}"; do cp "$SRC/public/computer-tree/$f" "$DATA/$f"; done
lib > "$LIB"
echo "sync-computer-tree: copied ${#FILES[@]} data files and the layout from $SRC"
