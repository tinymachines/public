# What already exists, and where

Written from a survey of the running machine on 2026-08-22, not from memory.
Everything here was checked rather than recalled; where a thing turned out to
be different from what it looked like, that is recorded too.

**No host-specific detail lives in this file.** Addresses, zone paths and the
local runbook belong in `deploy/HOSTING.local.md`, which is gitignored. The
same split the 6502 repo already keeps.

## The six pieces

| | what it is | where the source is | how it ships |
|---|---|---|---|
| **halfphi** | The switch-level engine: die-data parser, netlist, solver. Names no chip, embeds no die data, and is **MIT** for exactly that reason. Loads the 6502, the 6800 and the Z80 through identical calls. | `~/projects/tinymachines/halfphi`, public at `tinymachines/halfphi` | a Rust crate |
| **6502 info site** | The explorer: WebGL2 die renderer, ~25 derived container kinds, the chip map, the primer, the labs, the measured tables. Plain ES modules, no framework. | `~/projects/tinymachines/6502/web` | `tools/build-web.py` into a content-hashed `dist/`, nginx serves a release symlink |
| **6502 API** | Stateless HTTP over the real chip: the whole machine travels in every request. FastAPI + Pydantic, plus the chip atlas, the cartridge mint and an MCP endpoint. | `~/projects/tinymachines/6502/service` | uvicorn on `127.0.0.1:6502`, `--root-path /api` |
| **halfwave** | The warm engine process the API talks to: a line protocol, one parsed netlist, one machine, zero dependencies. Plus a reviewer-built lab on its own property. | `~/projects/tinymachines/6502/crates/v6502-sim/src/bin/halfwave.rs`, lab in `docs/halfwave-lab/` | `cargo build --release -p v6502-sim --bin halfwave` |
| **Die Runner console** | The game front end: a 6502 ROM, a page of its memory as the screen, the browser drawing it. Cartridges, builder pages, the editor. | `~/projects/tinymachines/6502/games` | rsync of static ES modules |
| **Die Runner API** | Not a separate service. The cartridge mint, the console spec and the registry are routes on the **same** FastAPI app. | `~/projects/tinymachines/6502/service` | as the 6502 API |

The last row matters for planning: there is **one** Python service, not two.

## What is deployed today

| host | what | served by |
|---|---|---|
| `tinymachines.ai` | **a placeholder**: the apex currently just points at the GitHub org | nginx |
| `6502.tinymachines.ai` | the info site, `/api/` proxied to uvicorn, `/archive/` aliased | nginx + `6502-api.service` |
| `games.tinymachines.ai` | the console, builder pages, `/api/` proxied to the same uvicorn | nginx |
| `halfwave.tinymachines.ai` | the reviewer's lab, with its own `/api/` proxy to the same engine | nginx |

**The apex and `www` already have A records.** No DNS work is needed to stand
`tinymachines.ai` up; the certificate for `www.tinymachines.ai` exists too.
That is the one piece of infrastructure already in place.

`127.0.0.1:6502` is held by the live API. **6503, 6510 and 6520 are free.**
A local uvicorn started on 6502 fails to bind and every request then silently
goes to production; that mistake has already been made once here, so check
`ss -ltn` before believing a local server is yours.

## Things that are not what they look like

- **MDX is configured on bradley.io and there are zero `.mdx` files.** The
  Next config lists `md` and `mdx` in `pageExtensions` and `@next/mdx` is a
  dependency, but nothing in the tree uses it. So "we are MDX" is true of the
  toolchain and not of the content. Worth knowing before choosing a docs
  stack on the strength of it.
- **bradley.io is Next 16 + React 19 + Tailwind 4, built with `bun`.** It has
  an `app/6502` route already, and about a dozen `app/api/*/route.ts`
  handlers. If tinymachines.ai wants to share components or a design system
  with it, that is the stack to match; if it wants to share a *deployment
  story* with the 6502 work, it is not.
- **The 6502 site has no build step in development and a real one in
  production.** `web/` is served directly; `dist/` is content-hashed with a
  service worker. Develop against `web/`, never `dist/`.
- **`deploy.sh` runs under systemd**, whose `PATH` does not include nvm. A
  script that works in a shell can die under the unit on a `node` that is
  five major versions old. The 6502 deploy resolves a node itself for exactly
  this reason.

## The build-from-source path

The instruction is reinstall and build, never copy. For the 6502 stack that
means, in order:

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
git clone --recurse-submodules https://github.com/tinymachines/6502
cargo build --release -p v6502-sim --bin halfwave     # the engine
wasm-pack build crates/v6502-wasm --target web --out-dir ../../web/pkg
cargo run -p v6502-netlist --bin export-layout -- web/layout.bin
# ... six more exporters, then:
node tools/export-groups.mjs                          # web/groups.json
python3 tools/build-web.py web dist
```

`extern/visual6502/` is a **git submodule** and must be initialised, or the
build has no die data to parse. Nothing generated is committed in that repo
either, so a fresh clone genuinely has to build.
