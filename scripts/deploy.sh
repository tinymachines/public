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
# This is the ONE command between a change and it being live. Everything that
# has to happen, happens here, in order, and each stage gates the next.
#
#   ./scripts/deploy.sh           every gate, build, restart, verify
#   ./scripts/deploy.sh --check   every gate and the build, nothing restarted
#   ./scripts/deploy.sh --dirty   deploy with uncommitted changes, see below
#
# **Commit before deploying.** The default refuses a dirty tree, and that is
# not tidiness. The API reads its own commit out of .git and reports it at
# /v1/meta, and stage 8 holds the running service to it: with uncommitted
# changes the service is running code that no commit contains, and it will
# report a commit that is not what is running. A service that misreports what
# it is, is worse than one that is out of date. --dirty is there for
# iterating, and says so on the way past.
#
# The order matters and is not obvious in one place: the build stamps
# public/sw.js with the current commit, because a browser installs a new
# service worker only when the file's bytes change. Committing and then
# deploying gets the right stamp. Deploying and then committing does not, and
# nothing would say so.
#
# It does NOT touch nginx. A reload there is process wide across 37 files, 80
# server blocks and 58 server names on this box, most of them nothing to do
# with tinymachines, so it stays a deliberate act with `nginx -t` in front of
# it and a before/after sweep of every hostname behind it. See
# deploy/README.md.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

MODE=""
for arg in "$@"; do
  case "$arg" in
    --check|--dirty) MODE="$MODE $arg" ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done
case "$MODE" in *--check*) CHECK_ONLY=1 ;; *) CHECK_ONLY= ;; esac
case "$MODE" in *--dirty*) ALLOW_DIRTY=1 ;; *) ALLOW_DIRTY= ;; esac

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
warn() { printf '\033[33m   %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

say "0. The tree"
DIRTY=$(git -C "$ROOT" status --porcelain)
if [ -n "$DIRTY" ]; then
  if [ -n "$ALLOW_DIRTY" ] || [ -n "$CHECK_ONLY" ]; then
    warn "uncommitted changes: the service will report a commit that is not what is running"
    printf '%s\n' "$DIRTY" | sed 's/^/     /'
  else
    printf '%s\n' "$DIRTY" | sed 's/^/     /'
    fail "uncommitted changes. Commit first so /v1/meta can say what is running, or pass --dirty."
  fi
else
  printf '  clean at %s\n' "$(git -C "$ROOT" rev-parse --short=12 HEAD)"
fi

say "1. Lint"
(cd web && bun run lint) || fail "eslint"

say "2. Tokens"
python3 style/check-tokens.py || fail "check-tokens"

say "2b. Cascade"
python3 style/check-cascade.py || fail "check-cascade"

say "2c. Figures"
python3 data/check-figures.py || fail "check-figures"

# The project silos. This one carries its own self test, because every silo
# that exists today overrides nothing and the rules would otherwise have
# nothing to bite on.
say "2d. Silos"
python3 style/check-silo.py || fail "check-silo"

say "3. API tests"
(cd api && python3 -m pytest . -q) || fail "pytest"

# The projects' own tools. A separate invocation rather than one rooted at the
# repo, because api/ has a conftest that points TM_DB at a temp file and
# collecting both under one root would put that fixture in charge of tests it
# knows nothing about.
say "3b. Project tools"
python3 -m pytest projects -q || fail "pytest projects"

# The build is four things in a row, and each is here rather than in this
# script because a `bun run build` in a fresh clone has to do all of them:
# the icons and the manifest colours from the palette, the service worker
# stamped with the commit, the lab's content-hashed assets, and then the
# output checks, which is where the airgap, frontmatter, CSP, robots, PWA,
# heading and DOM-contract assertions live.
say "4. Build"
(cd web && bun run build) || fail "build: NOT restarting, the running site is untouched"

if [ -n "$CHECK_ONLY" ]; then
  say "Built and checked. Nothing was restarted."
  exit 0
fi

# Restarted one at a time rather than together, so a unit that fails to come
# back is attributable. They are independent: nginx routes /api to one and
# everything else to the other, so the site is degraded rather than down while
# either is restarting.
say "5. Restart"
for unit in tinymachines-api tinymachines-web; do
  printf '  %s\n' "$unit"
  sudo systemctl restart "$unit"
done

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
for p in / /docs /docs/6502 /style /style/zoo /admin /icon.svg /apple-icon.png /robots.txt \
         /api/ /api/health /api/v1/pieces /api/v1/status /api/openapi.json; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$p" || echo 000)
  printf '  %-28s %s\n' "$p" "$code"
  [ "$code" = "200" ] || bad=$((bad + 1))
done
[ "$bad" -eq 0 ] || fail "$bad endpoint(s) did not return 200"

# The administered surface, checked from outside. Every route under
# /v1/admin must refuse an anonymous request, and the suite already proves that
# against the app object. This proves it about the thing on the internet, which
# is a different claim: a proxy rule, a stale unit or a cached response can all
# make the deployed answer differ from the tested one.
#
# 401 is the pass here. A 200 would mean the gate is open; a 404 would mean the
# routes did not deploy and this check is passing on nothing, so both fail.
say "6b. The gate"
for p in /api/v1/admin/whoami /api/v1/admin/keys /api/v1/admin/users; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$p" || echo 000)
  printf '  %-28s %s\n' "$p" "$code"
  [ "$code" = "401" ] || fail "$p answered $code with no key; expected 401"
done

# The service worker's stamp, checked from outside. It is what makes a deploy
# replace an installed worker at all, and it is generated by the build rather
# than committed, so this is the one place the two can be compared.
say "7. The worker"
swv=$(curl -s -m 20 "$BASE/sw.js" | sed -n 's/^const VERSION = "\(.*\)";$/\1/p')
head12=$(git -C "$ROOT" rev-parse --short=12 HEAD)
printf '  sw.js %s\n  git   %s\n' "${swv:-MISSING}" "$head12"
if [ -z "$swv" ]; then
  fail "sw.js carries no version; scripts/build-sw.mjs did not run or did not reach public/"
elif [ "$swv" != "$head12" ] && [ -z "$ALLOW_DIRTY" ]; then
  fail "sw.js is stamped $swv but HEAD is $head12; the build ran against a different commit"
fi

# The API reads its commit out of .git, so this is the deployed tree saying
# what it is rather than this script asserting what it deployed.
say "8. Provenance"
running=$(curl -s -m 20 "$BASE/api/v1/meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["commit"])')
head=$(git -C "$ROOT" rev-parse HEAD)
printf '  git   %s\n  api   %s\n' "$head" "$running"
[ "$running" = "$head" ] || fail "the API reports a different commit than the checkout"

# The three sites this repository is a roof over. They are not deployed here
# and nothing above touches them, which is exactly why they are checked: a
# reload, a port, or a systemd unit that went in sideways shows up here and
# nowhere else in this script.
say "9. The sites this does not deploy"
for h in 6502.tinymachines.ai games.tinymachines.ai halfwave.tinymachines.ai; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://$h/" || echo 000)
  printf '  %-28s %s\n' "$h" "$code"
  [ "$code" = "200" ] || fail "$h answered $code; something in this deploy reached further than it should have"
done

say "Deployed."
