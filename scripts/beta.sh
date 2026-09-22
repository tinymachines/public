#!/usr/bin/env bash
# The beta follows: fast-forward, build, restart, verify. In that order, and
# never the restart without the build.
#
# beta.tinymachines.ai is this same repository served from a worktree of the
# `beta` branch at ../public-beta (deploy/tinymachines-beta-web.service says
# why a worktree). Until 2026-09-22 nothing kept the running beta at the
# commit the worktree was at: the branch was fast-forwarded by hand after each
# deploy, the build on disk was whatever last ran there, and the service was
# whatever last started. The owner opened beta and got NoFallbackError on
# every page added since, because `next start` was serving a build from the
# afternoon before with a process older than that.
#
# So this is the one command between the beta worktree and the beta being
# what it says. deploy.sh runs it last with --follow, after the push, so the
# beta is level with what just went live; run it by hand to serve whatever
# the worktree is at.
#
#   ./scripts/beta.sh            build the worktree as it is, restart, verify
#   ./scripts/beta.sh --follow   first fast-forward the worktree to this
#                                checkout's HEAD; refuses if that is not a
#                                fast-forward, because then beta has work
#                                main does not and the merge goes the other way
#   ./scripts/beta.sh --check    build only, nothing restarted
#
# It does not touch nginx, the API, or the live site. The beta shares the
# live API (its vhost proxies /api to the same service), so a change to the
# API is live or it is nowhere; this only ever moves the web half.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
BETA=${TM_BETA_TREE:-$ROOT/../public-beta}
UNIT=tinymachines-beta-web
PORT=6541
HOST=https://beta.tinymachines.ai

FOLLOW= ; CHECK_ONLY=
while [ $# -gt 0 ]; do
  case "$1" in
    --follow) FOLLOW=1 ;;
    --check)  CHECK_ONLY=1 ;;
    *) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n\033[1m== beta %s\033[0m\n' "$1"; }
warn() { printf '\033[33m   %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAILED (beta): %s\033[0m\n' "$1" >&2; exit 1; }

say "0. The worktree"
[ -d "$BETA/.git" ] || [ -f "$BETA/.git" ] || fail "no worktree at $BETA (git worktree add ../public-beta beta; the unit file has the rest)"
BETA=$(cd "$BETA" && pwd -P)
[ "$BETA" != "$(pwd -P)" ] || fail "this checkout IS the beta worktree; run it from the main checkout"
common() { realpath "$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)"; }
[ "$(common "$BETA")" = "$(common "$ROOT")" ] || fail "$BETA is not a worktree of this repository"
branch=$(git -C "$BETA" rev-parse --abbrev-ref HEAD)
[ "$branch" = "beta" ] || fail "the worktree is on $branch, not beta"
dirty=$(git -C "$BETA" status --porcelain)
printf '  %s at %s%s\n' "$BETA" "$(git -C "$BETA" rev-parse --short=12 HEAD)" "${dirty:+ (dirty)}"

if [ -n "$FOLLOW" ]; then
  say "1. Follow"
  [ -z "$dirty" ] || fail "the beta worktree has uncommitted changes; it is somebody's work in flight, not a thing to fast-forward over"
  from=$(git -C "$BETA" rev-parse --short=12 HEAD)
  to=$(git -C "$ROOT" rev-parse HEAD)
  # A fast-forward that lands somewhere else is not a refusal. With beta AHEAD
  # of main, `merge --ff-only main` returns zero and moves nothing, because
  # main is already an ancestor; the first version of this stage took that
  # zero as success and went on to build and serve beta's scratch commit
  # (2026-09-22). The fact to hold is where beta ends up, not what git said.
  git -C "$BETA" merge --ff-only -q "$to" 2>/dev/null || true
  if [ "$(git -C "$BETA" rev-parse HEAD)" = "$to" ]; then
    printf '  %s -> %s\n' "$from" "$(git -C "$BETA" rev-parse --short=12 HEAD)"
  else
    fail "beta at $from did not fast-forward to $(git -C "$ROOT" rev-parse --short=12 "$to"): it has commits this checkout does not. Merge beta into main first (git merge --ff-only beta), then deploy."
  fi
fi
HEAD=$(git -C "$BETA" rev-parse --short=12 HEAD)

# TM_BETA is read at build time: the bar on every page, and noindex on every
# page whatever it asked for (web/lib/seo.ts). A build without it is the live
# site's build in the beta's chair, which is exactly what one hand-run
# rebuild produced on 2026-09-22, and stage 4 below would have caught.
say "2. Build"
(cd "$BETA/web" && TM_BETA=1 bun run build) || fail "build: NOT restarting, the running beta is untouched"

if [ -n "$CHECK_ONLY" ]; then
  say "Built $HEAD, nothing restarted (--check)."
  exit 0
fi

say "3. Restart"
sudo systemctl restart "$UNIT"
START_WAIT=${TM_START_WAIT:-180}
started=$SECONDS
while :; do
  if curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/robots.txt" 2>/dev/null; then
    printf '  %s listening on %s after %ss\n' "$UNIT" "$PORT" $((SECONDS - started))
    break
  fi
  state=$(systemctl is-active "$UNIT" || true)
  [ "$state" = "active" ] || fail "$UNIT went $state while waiting for it to answer on 127.0.0.1:$PORT"
  [ $((SECONDS - started)) -lt "$START_WAIT" ] || fail "$UNIT never answered on 127.0.0.1:$PORT within ${START_WAIT}s (TM_START_WAIT raises it)"
  sleep 0.5
done

# Through nginx, as a reader arrives. The worker is stamped with the commit
# it was built from (web/scripts/build-sw.mjs), so the served worker naming
# this worktree's HEAD is the one fact that says the process is serving the
# build that was just made, and not the one it found on disk when it last
# started. The bar and the header are the two marks that say it is the beta
# and not the live site wearing its name.
say "4. Verify"
bad=0
for p in / /docs /nes /nes/play /nes/shelf /ja /ja/nes/shelf /robots.txt /sw.js; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$HOST$p" || echo 000)
  printf '  %-20s %s\n' "$p" "$code"
  [ "$code" = "200" ] || bad=$((bad + 1))
done
[ "$bad" -eq 0 ] || fail "$bad page(s) did not answer 200 on $HOST"

served=$(curl -s -m 20 "$HOST/sw.js" | grep -o -m1 -E '[0-9a-f]{12}' || true)
printf '  worker      %s\n  worktree    %s\n' "${served:-(unstamped)}" "$HEAD"
[ "$served" = "$HEAD" ] || fail "the beta serves a worker stamped ${served:-nothing}, the worktree is at $HEAD: the service is not serving this build"

curl -s -m 20 "$HOST/" | grep -q 'class="beta-bar"' || fail "the beta's home page has no beta bar: the build ran without TM_BETA=1"
curl -s -I -m 20 "$HOST/" | grep -qi '^x-robots-tag: noindex' || fail "the beta answers without its noindex header; the vhost is wrong, not the build"
printf '  the bar and the noindex header are both there\n'

say "Serving $HEAD."
