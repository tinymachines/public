# Start here

You are building **tinymachines.ai**: one roof over six pieces of 6502 work
that already run and do not know about each other.

Read `notes/inventory.md` first. It is a survey of the running machine, not a
recollection, and it records several things that are not what they look like.
Then read `NOTICE.md`, because this repo is called `public` and the die data is
not ours.

## What exists, in one line each

**halfphi** the switch-level engine (MIT, no die data) · **the 6502 site** the
explorer and its measured tables · **the 6502 API** stateless HTTP over the real
chip, plus an MCP endpoint · **halfwave** the warm engine process the API talks
to · **Die Runner** the console, its cartridge format, and builder pages · and
**the registry**, which is routes on the same FastAPI app rather than a service
of its own.

Three of these are live on subdomains. The apex is a placeholder pointing at
the GitHub org.

## The shape, decided

Two processes behind nginx, built from source. Settled 2026-08-22.

```
                      tinymachines.ai
                            |
                          nginx
                    TLS, routing, static
              +-------------+-------------+
              |                           |
         /  and  /docs                  /api
       Next 16 + MDX                FastAPI + uvicorn
       bun, Tailwind 4              Pydantic -> openapi.json
       127.0.0.1:6511               127.0.0.1:6510
              |                           |
              +-------------+-------------+
                            |
                  halfphi / halfwave (Rust)
                  called by the Python side
```

| | | |
|---|---|---|
| **frontend** | Next 16, React 19, MDX, Tailwind 4, built with `bun` | seamless with bradley.io: same major versions, so components and the design system port rather than being rewritten |
| **backend** | Python 3.10, FastAPI, uvicorn, Pydantic | `openapi.json` is generated from the models that validate the requests, so the reference cannot drift from the behaviour |
| **engine** | Rust: `halfphi`, `halfwave` | unchanged, and reached from the Python side where the process-pool plumbing already exists |

Verified present on the host: bun 1.3.14, node v24.0.1 (nvm), Python 3.10.12,
FastAPI 0.121.2, uvicorn 0.38.0, Pydantic 2.11.7, rustc 1.97.1. **6510, 6511
and 6512 were free.**

**`/usr/bin/node` on this host is v12 and cannot parse `??`.** systemd's `PATH`
does not include nvm, so a unit that does not say otherwise will find it. The
bradley.io unit hardcodes `PATH=/home/.../v24.0.1/bin:...` for exactly this
reason; copy that, do not rediscover it.

## One consequence of choosing MDX, recorded rather than discovered later

The original ask was a markdown hierarchy **rendered as HTML by the backend**.
With Next and MDX, docs are compiled **at build time in the frontend** instead.
That is the standard Next docs pattern and it is what has been chosen, but the
difference is real and worth writing down:

- a docs edit needs a rebuild, not just a file save
- the backend has no route for docs content, so nothing else can consume it
- in exchange, docs pages get React components, and share the site's layout
  and design system for free

If content ever needs to change without a deploy, the hybrid is available:
FastAPI serves the markdown tree as data and the frontend renders it. That is a
later decision and does not block anything now.

## The MDX finding, kept because it changes what you inherit

The stack decision is made, but this is still true and still matters:

- bradley.io is **Next 16 + React 19 + Tailwind 4**, built with `bun`, and its
  Next config lists `md` and `mdx` in `pageExtensions` with `@next/mdx`
  installed.
- **There are zero `.mdx` files in that tree.** The toolchain is MDX; the
  content is not.

So there is no existing MDX content to copy patterns from, and no proven
in-house convention for frontmatter, navigation or components in MDX. **This
repo establishes it.** Do not go looking next door for a pattern that is not
there.

What bradley.io *does* have worth taking: `app/globals.css` is Tailwind 4 with
`@import "tailwindcss"` and a `@theme {}` block, which is the CSS-first
configuration. That is the same shape the style guide will land in.

## Order of work

Nothing below is started. Each step should leave the site working.

### 0. ~~Settle the stack question~~ DONE
Next + MDX on the frontend, FastAPI on the backend. See "The shape, decided".

### 1. Stand the apex up, empty but real
nginx server block for `tinymachines.ai` and `www`, certificate (one already
exists for `www`), a holding page, and a `deploy.sh` that builds rather than
copies. **The three live subdomains must keep working**; verify each after the
nginx reload, because a config error takes the whole server's reload with it.

### 2. `/docs`: the tree and the renderer  <- START HERE

Content lives in `docs/` as `.md` and `.mdx`. The Next app in `web/` reads it;
**content and code stay in separate directories** because the content is the
thing a non-developer should be able to edit.

```
docs/
  index.md                     ->  /docs
  6502/
    index.md                   ->  /docs/6502
    the-console-contract.md    ->  /docs/6502/the-console-contract
    cartridges.mdx             ->  /docs/6502/cartridges
```

Four conventions, and the reason for each:

- **Navigation is derived from the directory tree, never from a list.** Ten
  hand-copied nav lists in the 6502 repo had drifted three ways before anybody
  noticed, because a nav missing one link still looks exactly like a nav. A
  page that exists must appear; a page that is deleted must vanish. If you find
  yourself writing `nav.ts`, stop.
- **Frontmatter carries only what the tree cannot say**: `title`, a one-line
  `description`, and `order` for sibling sorting (absent sorts last,
  alphabetically). Not the URL, which is the path. Not the parent, which is the
  directory.
- **A page with no title is a build failure, not a page called "Untitled".**
  The 6502 primer fails the page rather than blanking a word, for the reason
  that a silent omission reads as a design choice.
- **Every code block that states an output has been run.** Same rule as the
  measured tables: if it says the answer is `$42`, somebody ran it.

**First content, in this order.** All of it already exists and is good, and all
of it is currently reachable only by cloning a repo:

1. `6502/README.md` -> what the simulator is, and the verification story
2. `service/README.md` -> the API, the atlas, cartridges, MCP
3. `games/README.md` -> the console contract, the cartridge format, builder pages
4. the cartridge and console reference now living in `service/api.html`

Move it, do not rewrite it. Where it says a number, the number was measured;
keep it that way and keep the sentence that says where it came from.

### 3. `/api`: one surface, spoken two ways
FastAPI in `api/`, uvicorn on 6510, nginx proxying `/api`. The existing 6502
service already answers REST and MCP over the same models, and that is the
pattern to reuse rather than reinvent: Pydantic models generate both the
OpenAPI document and the request validation, so they cannot drift.

Doc-maxxing `openapi.json` is an explicit goal. What makes that real rather
than decorative: every field carries a description, every example is one that
has been run, and a test holds the document to the app. The 6502 service does
this already, and the check that earns its keep is the one that fails when a
route exists and the reference page does not mention it.

### 4. The front page
6502 work front and centre. **Tailwind 4, CSS-first**: `@import "tailwindcss"`
and a `@theme {}` block in `app/globals.css`, which is what bradley.io already
does. Design tokens are CSS custom properties, not a JavaScript config file,
which is precisely the shape a style guide arrives in.

**The style guide, the palette, the fonts and the type scale are the owner's
and are in progress.** Build structure and semantic class usage; leave the
`@theme` block as the seam and say so in a comment. Do not pick a palette, do
not choose fonts, do not invent a design system to be replaced later.

### 5. Tokens as coins
The registry already has the mechanism worth keeping: a token is shown once and
only its SHA-256 is stored, so a copy of the database is not a copy of
everybody's credentials. Extend that rather than starting again.

**Coins are never sold. They are given away.** Decided 2026-08-22, so the
licensing question is closed and you are not waiting on it: coins are a quota,
an anti-abuse budget, and something to earn by playing. Build it that way.

Treat that as a constraint rather than a note. Anything that would put a price
on a coin reopens a question that is currently closed, and reopens it as a
conversation with the rightsholder. See `NOTICE.md`.

### 6. halfphi on the home page, with its mark

**halfphi is the piece an outsider can actually pick up**, and it is the only
one that is cleanly MIT, because it embeds no die data. It should be reachable
from the front door rather than three clicks into the docs.

One line of what it is: switch-level simulation of chip netlists traced from
die photographs. It loads the 6502, the 6800 and the Z80 through identical
calls. Link to `github.com/tinymachines/halfphi`.

**The mark needs a decision, not a drop-in.** `assets/` in that repo has it at
1408, 512 and 180 pixels, and **the dark background is baked in rather than
transparent**. The style guide's whole first idea is two grounds, so either it
sits on the dark ground, or it needs a cut-out. Its own README says the
background is a subtle gradient rather than a flat colour, so a flood fill will
not produce that cut-out: the subject has to be masked. Take the 512 and
display it small, as its README already does, rather than shipping two
megabytes for a logo.

### 7. One engine, two ways in, roughly the same surface

The ask: somebody advanced should be able to wire the engine into **their own
JavaScript page**, or call the **API**, and work with roughly the same
interface either way.

**The gap today, measured rather than guessed:**

| | |
|---|---|
| the wasm surface | fine-grained and **stateful**: an object you drive, about 50 methods, `half_step()`, `pc()`, `peek()` |
| the HTTP surface | coarse-grained and **stateless**: a value you pass, POST a whole machine and get one back |

**The blocker is concrete: the wasm crate cannot export or import a machine.**
Zero state functions on it. So the two surfaces cannot exchange anything at
all, which is a harder problem than the naming difference it looks like.

**What makes parity reachable is already built.** The state codec exists in
Rust and is written down: `crates/v6502-sim/src/state.rs`, lowercase hex, bit
*i* of a set in byte *i*/8 LSB first, node sets 216 bytes, the transistor set
439. It is proven bit-exact restoring into a **fresh** machine, which is the
whole point: a machine is a value, not a session.

So the shape is:

1. Expose export and import on the wasm crate, using the codec that already
   exists rather than a second one.
2. Both surfaces then speak the same `Machine` object.
3. One thin JavaScript wrapper presents a single interface over two backends,
   local wasm or remote fetch.

The property that makes this worth doing, rather than merely tidy: **because
the API is stateless and carries the whole machine, the two backends are
interchangeable by construction.** Start a run locally, finish it on the
server, or the reverse. The service suite already proves that hop is
bit-exact; nothing new has to be true for it to work.

**The licence decides how it ships, and this one is easy to get wrong.** The
current 106 KB wasm bundle **embeds the die data**: `v6502-wasm` depends on
`v6502-sim` depends on `v6502-netlist`, which `include_bytes!`s `netlist.bin`.
So that bundle carries CC BY-NC-SA and is **not** MIT, whatever the repo's
licence file says about the code.

A JavaScript package that wants to be MIT the way the crate is must therefore
**ship no die data and take it at runtime**, exactly as `halfphi` does in Rust.
That is also the better product: chip-agnostic, and it loads the 6800 and the
Z80 as well. Two packages then, split along the line the Rust side already
draws. See `NOTICE.md`.

**Most of step 7 is work in `tinymachines/6502`, not here.** Exposing the codec
and building the wasm package belongs in that repo. What belongs here is the
JavaScript wrapper, the documentation of the shared shape, and the page that
shows somebody how to do it both ways. Say what you need from the other side
rather than reaching across.

## Open questions for the owner

1. ~~Next+MDX, or Python and server-rendered markdown?~~ **Answered: Next+MDX
   frontend, FastAPI backend.** See "The shape, decided".
2. ~~Do the subdomains stay, or move under the apex?~~ **Answered: they stay
   for now, and move later.** As of 2026-08-23 "later" has a shape:
   **everything moves under this project as five sub-projects**, being the
   engine, the API, games, the lab page and the main site, with nothing else
   disturbed while it happens. See "Where this is going" in `CLAUDE.md`,
   including why the sub-project boundary has to follow the licence line.
   The rest of this answer still holds during the move: `6502.`, `games.` and `halfwave.` keep serving
   from where they are. Two things follow. **Build nothing that assumes a
   single origin**: cross-origin fetches between the apex and a subdomain need
   CORS, and the 6502 API already sends `*` on purpose. And **treat every
   inbound link as one that will have to be redirected**, so keep the paths
   worth preserving stable and expect a redirect map at the move.
3. ~~Are coins ever sold?~~ **Answered: no, given away.** See `NOTICE.md`.
4. **Which bradley.io projects come over**, and do they move or mirror?

## What not to do

- Do not invent a visual identity. The style guide has landed in `style/`:
  use `tokens.css`, `components.css` and the specimens in `zoo.html`, and
  keep `globals.css` importing the tokens rather than copying them.
- Do not touch `~/projects/tinymachines/6502`. If something there needs to
  change, say so and why.
- Do not copy built artefacts. Build from source; `notes/inventory.md` has the
  order.
- Do not change the live subdomains' nginx, units or ports without asking.
