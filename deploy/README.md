# Deploying

`tinymachines.ai.nginx` is the apex server block for step 1. **It is installed
and serving**, as of 2026-08-22, with `tinymachines-web.service` behind it on
127.0.0.1:6511. See "As built" below for what that changed.

These files are the source of truth. The copies under `/etc` are copies: edit
here, reinstall, `nginx -t`, reload.

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

## As built

The apex now serves the Next front end. Four things had to be answered first,
all four found by reading the running server rather than from the notes. The
specifics are host detail and live in `HOSTING.local.md`, which is gitignored.
In the open, the shape of them and what was decided:

- **There has to be something to point at.** The unit went in and was proved
  answering on 6511 before nginx was touched at all. nginx must never be
  pointed at a port with nothing on it.
- **The apex was not a static placeholder**, and it was not unauthenticated.
  It reverse-proxied elsewhere from behind an access gate. The owner decided
  to drop the gate, so the front door is now public. That was a decision, not
  a side effect.
- **The apex block did not live in a file of its own.** It shared a file with
  many other live vhosts that `../notes/inventory.md` does not list. The apex
  blocks were removed from that file and the apex given its own, which is an
  edit to a file other sites depend on. The trim was generated, then diffed
  against the live file and counted: lines removed only, none added, every
  other vhost still present.
- **A reload is server-wide**, across many vhosts, several unrelated to
  tinymachines. Every hostname on the box was probed before the change and
  again after, and the two lists compared. Exactly two lines differed, both
  of them the apex.

The certificate needed nothing: its SAN list already covered the bare apex.

### One bug this shipped with for about ten minutes

The first installed version sent **two `Cache-Control` headers** on every page,
because `add_header` adds rather than replaces and Next sends its own. The two
disagreed, and a shared cache combining them is free to resolve the result
either way. The fix is `proxy_hide_header Cache-Control` in the Next location,
so nginx's map is the only voice. It was found by reading the response headers
after the reload, which is the only reason it was found at all: nothing about
the config file looks wrong.

That is the general lesson worth keeping. `nginx -t` says the directives are
well formed. It does not say the site behind them behaves.
