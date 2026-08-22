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

## Open questions for the owner

1. ~~Next+MDX, or Python and server-rendered markdown?~~ **Answered: Next+MDX
   frontend, FastAPI backend.** See "The shape, decided".
2. **Do the subdomains stay, or move under the apex?** `6502.tinymachines.ai`
   versus `tinymachines.ai/6502`. Both work; the second means redirects and a
   single origin, the first means less to break today.
3. ~~Are coins ever sold?~~ **Answered: no, given away.** See `NOTICE.md`.
4. **Which bradley.io projects come over**, and do they move or mirror?

## What not to do

- Do not invent a visual identity. Fonts, palette, and the stylesheet are the
  owner's and in progress.
- Do not touch `~/projects/tinymachines/6502`. If something there needs to
  change, say so and why.
- Do not copy built artefacts. Build from source; `notes/inventory.md` has the
  order.
- Do not change the live subdomains' nginx, units or ports without asking.
