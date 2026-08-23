#!/usr/bin/env bash
#
# Build, then restart. In that order, and never the second without the first.
#
# This script exists because of an outage that took about ninety seconds and
# was entirely avoidable: a build failed, the failure scrolled past, and the
# service was restarted anyway. `next start` serves the .next directory it
# finds, and a half-written one makes every route 502. The site went down
# because two commands ran that should have been one decision.
#
# So: set -e, the build gates the restart, and the verification is part of the
# run rather than something to remember afterwards.
#
#   ./deploy/deploy.sh            build, restart, verify
#   ./deploy/deploy.sh --check    build and verify only, no restart
#
# It does NOT touch nginx. A reload there is server wide across every vhost on
# this box, so it stays a deliberate act with `nginx -t` in front of it. See
# deploy/README.md.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
CHECK_ONLY="${1:-}"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

say "1. Lint"
(cd web && bun run lint) || fail "eslint"

say "2. Tokens"
python3 style/check-tokens.py || fail "check-tokens"

say "3. API tests"
(cd api && python3 -m pytest . -q) || fail "pytest"

# The build regenerates the icons from the palette and runs the output checks,
# which is where the airgap, frontmatter, CSP and robots assertions live.
say "4. Build"
(cd web && bun run build) || fail "build: NOT restarting, the running site is untouched"

if [ "$CHECK_ONLY" = "--check" ]; then
  say "Built and checked. Nothing was restarted."
  exit 0
fi

say "5. Restart"
sudo systemctl restart tinymachines-api
sudo systemctl restart tinymachines-web

# Wait for the ports, do not sleep and hope. A fixed sleep was here first and
# it raced: `next start` was not answering yet when the verification began, so
# one endpoint came back 000 and the deploy reported a failure that was really
# a stopwatch. Polling makes the outcome depend on the service rather than on
# how fast this box happens to be today.
wait_for() {
  local name=$1 port=$2 tries=60
  while [ "$tries" -gt 0 ]; do
    if curl -sf -o /dev/null -m 2 "http://127.0.0.1:$port/" 2>/dev/null; then
      printf '  %-20s listening on %s\n' "$name" "$port"
      return 0
    fi
    tries=$((tries - 1))
    sleep 0.5
  done
  fail "$name never answered on 127.0.0.1:$port"
}

for unit in tinymachines-web tinymachines-api; do
  state=$(systemctl is-active "$unit" || true)
  [ "$state" = "active" ] || fail "$unit is $state"
done
wait_for tinymachines-web 6511
wait_for tinymachines-api 6510

say "6. Verify"
BASE="https://tinymachines.ai"
bad=0
for p in / /docs /docs/6502 /style /style/zoo /icon.svg /apple-icon.png /robots.txt \
         /api/ /api/health /api/v1/pieces /api/v1/status /api/openapi.json; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$p" || echo 000)
  printf '  %-28s %s\n' "$p" "$code"
  [ "$code" = "200" ] || bad=$((bad + 1))
done
[ "$bad" -eq 0 ] || fail "$bad endpoint(s) did not return 200"

# The API reads its commit out of .git, so this is the deployed tree saying
# what it is rather than this script asserting what it deployed.
say "7. Provenance"
running=$(curl -s -m 20 "$BASE/api/v1/meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["commit"])')
head=$(git -C "$ROOT" rev-parse HEAD)
printf '  git   %s\n  api   %s\n' "$head" "$running"
[ "$running" = "$head" ] || fail "the API reports a different commit than the checkout"

say "Deployed."
