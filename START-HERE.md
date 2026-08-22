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

## The shape being proposed

One process, three surfaces, built from source.

```
            tinymachines.ai
                  |
      +-----------+-----------+
      |           |           |
     /          /api        /docs
   static     REST+MCP    markdown tree
   pages      openapi     rendered server side
      |           |           |
      +-----------+-----------+
                  |
        one FastAPI app on a free
        loopback port, behind nginx
```

**Why one process.** `/api` and `/docs` both want to be generated rather than
authored: the OpenAPI document from the models that validate requests, the docs
from a markdown tree. FastAPI already generates the first from Pydantic and the
6502 service is FastAPI, so a second language buys nothing and costs a second
deploy. The front page is static and can be served by nginx directly.

**Port:** 6503, 6510 and 6520 were free at the time of writing. **6502 is
held by the live API**, and a uvicorn started there fails to bind while every
request quietly goes to production. Check `ss -ltn`.

## The MDX question, answered with what is on disk

You will be told the shop is on MDX. Here is what is actually true:

- bradley.io is **Next 16 + React 19 + Tailwind 4**, built with `bun`, and its
  Next config does list `md` and `mdx` in `pageExtensions` with `@next/mdx`
  installed.
- **There are zero `.mdx` files in the tree.** The toolchain is MDX; the
  content is not.

So "we are MDX" is a statement about a dependency, not about a workflow. That
matters, because the ask here is a markdown hierarchy **rendered as HTML by the
backend**, and MDX is a compile-time format that produces JSX. Those are
different things wearing similar names.

**Recommendation: plain markdown, rendered server side, in the same Python app
as `/api`.** A docs tree is then a directory of `.md` files with front matter,
the navigation is the directory structure, and there is no JavaScript build in
a deploy that is otherwise Rust and Python.

**When to overrule that:** if tinymachines.ai should share components, layout
and design system with bradley.io, the answer is Next, and then `/docs` is
build-time rather than backend-rendered and this whole plan changes shape.
That is the owner's call and it is the **first thing to settle**, because
almost everything else follows from it.

## Order of work

Nothing below is started. Each step should leave the site working.

### 0. Settle the stack question above
One decision, everything follows. Do not begin step 2 without it.

### 1. Stand the apex up, empty but real
nginx server block for `tinymachines.ai` and `www`, certificate (one already
exists for `www`), a holding page, and a `deploy.sh` that builds rather than
copies. **The three live subdomains must keep working**; verify each after the
nginx reload, because a config error takes the whole server's reload with it.

### 2. `/docs`: the tree and the renderer
A directory of markdown, a renderer, and navigation derived from the tree
rather than a hand-kept list. **One copy of a fact**: nothing that maintains a
separate index of pages. Start by moving the honest reference material that
already exists in the 6502 repo's READMEs, which are good and are currently
only reachable by cloning.

### 3. `/api`: one surface, spoken two ways
The existing service already answers REST and MCP over the same models, and
that is the pattern to reuse rather than reinvent: Pydantic models generate
both the OpenAPI document and the request validation, so they cannot drift.

Doc-maxxing `openapi.json` is an explicit goal. What makes that real rather
than decorative: every field carries a description, every example is one that
has been run, and a test holds the document to the app. The 6502 service does
this already, and the check that earns its keep is the one that fails when a
route exists and the reference page does not mention it.

### 4. The front page
6502 work front and centre. Structure only: **the style guide, the CSS and the
design language are the owner's and are being worked on separately.** Leave
clean seams and say where they are.

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

1. **Next+MDX, or Python and server-rendered markdown?** Everything follows.
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
