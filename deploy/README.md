# Deploying

Nothing here yet. See [`../START-HERE.md`](../START-HERE.md) step 1.

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
