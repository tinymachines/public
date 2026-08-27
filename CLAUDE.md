# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

**tinymachines.ai**: the front door for the 6502 work, and eventually for the
rest of the shop. Six pieces already exist and run; none of them share a
homepage, a documentation tree, or an account. This repository is where that
roof goes.

Three surfaces:

| | |
|---|---|
| `tinymachines.ai` | the site. 6502 work front and centre, other projects later |
| `tinymachines.ai/api` | one API, spoken as REST **and** MCP, with a doc-maxxed `openapi.json` |
| `tinymachines.ai/docs` | a markdown hierarchy, rendered to HTML by the backend |

`notes/inventory.md` is the survey of what already exists and where. **Read it
before proposing anything**: it records several things that are not what they
look like, including a docs stack that is configured and unused.

## The stack, decided

| | |
|---|---|
| **frontend** | Next 16, React 19, **MDX**, **Tailwind 4**, built with `bun`. `127.0.0.1:6511` |
| **backend** | Python 3.10, **FastAPI**, uvicorn, Pydantic. `127.0.0.1:6510` |
| **engine** | Rust: `halfphi`, `halfwave`, reached from the Python side |
| **front door** | nginx: TLS, static assets, `/` and `/docs` to Next, `/api` to uvicorn |

Two reasons this split rather than one process, both worth keeping in mind
when something tempts you to move a responsibility across the line:

- **The frontend matches bradley.io's major versions**, so components and the
  design system port rather than being rewritten. That is what "seamless"
  meant.
- **`openapi.json` is generated from the Pydantic models that validate the
  requests.** The reference cannot drift from the behaviour because they are
  the same object. Do not hand-write an OpenAPI document, and do not add a
  second schema layer to describe what the models already describe.

## Status

**Nothing is built yet.** This is a scaffold plus a plan. `START-HERE.md` is
the brief and the order of work; **step 2, `/docs`, is where to start.**

What is already true and does not need doing:

- The apex `tinymachines.ai` and `www` have A records, and a certificate for
  `www.tinymachines.ai` exists. **No DNS work is needed to stand the site up.**
- `6502.tinymachines.ai`, `games.tinymachines.ai` and
  `halfwave.tinymachines.ai` are live and must keep working. This repo adds a
  roof; it does not move the furniture out from under them.
- `tinymachines/halfphi` and `tinymachines/6502` are public on GitHub.

What is deliberately open, and is **the owner's**, not yours to invent:

- **The style guide, the CSS, the design language.** The owner is working on
  these. Do not generate a visual identity, do not pick fonts, do not invent a
  palette. Build structure that a stylesheet can be dropped into, and say
  where the seams are.

  The seam is concrete: **Tailwind 4 is configured CSS-first**, with
  `@import "tailwindcss"` and a `@theme {}` block in `app/globals.css`. Design
  tokens are CSS custom properties there, not a JavaScript config file, which
  is exactly the shape a style guide arrives in. Leave that block minimal and
  commented as the owner's, and use semantic utility classes above it so a
  token change reaches everything at once.

## The rules that carried over, and why they are worth keeping

These came from the 6502 repo, which paid for each of them. They are not
stylistic preferences.

### Measure, then write

**Prose is the part of a site most likely to go quietly wrong**, because it is
written once against what was true that afternoon and nothing checks it
afterwards. The 6502 site's answer is that no number is typed into a page: every
figure is a slot filled from a published file, and a harness re-derives them and
scans the prose for stray digits. Anything this repo ships that states a number
should be able to say where the number came from.

### A refusal beats a plausible answer

A cartridge that overlaps its own screen is refused with the reason, not minted
into a game that draws over itself. A ROM that never finishes a frame is not
listed. An instruction that transfers control reports **no length** rather than
a number that would be wrong. Build things that decline rather than guess.

### The thing that publishes must not be the thing that claims

The registry re-runs every cartridge on the chip rather than believing the
`verify` block the file arrived with, because a file is something its author
can edit. Where a number will be shown next to somebody's work, measure it
here.

### One copy of a fact

Ten hand-copied nav lists had already drifted three ways before anybody
noticed, because a nav missing one link still looks exactly like a nav. Every
shared thing in the 6502 tree is a module for that reason. If a fact is about
to exist in two files, it needs to exist in one and be read by both.

### House style for shipped text

- **No em dashes in anything shipped.** Not in prose, not in a `title=`, not as
  a placeholder in a readout. Use a colon, a comma, brackets, or a real word.
  Code comments use `--`. Grepping shipped files for the character should
  print zeroes. (The one occurrence in this file is inside that grep command,
  where it has to be. A scan firing on the sentence that explains the scan is
  a false positive to leave alone, not a hit to fix.)
- **Headings state a fact, not a promise.** "Twelve opcodes never finish", not
  "∞ is a measurement too."
- Say what is not covered. An archive that hides its gaps is worth less than
  one that shows them.

### Nothing generated is committed

A fresh clone must build. Verify with a real `git clone` into a temp directory,
which is how the 6502 repo's "tests fail out of the box" bug was found.

### No host-specific detail in this repository

Addresses, zone paths and the local runbook live in `deploy/HOSTING.local.md`,
which is gitignored. This split exists because a public repo once documented an
internal LAN address and a weakness on the host. Localhost ports are fine and
are already committed elsewhere; public addresses are not.

## Traps already paid for, that will bite again here

Each of these cost a round somewhere in the 6502 work. They are listed because
this repo will hit the same ground.

- **A port that is already held fails to bind silently, and every request then
  goes to production.** `127.0.0.1:6502` is the live API. A local uvicorn
  started there looked local, answered every request from the deployed service,
  and a test passed against production while claiming to test the tree. Run
  `ss -ltn` before believing a local server is yours. 6503, 6510 and 6520 were
  free at the time of writing.
- **A relative `src` resolves against the path, not the site root.** A document
  served at both `/` and `/b/x/y` asked for `/b/x/game.js` at the second depth
  and got a 404. **The page still rendered**, because the markup is static and
  only the script was missing, so it read as a console that failed to boot.
  Absolute references, and `new URL(..., import.meta.url)` for module-relative
  fetches.
- **nginx reads `{` as the start of a block.** A location regex containing
  `{2,32}` fails with "unknown directive" naming the middle of the pattern.
  Quote the regex. The same is true of a `map` key.
- **One `add_header` in an nginx location discards every inherited one.** A
  location that sets Cache-Control silently drops the CSP and HSTS. Either
  declare the complete set or declare none.
- **Anything a deploy shells out to runs under systemd's `PATH`**, which has no
  nvm in it. `/usr/bin/node` here is v12 and cannot parse `??`. Check the
  version; do not assume the binary.
- **A `var()` naming a token that does not exist drops the whole declaration,
  silently.** The usual symptom is "slightly wrong", not an error.
- **An absolutely positioned element with no positioned ancestor escapes an
  `overflow` container** and is laid out against the initial containing block,
  so its static position lands in the *page's* scroll width. A visually hidden
  label inside a horizontally scrolling table scrolled the whole document
  sideways at 390px with nothing visible out there. Scroll containers need
  `position: relative`.
- **FastAPI runs a generator dependency's setup and its teardown in different
  threadpool workers.** Anything opened in the `yield` body and closed after it
  changes thread, which is how a per-request sqlite3 connection 500s on
  `close()`. Sequential tests never see it: under one request at a time the
  pool hands back the same worker.
- **`pkill -f <pattern>` kills the shell running it**, because the pattern
  matches its own command line. List with `ps -eo pid,comm` and kill by pid.
- **A check that can pass on nothing is not a check.** An assertion about an
  empty list matching an empty list passed for a while. So did one where the
  probe threw and the thrown string was truthy.
- **A fix is not justified until the test fails without it.** Revert it and
  watch the assertion go red; two earlier versions of one assertion passed with
  and without the fix and were therefore worthless.

## Licensing

Read `NOTICE.md` before anything ships. The short version: our code is ours,
the die data is **CC BY-NC-SA 3.0**, and NonCommercial and ShareAlike travel
with anything derived from it, which includes every cartridge. `halfphi` is the
clean MIT piece because it embeds no die data.

**The coins idea points at commercial use of an NC-licensed work.** That is
worth deciding deliberately, with the facts, before it is built. `NOTICE.md`
lays out the shape of the question without pretending to answer it.

## Working agreement

- The owner is in the 6502 repo (the skunkworks lab) with other work in
  flight. This repo is for a separate agent to build in.
- **Do not touch `~/projects/tinymachines/6502` from here.** If something there
  needs to change, say so and why; do not reach across.
- Build from source, never copy artefacts. The 6502 stack has a documented
  build order; `notes/inventory.md` has it.
- The three live sites must keep working. Anything that would change their
  nginx, their units or their ports is a proposal, not an action.
- **The subdomains stay for now and move under the apex later.** So do not
  assume a single origin: a fetch from `tinymachines.ai` to
  `6502.tinymachines.ai` is cross-origin today, and the 6502 API sends
  `Access-Control-Allow-Origin: *` deliberately for that reason. Keep public
  paths stable, because they become a redirect map at the move.

## Where this is going, decided 2026-08-23

**Everything moves under this project, as five separate sub-projects:**
the engine, the API, games, the lab page, and the main site.

Two things follow, and they are constraints rather than notes.

**Nothing else is disturbed while the move happens.** The existing repos keep
their shape and the three live subdomains keep serving, exactly as before. A
move is a sequence of small arrivals here, not a flag day. Until a piece has
arrived and is proved serving from here, the thing that answers is still the
thing that answers today, and this repo talks to it over HTTP.

**The sub-project boundary has to follow the licence line, not the product
line**, and this is the part that is easy to get wrong once and expensive to
undo. `NOTICE.md` records that `extern/visual6502` is a submodule in the 6502
repo *precisely so that repository does not redistribute NC-SA data*, and says
that choice should not be quietly undone here. Consolidating into one tree is
the most natural way to undo it by accident.

So, per sub-project:

| | |
|---|---|
| halfphi | MIT, and it must keep embedding **no die data**. That is the only reason it is MIT |
| the 6502 engine | MIT code over a **submodule**, never a copy. It arrives as a submodule or it does not arrive |
| the API, games | derived from the die data, so **CC BY-NC-SA 3.0 travels** with them and with every cartridge |
| the lab page, the main site | whichever applies to what they actually embed, decided when they land |

A single top-level `LICENSE` covering all five would be wrong in both
directions: it would either claim MIT over NC-SA work, or put NC-SA on
halfphi and destroy the one clean piece. Each sub-project carries its own, and
`NOTICE.md` stays the map.

**The engine is boarded, not assumed.** `notes/modules.md` maps every module
and every edge out of this repository. The engine edge has a gate:
`scripts/board-engine.py --board` reads the commit the SERVED release was
built from, checks it out into a worktree of the 6502 repository
(`../6502-served`), runs halfphi's and v6502-sim's suites there and records
the commit, digests and counts in `data/engine.json`; `deploy.sh` stage 2e
refuses to deploy when the served release, the running chip API or that
worktree is at any other commit. The build reads the 6502 project's pages
from the worktree (`web/lib/chip-src.ts`), never from its working tree, which
is that project's to dirty as it likes (owner's call, 2026-08-27, after the
checkout-bound gate blocked four deploys in a day on docs commits). Releasing
the 6502 project is that project's deploy; boarding what it released is this
one's.

**When the first piece with die data arrives, add the check that fails if it
reaches halfphi's tree.** The rule this repo already runs on: a boundary that
is only a convention is one nobody notices crossing.
