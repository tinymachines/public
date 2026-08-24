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
#   ./scripts/deploy.sh -m "what changed"   bump, commit, build, deploy, push
#   ./scripts/deploy.sh                     a clean tree: build, deploy, push
#   ./scripts/deploy.sh --check             every gate and the build, no more
#   ./scripts/deploy.sh --minor|--major     bump that digit instead of patch
#   ./scripts/deploy.sh --no-push           everything except the push
#   ./scripts/deploy.sh --dirty             deploy uncommitted work, see below
#
# ## What it does with the tree
#
# A DIRTY tree needs -m and gets committed: the version is incremented, VERSION
# and web/package.json are written, and everything is committed with that
# message. Without -m it refuses rather than inventing one. A commit message in
# this repository is where the reason for a change lives, and a generated
# "deploy 2026-08-23" is a line that will be read later by somebody trying to
# find out why.
#
# A CLEAN tree is not bumped and not committed. The version counts changes that
# were deployed, so redeploying the same code twice must not move it, or the
# number stops meaning anything.
#
# ## Why it refuses a dirty tree without a message
#
# The API reads its own commit out of .git and reports it at /v1/meta, and a
# stage below holds the running service to it. With uncommitted changes the
# service runs code that no commit contains while reporting a commit that is
# not what is running, and a service that misreports what it is, is worse than
# one that is out of date. --dirty is there for iterating and says so on the
# way past.
#
# ## The order, which is not obvious anywhere else
#
# Bump, commit, build, restart, verify, THEN push. The build stamps
# public/sw.js with the current commit, because a browser installs a new
# service worker only when the file's bytes change, so committing has to come
# first. And the push comes last so that origin only ever receives a commit
# that has been deployed and verified: a failed deploy leaves the commit local,
# where it can be amended.
#
# It does NOT touch nginx. A reload there is process wide across 37 files, 80
# server blocks and 58 server names on this box, most of them nothing to do
# with tinymachines, so it stays a deliberate act with `nginx -t` in front of
# it and a before/after sweep of every hostname behind it. See
# deploy/README.md.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

CHECK_ONLY= ; ALLOW_DIRTY= ; NO_PUSH= ; BUMP=patch ; MESSAGE=
while [ $# -gt 0 ]; do
  case "$1" in
    --check)   CHECK_ONLY=1 ;;
    --dirty)   ALLOW_DIRTY=1 ;;
    --no-push) NO_PUSH=1 ;;
    --minor)   BUMP=minor ;;
    --major)   BUMP=major ;;
    -m)        shift; MESSAGE="${1:-}"; [ -n "$MESSAGE" ] || { echo "-m needs a message" >&2; exit 2; } ;;
    -m*)       MESSAGE="${1#-m}" ;;
    *) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
warn() { printf '\033[33m   %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

say "0. The tree"
DIRTY=$(git -C "$ROOT" status --porcelain)
BUMPED=
PENDING_COMMIT=

# Put the version back if this run does not reach its commit. Without it a
# failed check leaves VERSION and package.json ahead of the tree, so the next
# run bumps again from the bumped value and the numbering skips.
restore_version() {
  [ -n "$PENDING_COMMIT" ] || return 0
  # Written back to the value this run started from, rather than checked out of
  # git. A checkout would also discard an edit to either file that somebody
  # else made and this script never touched.
  printf '%s\n' "$WAS_VERSION" > "$ROOT/VERSION"
  python3 -c 'import json,pathlib,sys
p = pathlib.Path(sys.argv[1]) / "web" / "package.json"
d = json.loads(p.read_text())
d["version"] = sys.argv[2]
p.write_text(json.dumps(d, indent=2) + chr(10))' "$ROOT" "$WAS_VERSION"
  printf '\n  version put back to %s: this run did not reach its commit\n' \
    "$WAS_VERSION" >&2
}
trap restore_version EXIT

if [ -n "$DIRTY" ] && [ -z "$CHECK_ONLY" ] && [ -z "$ALLOW_DIRTY" ]; then
  if [ -z "$MESSAGE" ]; then
    printf '%s\n' "$DIRTY" | sed 's/^/     /'
    fail "uncommitted changes and no -m. Say what changed, or pass --dirty to deploy without committing."
  fi

  # The version, incremented here and nowhere else. Parsed back out of the
  # file rather than tracked separately, so the file is the state.
  cur=$(tr -d '[:space:]' < "$ROOT/VERSION")
  case "$cur" in
    *.*.*) : ;;
    *) fail "VERSION is '$cur', which is not a semver" ;;
  esac
  IFS=. read -r MA MI PA <<EOF
$cur
EOF
  case "$BUMP" in
    major) MA=$((MA + 1)); MI=0; PA=0 ;;
    minor) MI=$((MI + 1)); PA=0 ;;
    patch) PA=$((PA + 1)) ;;
  esac
  NEXT="$MA.$MI.$PA"
  WAS_VERSION="$cur"
  printf '%s\n' "$NEXT" > "$ROOT/VERSION"

  # package.json carries the same number, and a test holds the two together.
  # Written with python rather than sed because a JSON file edited by regex is
  # a JSON file that eventually stops parsing.
  python3 - "$ROOT" "$NEXT" <<'PY'
import json, pathlib, sys
root, nxt = pathlib.Path(sys.argv[1]), sys.argv[2]
p = root / "web" / "package.json"
d = json.loads(p.read_text())
d["version"] = nxt
p.write_text(json.dumps(d, indent=2) + "\n")
PY

  printf '  %s -> %s (%s)\n' "$cur" "$NEXT" "$BUMP"
  BUMPED=1
  # NOT committed here, and that is a repair rather than a preference.
  #
  # The commit used to happen at this point, before a single check had run. A
  # failing test therefore left a committed, version-bumped revision that was
  # never deployed, and the next run committed the fix under a second commit
  # with the same message: two identical subjects in the log, one of them
  # naming a version nothing ever served.
  #
  # The version files are written now because the build reads them, a test
  # holds VERSION and package.json together, and the footer reports what it was
  # built with. So they are written, the checks run against them, and the
  # commit happens after the build. Anything that fails in between restores
  # both files on the way out, below.
  PENDING_COMMIT=1

elif [ -n "$DIRTY" ]; then
  warn "uncommitted changes: the service will report a commit that is not what is running"
  printf '%s\n' "$DIRTY" | sed 's/^/     /'
else
  printf '  clean at %s, version %s\n' \
    "$(git -C "$ROOT" rev-parse --short=12 HEAD)" "$(tr -d '[:space:]' < "$ROOT/VERSION")"
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

# Everything has passed, so the revision is worth recording. See stage 0 for
# why this is here and not there.
if [ -n "$PENDING_COMMIT" ]; then
  say "4b. Commit"
  git -C "$ROOT" add -A
  git -C "$ROOT" commit -q -m "$MESSAGE" || fail "nothing to commit after staging, which should not happen"
  PENDING_COMMIT=
  printf '  committed %s\n' "$(git -C "$ROOT" rev-parse --short=12 HEAD)"

  # The service worker is stamped with the commit it was built from, and the
  # build ran one line above this, when that commit did not exist yet. So it
  # carries the PREVIOUS head, and stage 7 catches exactly that.
  #
  # A browser installs a new worker only when the file's bytes change, so the
  # stamp is what makes a deploy replace an installed one. Restamping here is
  # the whole fix: sw.js is generated and gitignored, so writing it after the
  # commit leaves the tree clean, and nothing else in the build embeds the
  # revision.
  (cd web && bun scripts/build-sw.mjs) || fail "restamping the service worker"
  printf '  worker restamped at %s\n' "$(git -C "$ROOT" rev-parse --short=12 HEAD)"
fi

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
# The project's own surfaces are in this list too. They were not, and the
# stage was checking the roof while five migrated pages went unverified: a
# route that fails to build is caught by check-build, but a route that builds
# and then 404s behind nginx is only caught out here.
#
# /6502/builders/nobody is deliberate. It is the dynamic route, and it answers
# 200 whether or not anybody has that handle, because the registry is read in
# the browser and the frame is this site's own. A real handle here would make
# our deploy depend on a row in somebody else's database.
for p in / /docs /docs/6502 /style /style/zoo /admin /icon.svg /apple-icon.png /robots.txt \
         /6502 /6502/explorer /6502/games /6502/lab /6502/builders /6502/builders/nobody /6502/api \
         /hotbits /hotbits/api \
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
# The redirect map. A moved public path is not moved until the old one lands
# somewhere, and next.config.ts is the only place that is written down. 308
# rather than 301: the method is preserved, which matters because these are
# addresses the registry itself hands out.
say "6a. The redirect map"
for p in /6502/b /6502/b/tinymachines; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$p" || echo 000)
  to=$(curl -s -o /dev/null -w '%{redirect_url}' -m 20 "$BASE$p" || echo "")
  printf '  %-28s %s -> %s\n' "$p" "$code" "${to:-nowhere}"
  [ "$code" = "308" ] || fail "$p answered $code; expected a 308 to /6502/builders"
done

# The policy, checked from outside against what the app actually talks to.
#
# Every page here that reads live data fetches it from another origin, and the
# apex CSP names which ones are allowed. Those two lists are in different files
# and nothing held them together: the hotbits pages shipped fetching an origin
# connect-src did not admit, and the failure is the quiet kind, a page that
# renders its own "could not be read" and looks like the far service is down.
#
# A warning rather than a failure, and deliberately. This script does not touch
# nginx: a reload there is process-wide across every site on the box, so it
# stays a deliberate act with `nginx -t` in front of it. Failing the deploy for
# something the deploy is not allowed to fix would only mean nothing ships.
say "6c. The policy"
if ! python3 - "$BASE" <<'POLICY'
import json, pathlib, subprocess, sys, urllib.parse

base = sys.argv[1]
head = subprocess.run(["curl", "-sD-", "-o", "/dev/null", "-m", "20", base + "/"],
                      capture_output=True, text=True).stdout
csp = ""
for line in head.splitlines():
    if line.lower().startswith("content-security-policy:"):
        csp = line.split(":", 1)[1]

allowed = set()
for part in csp.split(";"):
    part = part.strip()
    if part.startswith("connect-src"):
        allowed = set(part.split()[1:])

want = set()
for proj in json.loads(pathlib.Path("data/projects.json").read_text())["projects"]:
    for s in proj["surfaces"]:
        u = urllib.parse.urlparse(s["serves_today"])
        if u.scheme and u.netloc and u.netloc != "tinymachines.ai":
            want.add(f"{u.scheme}://{u.netloc}")

# Both of these mean the check is broken rather than the policy being wrong,
# and a check that can pass on nothing is not a check. They exit 2, which the
# caller treats as a failure, because they are this repository's to fix.
if not want:
    print("  no off-origin surface in data/projects.json; this would pass on nothing")
    sys.exit(2)
if not allowed:
    print("  the live response carries no connect-src; this would pass on nothing")
    sys.exit(2)

missing = sorted(o for o in want if o not in allowed)
for o in sorted(want):
    print(f"  {'ok  ' if o in allowed else 'MISS'} {o}")
if missing:
    print()
    print("  connect-src does not admit: " + ", ".join(missing))
    print("  A page fetching one of those renders its own refusal, which reads")
    print("  as the far service being down. Fix it by hand, deliberately:")
    print("    sudo install -m 644 -o root -g root \\")
    print("      deploy/tinymachines.ai.nginx \\")
    print("      /etc/nginx/sites-available/tinymachines.ai.apex.nginx")
    print("    sudo nginx -t && sudo systemctl reload nginx")
POLICY
then
  fail "the policy check could not run; see above"
fi

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

# Last, deliberately. origin only ever receives a commit that has been
# deployed and verified, so a failed deploy leaves the commit local where it
# can still be amended. Nothing above this line depends on the push, and a push
# that fails does not undeploy anything.
say "10. Push"
if [ -n "$NO_PUSH" ]; then
  printf '  skipped (--no-push)\n'
elif ! git -C "$ROOT" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  warn "no upstream for this branch; nothing pushed"
else
  ahead=$(git -C "$ROOT" rev-list --count '@{u}'..HEAD)
  if [ "$ahead" = 0 ]; then
    printf '  nothing to push\n'
  else
    printf '  %s commit(s)\n' "$ahead"
    git -C "$ROOT" push -q origin HEAD || fail "push failed; the deploy stands, the commit is local"
    printf '  pushed to %s\n' "$(git -C "$ROOT" rev-parse --abbrev-ref '@{u}')"
  fi
fi

if [ -n "$BUMPED" ]; then
  say "Deployed $(tr -d '[:space:]' < "$ROOT/VERSION")."
else
  say "Deployed."
fi
