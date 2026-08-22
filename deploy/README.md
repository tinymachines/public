# Deploying

`tinymachines.ai.nginx` is the apex server block for step 1. **It is written
but not installed**, and it should not be installed until something answers on
127.0.0.1:6511. See "Before this is installed" below.

See [`../START-HERE.md`](../START-HERE.md) step 1.

## Rules that already apply

- **Build from source, never copy artefacts.** `../notes/inventory.md` has the
  6502 build order, including the submodule that must be initialised first.
- **No host-specific detail in this repository.** Addresses, zone paths and the
  local runbook go in `deploy/HOSTING.local.md`, which is gitignored. Loopback
  ports are fine.
- **Three live sites must keep working.** `6502.`, `games.` and `halfwave.`
  are serving today. An nginx error takes the whole server's reload with it, so
  `nginx -t` and then verify each of the three.
- **One `add_header` in a location discards every inherited one.** Declare the
  complete set or declare none.
- **A deploy script runs under systemd's `PATH`**, which has no nvm in it.
  Resolve interpreters explicitly; `/usr/bin/node` on this host is v12.
- The apex and `www` already have A records, and a certificate exists for
  `www.tinymachines.ai`. No DNS work is needed to stand the site up.

## Before this is installed

Four things were found by reading the running server, and each one has to be
answered before `tinymachines.ai.nginx` goes anywhere near a reload. The
specifics are host detail and live in `HOSTING.local.md`, which is gitignored.
In the open, the shape of them:

- **There is nothing to point at yet.** `web/` is a README and a stylesheet.
  Nothing listens on 6511 or 6510. Repointing the apex today swaps a page that
  works for a 502. This is the blocker; the rest are decisions.
- **The apex is not a static placeholder**, and it is not unauthenticated.
  What it proxies to and what guards it are both things the new site has to
  either keep or deliberately replace.
- **The apex block does not live in a file of its own.** It shares a file with
  several other live vhosts that `../notes/inventory.md` does not list. Giving
  the apex its own file is the right move and it is an edit to a file other
  sites depend on.
- **A reload is server-wide**, across many vhosts, several unrelated to
  tinymachines. `nginx -t` gates the reload, but a certificate that does not
  cover the apex fails in the browser rather than at test time.

The file parses. `nginx -t` against it in isolation, with a throwaway
certificate standing in for the real one, reports `syntax is ok`; the only
remaining failure is the pid file, which needs root. That is a syntax check and
not a deployment: it says the directives are well formed, not that the site
behind them works.
