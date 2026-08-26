# Modules and dependencies

Surveyed from the tree and the running box on 2026-08-26, at 1.0.103. Every
count and path here was read, not remembered; where a thing is measured by a
script, the script is named so the number can be re-derived. Nothing
host-specific is in this file (addresses and zone paths stay in
`deploy/HOSTING.local.md`).

The last section is the one this document exists for: **the engine edge**,
how halfphi reaches this site, who tests it, and the rule that only a tested
version is boarded.

## The five sub-projects, and which repository each lives in today

`CLAUDE.md` decided that everything moves under this project as five
sub-projects, along the licence line. Where each one is right now:

| sub-project | lives in | licence | reaches this repo as |
|---|---|---|---|
| **halfphi**, the switch-level engine | `tinymachines/6502` at `crates/halfphi` (developed), mirrored to `tinymachines/halfphi` (published). No die data, no dependencies | MIT | never compiled here; served through the 6502 project's build (below) |
| **the 6502 engine**: `v6502-netlist`, `v6502-sim` (halfwave), `v6502-wasm` | `tinymachines/6502`, over the `extern/visual6502` submodule | MIT code over CC BY-NC-SA data | the release directory nginx aliases at `/6502/chip/`; the halfwave process behind `/6502/api` |
| **the API**: chip, atlas, cartridge mint, registry, MCP | `tinymachines/6502/service`, uvicorn on 6502 | NC-SA travels | proxied at `/6502/api`; `api/mint.py` imports `registry.py` from that checkout |
| **games**: the console, the cartridge format, builder pages | `tinymachines/6502/games`; the console's six modules are **copied** into `web/public/6502/games/` here | NC-SA travels | committed copies, two of them patched (see "Edges out") |
| **the lab page, the main site** | this repository | per `NOTICE.md`, decided as they land | the whole of `web/` and `api/` |

## This repository, by directory

| directory | what it is | runs where |
|---|---|---|
| `web/` | the site: Next 16.3.2, React 19.2.8, Tailwind 4, MDX; `bun`. Serves `/`, `/ja`, `/docs`, `/6502/*`, `/hotbits`, `/style`, `/admin` | `127.0.0.1:6511` behind nginx |
| `api/` | the roof's API: FastAPI, Pydantic, one SQLite file. REST and MCP from one set of models | `127.0.0.1:6510` at `/api` |
| `style/` | the design system: `tokens.css` (the owner's `@theme`), `components.css`, the zoo, and five Python checks | build time and deploy gates |
| `data/` | the facts that are typed once: `pieces.json`, `projects.json`, `chip.json`, `ja.json`, `engine.json`; plus the scripts that check prose against them | read by `web/lib` and `api/` at build and start |
| `docs/` | the documentation tree, markdown; `web/lib/docs.ts` walks it | prerendered at `/docs` |
| `projects/6502/` | the two upstream things carried here by file: the Halfwave Lab's HTML, and the Wayback drip (`drip.py`) | lab at build time; drip by hand or a timer |
| `deploy/` | the nginx server block and two systemd units, source of truth for the copies under `/etc` | installed by hand |
| `scripts/` | `deploy.sh`, the one command between a change and it being live; `board-engine.py`, the engine gate | by hand |
| `notes/` | the survey, the plans, the console pack's issues, this file | read by people |
| `assets/` | the halfphi mark | `web/app/components/Halfphi.tsx` |

### `web/`: the modules and what depends on what

Read from the import statements (`grep -oE 'from "(@/lib/|\.\.?/)…"'` over
`lib/` and `app/`), not from memory. Nearly every page imports `lib/lang` and
`lib/seo`; those edges are left out below to keep the shape readable.

```
app/[lang]/layout.tsx ─────────── lib/tokens, lib/i18n
app/[lang]/page.tsx ───────────── lib/chip, lib/pieces, lib/projects, lib/nav
app/[lang]/docs/** ────────────── lib/docs, lib/i18n
app/[lang]/6502/page, learn, cart, tools ── lib/projects, lib/i18n, lib/tracks, lib/docs, lib/explorer-menu
app/[lang]/6502/explorer, [page] ─ lib/explorer, lib/explorer-menu ── ../../6502/web/*.html, style.css   (BUILD-TIME READ)
app/[lang]/6502/lab ───────────── lib/lab ── projects/6502/lab/halfwave-lab.html
app/[lang]/6502/api ───────────── lib/apidoc ── ../../6502/service/api.html                              (BUILD-TIME READ)
app/[lang]/6502/games ─────────── shell/Shell, shell/Kit ── lib/shell/{solve,geom}; ConsoleDriver ── consoleState
                                  public/6502/games/{game,console,art,chr,registry,manage}.js            (COPIED, two patched)
app/[lang]/6502/builders, manage ─ lib/registry (types only; data fetched in the browser from the chip API)
app/[lang]/6502/cart/{brief,skill}.md ── lib/brief ── docs/6502/*.md, lib/brief-token
app/[lang]/hotbits/** ─────────── lib/projects
app/[lang]/style, style/zoo ───── style/STYLE.md, lib/zoo ── style/zoo.html
app/[lang]/admin ──────────────── components/AdminConsole (talks to /api in the browser)
app/og/[[...path]] ────────────── lib/card ── lib/registry, public/6502/games/chr.js
app/sitemap, robots, manifest ─── lib/docs, lib/explorer, lib/seo, lib/tokens
components/SiteFrame ──────────── lib/nav ── lib/docs, lib/explorer-menu, lib/explorer, lib/tracks, lib/projects
components/Halfphi ────────────── lib/pieces ── data/pieces.json
components/TwoWaysDemo ────────── public/engine/tm6502.mjs (runtime, in the browser)
lib/i18n, lib/lang ────────────── data/ja.json
lib/pieces, lib/projects, lib/chip ── data/{pieces,projects,chip}.json
lib/tokens ────────────────────── style/tokens.css
```

Three modules are the trunk: `lib/nav.ts` (the whole navigation model,
derived), `lib/i18n.ts` + `lib/lang.ts` (the one overlay), and
`lib/projects.ts` (the surfaces and both of their addresses). Everything with
a menu, a crumb, a title or a Japanese edition goes through them.

`web/scripts/` runs before `next build`: `build-icon.py` (icons from the
tokens), `build-sw.mjs` (the worker, stamped with the commit), `build-lab.mjs`
(the lab's assets, content-hashed), `pull-chipdocs.mjs` (four generated
documents from `../6502/docs`, gitignored here because their schematics are
die-trace data), then `check-build.mjs` after it (output checks on the HTML
that was generated). `shell-sheets.ts` draws the console's paper sheets and is
not part of the build.

`web/e2e/` is 11 Playwright specs run against the live site
(`bun run e2e`, or `deploy.sh --e2e`).

### `api/`: the modules

| module | what | depends on |
|---|---|---|
| `app.py` | the app, the index, `/health`, `/v1/meta`, pieces, projects, status, HEAD-as-GET, CORS | everything below |
| `models.py` | the Pydantic models: they validate the requests **and** generate `openapi.json` | pydantic |
| `pieces.py`, `projects.py` | the six pieces and the surfaces, loaded from `data/*.json`, validated against the models | `data/pieces.json`, `data/projects.json` |
| `probe.py` | reachability, measured; 30 s cache | httpx, the three subdomains and hotbits |
| `mcp_server.py` | three tools over the same implementations | `app`'s route functions |
| `db.py` | one SQLite file, migrations by `PRAGMA user_version`, refuses a newer file | `$STATE_DIRECTORY` or `TM_DB` |
| `keys.py`, `admin.py`, `users.py` | dev keys (shown once, digest stored), the administered surface, the person table | `db` |
| `auth.py` | sign in with GitHub; the registry tokens an account holds | `admin.connection`, `mint`, GitHub OAuth (secret in the unit's environment, never here) |
| `mint.py` | the public token mint: imports the registry's own `mint_token` from the 6502 checkout | `TM_REGISTRY_SERVICE` (a directory on `sys.path`), `TM_REGISTRY_DB` (a file), `chip` |
| `chip.py` | three loopback calls to the chip API: claim a page, publish the starter | `TM_CHIP_API` (`127.0.0.1:6502`) |
| `provenance.py`, `release.py` | the commit, read out of `.git`; the version, read out of `VERSION` | the filesystem, never a subprocess |

Tests: `test_api.py` 39, `test_admin.py` 32, `test_mint.py` 12,
`test_auth.py` 10; `projects/6502/archive/test_drip.py` 13. `conftest.py`
points `TM_DB` at a temp file and refuses to run otherwise.

### Third-party dependencies, the complete list

The web runtime is `next`, `react`, `react-dom`, `@next/mdx`,
`@mdx-js/loader`, `@mdx-js/react`, `gray-matter`, `remark-frontmatter`,
`remark-gfm`, plus `@types/mdx` (ten, `web/package.json`). Dev only: `@playwright/test`,
`tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`,
`typescript`, and the `@types`. `bun.lock` pins the rest.

The API is `fastapi`, `uvicorn`, `pydantic`, `httpx`, and `pytest` for tests
(`api/requirements.txt`, versions recorded there off the host's interpreter).
Every script in `style/`, `data/` and `scripts/` is the standard library
only.

halfphi has **no dependencies** (`[dependencies]` is empty in both copies of
its `Cargo.toml`); that and the absence of die data are what make it MIT. The
6502 workspace's third-party crates are its `Cargo.lock`'s business, not
this repository's.

## Edges out of this repository, and what holds each one

A fact this site serves that it does not own arrives over one of these edges.
The check column is what fails when the edge drifts; "nothing" is written
where that is the case, because a gap that is written down is one somebody
can close.

| edge | mechanism | when | held by |
|---|---|---|---|
| explorer pages and stylesheet | `lib/explorer.ts` reads `../6502/web/*.html`, `style.css` | build | `check-build.mjs` (the DOM contract), `deploy.sh` stage 6 sweeps every page; `board-engine.py --check` holds the tree to the boarded commit |
| explorer modules, wasm, die data | nginx `alias` of the 6502 release directory at `/6502/chip/` | request | `board-engine.py --check` compares the release's `build-info.json` commit to the boarded one |
| the chip API, halfwave | nginx proxies `/6502/api/` to `127.0.0.1:6502` | request | `deploy.sh` stage 6 (the door answers); `board-engine.py --check` holds the binary's digest |
| the chip's two figures | `data/chip.json`, re-derived by `data/verify-chip.py` from `/v1/meta` | by hand | `data/check-figures.py` scans the prose for stray digits |
| the API reference | `lib/apidoc.ts` reads `../6502/service/api.html` | build | throws when the document stops matching its transforms |
| the chip documents | `pull-chipdocs.mjs` reads `../6502/docs/*.md` | build | throws on an unrecognised shape |
| the console's modules | six files copied into `web/public/6502/games/`, `game.js` and `registry.js` patched (the API base and one link, both commented in the file) | by hand | `check-build.mjs` holds the page to `game.js`'s selectors. **Nothing records which upstream commit the copies came from**: neither file matches any commit in `../6502`'s history of that path, because the patch is applied on top |
| the registry | `api/mint.py` imports `registry.py` from `TM_REGISTRY_SERVICE` and opens `TM_REGISTRY_DB` | request | the import is named at the top of `mint.py` so a rename fails loudly; `test_mint.py` |
| the lab | `projects/6502/lab/halfwave-lab.html`, a copy, byte for byte | build | `lib/lab.ts` throws when a substitution finds nothing |
| the archive | `projects/6502/archive/drip.py` pulls from the Wayback Machine to `TM_ARCHIVE`, never into the tree | by hand | `.gitignore`, anchored by name |
| the four public hosts | `probe.py` measures them | request, cached 30 s | reported, never asserted |

## The engine edge

This is the one the rest of the document is scaffolding for.

### Two copies of halfphi, one mechanism between them

halfphi is developed in `tinymachines/6502` at `crates/halfphi`, beside the
chip it was extracted from and against the three chips its test loads. It is
published at `tinymachines/halfphi` on its own, where it can be MIT because
it embeds no die data. Five files are shared verbatim
(`src/lib.rs`, `src/source.rs`, `src/netlist.rs`, `src/engine.rs`,
`tests/chips.rs`); `6502/tools/check-halfphi.mjs` compares them and that
project's `deploy.sh` refuses to publish on a difference. On 2026-08-26 the
two are identical, at `6502@15e5717` and `halfphi@424ce03`.

Both say `version = "0.1.0"`. The standalone repository has **no tags** and
the crate is **not on crates.io** (`crates.io/api/v1/crates/halfphi` answers
"does not exist"). So today a version of halfphi is a commit, not a number,
and the digest of the five shared files is what tells two builds apart.

### How the engine reaches a page

```
crates/halfphi ──► v6502-netlist (parses extern/visual6502) ──► v6502-sim ──► halfwave (binary)
                                                             └─► v6502-wasm ──► web/pkg (wasm-pack)
6502/deploy/deploy.sh: exporters, wasm-pack, build-web.py ──► /var/www/.../releases/<stamp>/ ──► current
                                                                                                   │
tinymachines.ai (this repo):                                                                       │
   nginx  /6502/chip/  ──── alias ─────────────────────────────────────────────────────────────────┘
   nginx  /6502/api/   ──── proxy ──► 6502-api.service (uvicorn :6502) ──► HALFWAVE_BIN
   next build           ──── reads ──► ../6502/web/*.html (the pages those modules were written against)
```

Three measurements therefore say which engine this site is running: the
commit the served release was built from (`current/build-info.json`), the
digest of the halfwave binary the 6502 unit names, and the commit the working
tree is at. They can disagree with each other, and on the day of the survey
they did: the release `v0.235` was built from `ed8030f`, the checkout was at
`15e5717` (three commits on), and the halfwave binary's mtime
(2026-08-23 22:05 UTC) predates the release commit (23:21 UTC). None of that
was a failure anyone could see, which is the point.

### Who tests the engine today

| where | what runs | when |
|---|---|---|
| `tinymachines/halfphi` on GitHub | CI: `cargo test` on stable and the 1.75 MSRV with `HALFPHI_REQUIRE_CHIPS=1`, fmt, clippy `-D warnings`, `cargo doc`. Three runs, all green, latest 2026-08-23 | every push |
| `tinymachines/6502` | `cargo test --workspace` (91 tests: netlist, functional, golden differential against the reference JavaScript engine, state, timing, interrupts), `pytest service/` (174). **No CI, and `deploy/deploy.sh` runs none of them**: it builds, exports, checks halfphi parity, and publishes | by hand |
| this repository | nothing, until `scripts/board-engine.py` | |

So the mirror's CI proves the published halfphi builds and loads three chips,
and nothing between a 6502 commit and its release proves the 6502 engine.
The roof was serving whatever the release directory held.

### The boarding rule

**A version of the engine is boarded when its suites have been run here and
passed, and the record says so. The roof deploys against nothing else.**

`scripts/board-engine.py --board` runs, in the 6502 checkout, `cargo test -p
halfphi` with `HALFPHI_REQUIRE_CHIPS=1` and `cargo test -p v6502-sim` with
`V6502_REQUIRE_GOLDEN=1`, refuses a dirty checkout, and writes
`data/engine.json` only when every suite passed. The record holds the commit,
the halfphi crate version and the digest of its five shared files, whether
the standalone copy is identical and at what commit, the halfwave binary's
digest, the served release's commit, and each suite's counts and time. Nothing
host-specific is in it.

`scripts/board-engine.py --check` is `deploy.sh` stage 2e. It measures the
same three things and refuses when any of them is not the boarded one:

- the served release was built from a different commit
- the halfwave binary's digest changed (a rebuild, boarded or not)
- the 6502 working tree, which the build reads pages from, is elsewhere or dirty
- halfphi's shared sources differ from the boarded digest, or from the
  standalone copy

It **skips**, and says so, on a box with no 6502 checkout beside this one, so
a fresh clone of this repository still builds; `TM_REQUIRE_ENGINE=1` makes
that a failure.

Two things about "tested" were checked rather than assumed. Under `cargo test`
a skipped test's message is captured and it counts as passed, so both suites
are run with their require flags: hiding the golden oracle makes the board
refuse and record nothing (done on 2026-08-26 to prove it). And the rule is
the registry's, that the thing which publishes must not be the thing which
claims: the mirror's green CI and the 6502 project's own runs are not read;
the suites run here, on the checkout about to be served.

First record, 2026-08-26: 6502 `15e5717`, halfphi 0.1.0
(`1792a2467e8b`), halfwave `356c12d589fa`, 39 tests passed in 9 s. The check
then fails on the release lag noted above, which is correct: the roof will
not deploy until the 6502 project releases `15e5717` or the owner boards
`ed8030f` deliberately. Releasing is that project's deploy, not this one's.

### What the rule cannot see yet, and the proposals upstream

Each of these is a change in `tinymachines/6502`, so each is a proposal here
and not an action.

1. **halfwave has no `--version`.** The binary's provenance is a digest and
   an mtime; nothing in it says which commit built it, so a binary older than
   the release it serves beside can only be caught by the digest changing.
   Proposal: halfwave prints the workspace version and the commit it was
   built from (`env!` at build time), and `/v1/meta` on the chip API reports
   it. The roof's check then compares a stated commit rather than a digest.
2. **The 6502 deploy runs no tests.** Proposal: `deploy/deploy.sh` runs
   `cargo test --workspace` with both require flags before the exporters, and
   writes the counts into `build-info.json` beside the commit. The roof's
   record would then be a second witness rather than the only one.
3. **halfphi releases are commits.** When the 6502 project starts releasing
   halfphi, a release is a tag on both repositories at the same shared-file
   digest, and a `CHANGELOG.md` entry. `board-engine.py` records the digest
   already, so a tag adds a name to a thing it can already tell apart.
   Publishing to crates.io is a separate decision; nothing here needs it.
4. **The console's copied modules have no recorded base.** Proposal, either
   half: record the upstream commit and the two patches in
   `web/public/6502/games/NOTICE.md`, or read the modules out of
   `../6502/games` at build time the way the explorer's pages are read, with
   the two patches applied by `lib/` and held by a test. The second is the
   house pattern and removes the copies.

### Keeping this current

```bash
python3 scripts/board-engine.py --board      # after a 6502 release: test, then record
python3 scripts/board-engine.py --check      # what deploy.sh runs
node ../6502/tools/check-halfphi.mjs         # the two halfphi copies, from the other side
python3 data/verify-chip.py                  # the chip's figures, re-derived from the API
```

The tables above are read off the tree. When a module is added, its row is
added here in the same change; `test_pieces_and_the_prose_agree` already
holds `notes/inventory.md` to `data/pieces.json`, and a seventh piece fails
that test before it reaches this file.
