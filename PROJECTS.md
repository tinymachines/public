# Projects, surfaces, and how a project looks like itself

Five sites are being brought under one roof and one design system. This is the
structure that holds them, written before anything moves, because the shape
decided at the first move is the shape the other four inherit.

`data/projects.json` is the manifest and this file is the reasoning. The
manifest is read by `web/lib/projects.ts`, by `/6502`, and by the API's tests,
so "which projects exist and what surfaces they have" has exactly one answer.
If you find yourself writing a second list, stop.

## The five sites

| Site | Project | Surface |
|---|---|---|
| `tinymachines.ai` | roof | the main site |
| `tinymachines.ai/api` | roof | the roof API |
| `6502.tinymachines.ai` | 6502 | the explorer |
| `6502.tinymachines.ai/api/` | 6502 | the 6502 API |
| `games.tinymachines.ai` | 6502 | Die Runner |
| `halfwave.tinymachines.ai` | 6502 | the lab |

Six surfaces across three projects, because the apex is two surfaces rather
than one and both are already here.

**hotbits is the next project**, after 6502 settles. It has a manifest entry
and a silo file and nothing else, which is the correct amount of hotbits to
have built today.

## A project, and a surface

A **project** is a body of work with an identity: 6502, then hotbits. It owns a
short list of design tokens and nothing else about the design system.

A **surface** is one addressable thing that project serves: a site, an API, a
console, a lab. A surface has an address today and a proposed address after the
move, and those are different fields on purpose.

**`lands_at` is a proposal until `lands_at_settled` is true.** Every surface
except the two already here has it false. A public path that moves becomes a
redirect map, and writing `/6502/games` into the manifest as though it were
decided would make it read as decided the next time somebody looks. The
`/6502` page renders the proposals with the word "proposed" beside them for the
same reason.

## Where a moved surface lands in the tree

```
web/app/
  page.tsx          tinymachines.ai            the roof
  docs/  style/  admin/                        the roof's other surfaces
  6502/
    layout.tsx      stamps data-project="6502"
    page.tsx        the project index, built from the manifest
    ...             the explorer, the games and the lab arrive here
  hotbits/          when there is a hotbits
api/                the roof's own API
projects/
  6502/
    archive/        the archival drip: tools a project owns that are not routes
style/
  tokens.css  components.css  zoo.html         the kit, shared, never forked
  projects/6502.css  projects/hotbits.css      the silos
data/projects.json                             the manifest
```

**A project's web surfaces go under `web/app/<project>/`; everything else it
owns goes under `projects/<project>/`.** That second half was not in the first
draft of this file, and it was added by the first thing that arrived: the
archival drip is a Python harvester belonging to the 6502 project, and it is
not a route. A structure with nowhere to put it would have put it in `tools/`
at the top level, which is where a project's code goes to stop belonging to a
project.

**A route is in a project because of where it sits.** `web/app/6502/layout.tsx`
stamps `data-project="6502"` on everything beneath it, so a surface is siloed on
arrival and nothing has to be added to the pages themselves. That is the whole
mechanism, and it is the reason moving a site is a move rather than a port.

## How a project looks like itself

By scoping a short list of identity tokens to `[data-project="..."]`. Not by
forking the kit, not by a second stylesheet, not by project-specific component
classes. Same components, same type scale, same spacing rhythm, same motion.

**What a project may override, and why each one:**

| | |
|---|---|
| the four categorical hues, in both forms | `tokens.css`: "Categorical. Assigns identity to a region, a bus, a signal class." Categorical is what a silo is for |
| the two grounds and their inks | Their meaning is fixed everywhere; their values are identity, and a ground is the loudest lever available |
| `--font-display` | `tokens.css` already calls it "the swap seam" |

**What it may not, and why that matters more:**

The logic accents are state, and each has exactly one meaning: blue is ACTIVE,
orange is ATTENTION, **red is ASSERTION FAILED**. The drive ramp is halfphi's
`Drive` enum given colour, in resolution order. The chrome set is bezel
material. The type scale, the grid unit, the motion curves, the shadows and the
radii are the system's rhythm.

A project that could redefine red would not have been given its own accent. It
would have a failed assertion that looks fine on one page and alarming on
another, and the reader would have no way to know which page they were on.

**This is enforced, not agreed.** `style/check-silo.py` fails when a silo
assigns a token outside the identity set, invents a token the kit does not
define, or lands a text pair below WCAG AA against the palette it would
actually render with. The contrast is computed, the same arithmetic
`tokens.css` used for the ratios in its comments.

It also runs a **self test**, and that is not decoration. Every silo shipped
today overrides nothing: 6502 is the ground the house palette was sampled for,
and hotbits has not been designed. So the three rules have nothing to bite on,
and a check that can pass on nothing is not a check. The self test feeds it
three synthetic silos that each break one rule and requires all three to be
caught.

## Both silos are empty, deliberately

`style/projects/6502.css` overrides nothing because the palette in `tokens.css`
was sampled off the binder scans **for this work**. Burnt Silicon, Mustard
Conductor, Forest Logic and Ocean Data are the 6502's own colours. Restating
them in the silo would be a second copy of the palette, and a second copy
drifts in one of them while both still look like a palette.

`style/projects/hotbits.css` lists every lever, commented out, with no values.
The palette, the display face and the mark are the owner's, exactly as the
house palette was. Designing hotbits should be filling in values, not working
out which values a project is allowed to have.

## The order of work

One site at a time, and each move leaves the site working.

1. **Nothing is disturbed while this happens.** Every subdomain keeps serving
   from where it serves today until its surface is proved answering from here.
   A move is a sequence of small arrivals, not a flag day.
2. **Settle `lands_at` before moving a surface, not after.** The path is the
   redirect map.
3. **The R&D stays R&D.** The explorer and the lab are where the 6502 work
   happens. Bringing them under one roof is about the roof, and homogenising
   them must not mean sanding off what they are for.
4. **Each surface arrives with its licence.** The engine and the games are
   derived from CC BY-NC-SA die data and halfphi is MIT only because it embeds
   none. See `CLAUDE.md` on why the sub-project boundary follows the licence
   line, and `NOTICE.md` for what the terms actually reach.

## What the surfaces look like today, measured

Probed 2026-08-23, so the homogenisation has a starting point rather than an
impression:

| | |
|---|---|
| `6502.tinymachines.ai` | 21 KB, one hashed stylesheet, three modules. Has its own shared chrome already: `site-menu.js` and `version-footer.js`, both written because ten hand-copied navs had drifted three ways |
| `games.tinymachines.ai` | 8.5 KB, one inline `<style>`, its own `site.css` |
| `halfwave.tinymachines.ai` | 207 KB, a single document with one inline `<style>` and no external stylesheet |

Three different answers to the same question, which is the thing being fixed.
The explorer's `site-menu.js` is the closest to what this repo already does
with the docs navigation, and it is worth reading before replacing.


## Checkpoint: 1.0.22, 2026-08-24

**Every surface in the manifest is here.** Thirteen of thirteen, verified
against the running site rather than from memory: 32 routes answering, one `h1`
each, no horizontal overflow at 390px, and no console error this site is the
cause of.

That changes what "what is left" means, and it is worth being exact about it.
There are **no more sites to move**. What remains is three pages that do not
exist yet, two decisions, and two things waiting on somebody else's service.
The queue below is in that order, because the first group is the only one this
repository can act on alone.

### The queue

**1. Done, 1.0.27: `docs/hotbits/` exists.** Four pages: the instrument, the
bits, the health tests, the gateway. The extraction and the health tests are
written from the geiger tree's source; the gateway is written from calling the
deployed service, and each page says which it is doing. One figure got
corrected on the way: the retirement notice says the pool refills at about
seventy-five bytes a minute, and six minutes of watching `/stats` on
2026-08-24 measured about thirty-six. Both are cited with their provenance in
[the bits](docs/hotbits/the-bits.md); the rate belongs to the tube, not to
either sentence.

**2. Done, 1.0.29: the front page grew a projects section above the pieces.**
The owner picked the second option, 2026-08-24: the pieces stay what they are
and `data/pieces.json` stays 6502-only, because a piece and a project are
different facts. The section derives from `data/projects.json`, the same
manifest the navigation and the API read, links every arrived surface of both
projects, and the measured chips row states the project and surface counts
beside the piece count so the two files are visibly two files.

**3. Done, upstream: the gateway documents itself.** The owner picked the
honest fix, 2026-08-24, and the discovery on the way corrected the queue: the
`/v1` routes were never the geiger repo's, they are `tinymachines/entropy`, a
Rust gateway nginx grafts onto the hotbits origin. It now serves
`/v1/openapi.json`, generated from the same table its router is built from
(a route in one and not the other stops its tests, verified red), so the
schema cannot describe a route that does not answer. `/hotbits/api` reads
both schemas and labels the keyed tier's deliberate CORS refusals as design
rather than defect. What remains on that host is `geiger#4`: the instrument's
own 410s are still unreadable from a browser.

### Decisions, not work

**4. Done, 2026-08-24: the 6502 API answers under the apex.** Settled as
"move it": the service names, per request, the door a request came through
(X-Forwarded-Prefix, in the 6502 repo, commits 97c4a84 and 53df37c), so
`tinymachines.ai/6502/api/openapi.json` says `/6502/api` while the
subdomain's copy still says `/api`, each true where it is read. FastAPI's own
openapi route could not carry two doors (it accumulates every root path it
has seen into one servers list), so the service declares those routes itself.
Two lessons paid for on the way, both in the commits: uvicorn delivers
`scope["path"]` WITH the root path included, so the override must move path
and root_path together (the first version 404d every apex request while its
wrongly-shaped test passed), and a proxied prefix location answers the
slash-less form with an automatic 301, which took `/6502/api` away from the
reference page until an exact-match location took it back. The deploy now
asserts both doors' claims from outside on every ship. The subdomain stays
canonical until the flip becomes a redirect.

**5. hotbits' identity.** `style/projects/hotbits.css` still overrides nothing.
Both pages change the day it is filled in and neither is edited.

### Waiting on another service

**6. Done, 2026-08-24: the editor is at /6502/manage.** `tinymachines/6502#12`
was fixed at the source (commit 15e5717 there: the CORS policy admits
`authorization` and the registry's own verbs, verified against the issue's own
reproduction), and the editor moved the way the console did: `manage.js`,
`registry.js` and `art.js` byte for byte, one API line changed and saying why,
a page carrying the DOM contract, and the kit instead of the console's
palette.
**7. The retired hotbits endpoints being readable from a browser**, on
`tinymachines/geiger#4`.

## The roadmap, set 2026-08-24

The owner's ordering, recorded so it survives a compaction: content first,
then copy, then language, then styling. Styling is LAST, deliberately.

**The sweep of the 6502 tree, done at 1.0.35.** Every page the subdomain
serves is on the apex, and the three generated analysis documents that
neither site served are docs pages now: the atlas rubric, the circuit idioms,
and the Snake walk, pulled from `6502/docs/` at build time by
`web/scripts/pull-chipdocs.mjs` (gitignored output; the walk's schematics are
die-trace data this public repo must not redistribute). Deliberately not
brought over: `docs/notes/` (agent handbooks, "read before touching"),
`SuperMarioBros.html` (a received disassembly, reading material),
`atlas-elk.zip` (a reviewer's artifact). `findings-answers.md` is written
analysis that could become a page beside the lab when wanted.

**The DieRacer console, inventoried ahead of the build-out.** Nothing named
DieRacer exists yet in any tree. What exists to build on: the console and its
contract (`chr.js`, `console.js`, `game.js`, the cartridge mint), two ROMs
with source (`dierunner.s` 13.7 KB and 521-byte ROM; `snake.rom` 351 bytes
with its listing), one shipped tile sheet (`tiles.chr`, 256 bytes) plus three
reference photographs, one published cartridge (`dierunner.cart.gz`), the
registry to publish through, and the walk series ("part one of a series on
writing a game for a chip you can see inside"), which reads as the runway.

**Copy cleanup: done at 1.0.37.** A sweep of all rendered text found zero em
dashes, clean spelling, and four claims the week's own work had outrun; all
fixed at their single sources.

**The Japanese version: shipped and filling in.** Settled 2026-08-24 (owner's
calls: site + docs scope, /ja prefix with English unprefixed, agent drafts
and owner reviews). One route tree under app/[lang]; English rewritten
internally to /en by config rewrites (never middleware: the middleware
version reconstructed URLs from proxied request context and took the site
down for four minutes; deploy stage 4c now boots every build on a scratch
port and asks it production-shaped questions before any unit restarts). The
chrome is fully translated through one overlay (data/ja.json, keyed by the
English string so edits surface as visible fallbacks, counted by
data/check-i18n.py at deploy stage 2d); docs/ja/ is a shadow tree of BODIES
whose structure stays derived from the English files. Coverage when this was
written: 87 overlay entries all live, 5 of 18 docs bodies translated (the
docs front page and all four hotbits documents); the front page is fully
bilingual. The backlog is the 13 remaining docs bodies and the per-page
prose of the landings, console, editor and hotbits pages; the explorer's own
pages stay English until translated upstream.

**The sweep finished at 1.0.42**: `findings-answers.md` (the halfwave
review's engine side) was the last written document not on the site, and
the docs front page now shelves the four pulled analysis documents in both
languages. What remains in the 6502 tree stays deliberately: `docs/notes/`
(agent handbooks), `SuperMarioBros.html` (received disassembly), the
reviewer's ELK zip.

**Then styling, last.** The owner's style guide material is already arriving
(`docs/styles/`, gitignored until they publish it deliberately);
`style/projects/hotbits.css` still overrides nothing by design.

### One open issue that is no longer blocking anything

`tinymachines/6502#10` asks for CORS on the explorer's static assets so it
could move under the apex without this repository redistributing die data. The
explorer moved, and it did not need that header: nginx serves the same files
from the same directory on the same box under a second address, so there is no
cross-origin request to permit and nothing is copied. That issue is moot and
should be closed, and it is named here rather than closed from this side,
because an open issue that nobody has read as satisfied is a false claim about
what is blocked.

## The move, as it stands

Checked against the running site on 2026-08-24, not from memory.

| | |
|---|---|
| the roof | **here.** Front page, docs, style guide, zoo, admin, API |
| the explorer | **here.** All 18 pages, paper prose with the instrument on panel |
| Die Runner | **here.** The console, and a cartridge from the registry loads into it |
| the registry | **here, read-only.** The builder pages. The editor could not follow |
| the halfwave lab | **here.** Paper page, dark instruments |
| the visual6502 archive | **here.** Our overview, their preservation below it |
| the 6502 API | **the reference is here.** The service still answers at its own address, and this page says why it is not proxied |
| the cartridge editor | **not moved.** `/manage`, blocked by a missing CORS header |
| hotbits | **here, undesigned.** A landing page with the live pool, and a reference generated from the instrument's schema and checked against it |

### What is left, and what each one waits on

1. **The cartridge editor.** Claiming a handle, editing a page and publishing a
   cartridge all send a bearer token, and a browser on this origin cannot send
   one to that service: the preflight comes back allowing `GET, POST, OPTIONS`
   and accepting four headers, none of which is `Authorization`. Measured, not
   assumed, and filed as `tinymachines/6502#12`. It is a header that is not
   there rather than a decision that has not been taken.

   The apex could proxy the writes through its own API, where there is no
   browser and therefore no preflight, and that would work today. It is
   deliberately not done: `tinymachines/6502#9` items 5 and 6, the read-only
   service scope and the identity binding, were left undone on the grounds
   that they turn into an internal join if games moves under the apex, and a
   credentialed proxy built now is that boundary built twice.
2. **The 6502 API, as a service.** The reference moved and the service did not,
   and that split is the answer to the question this line used to ask.

   Proxying it under `/6502/api` looked like the obvious move and is wrong in a
   specific way: that process runs with `--root-path /api`, so the `servers`
   block in its own `openapi.json` says `/api`. An interactive client reading
   that document from under a second path would issue its requests against
   `/api/v1/...` on **this** host, which is the roof's own API. They would not
   fail. They would answer, from the wrong service, which is worse than either
   a 404 or a CORS refusal.

   So what is left is the real move: the service running under the apex rather
   than beside it, at which point `openapi.json` says its own paths and there
   is nothing to reconcile. That is still a decision rather than work.
3. **The explorer's prose.** The owner's. Every page is its own words in its
   own order; what changed is the ground under them.
4. **The archive's deeper pages.** Left in their own design on purpose. See the
   overview page for why: a preservation that has been restyled is no longer
   quite a preservation.
5. **hotbits' identity.** The two pages are structure and nothing else:
   `style/projects/hotbits.css` still overrides nothing, because the palette,
   the display face and the mark are the owner's exactly as the house palette
   was. The day that file is filled in, both pages change and neither is
   edited. That is the silo working rather than a page left unfinished.

   What is not here is the entropy gateway as a service. `/v1/bytes` and
   `/v1/seeds` are not in the published schema at all, so the reference can
   report their absence and cannot describe them.

### Two services, two CORS bugs, both found by asking

The pattern is worth naming because it turned up twice in one day on two
unrelated services, and neither was visible from inside its own repository.

**The 6502 API sends no `Authorization` in `access-control-allow-headers`**, so
the registry can be read from the apex and not written to. `tinymachines/6502#12`.

**The Geiger TRNG sends `Access-Control-Allow-Origin` on a 200 and not on a 410
or a 401.** So a browser can read every success and none of the refusals, which
is backwards: the 410 body is the one that names the key-gated route replacing
it. From a page that endpoint does not say "gone, go here"; it says nothing,
and the failure is indistinguishable from the host being down.
`tinymachines/geiger#4`.

Both were found by a page that asks rather than asserts, and in both cases the
page now reports the gap instead of rendering something that looks fine. That
is the rule from the 6502 work applied to somebody else's service: **the thing
that publishes must not be the thing that claims.**

### Merged is not deployed, and the pages were written for both

`tinymachines/6502#11` added `GET /v1/registry/roms`, an `art=none` form on
every listing, `ETag` with `304` on `If-None-Match`, and `HEAD` on every route.
It is merged. **The service answering at `6502.tinymachines.ai/api` is older
than that**: it has none of them and still sends `Cache-Control: no-store`.
Found by asking it rather than by reading the branch.

So the builder pages ask for nothing that is not answering today, and handle
the `art=none` reply the moment it appears: a listing that hands back a URL
instead of a CHR block is drawn by fetching the URL, in the same
`{"w", "h", "chr"}` shape. Nothing here has to change on the day that service
is restarted, and nothing here is broken until it is.

That restart is not this repository's to do. `6502-api.service` runs out of the
6502 tree, and `CLAUDE.md` is explicit that their units are a proposal from
here rather than an action.

### Three things that are known and not defects

- **A 404 for `/6502/sw.js` on the explorer pages.** Their `app.js` registers a
  service worker at a relative path. It is caught, nothing breaks, and fixing
  it means either copying their modules here to patch them or serving a second
  worker scoped to `/6502/` that would take those pages away from the site's
  own. It goes with the rewrite.
- **The explorer pages have two fewer SVG elements than the originals.** Those
  are the octocat marks `site-nav.js` injects, and the roof provides its own
  navigation. This is written down because it looked like a rendering bug for
  about ten minutes: `block` appeared to draw nothing until the same page on
  the original was measured the same way and found to draw nothing either.
  Its diagram needs a block selected. With one, it is 203 KB of SVG and 22
  ports.
- **The builder pages are blank for a moment, then fill in.** They are live
  data on another origin, fetched after the frame has rendered. Baking them at
  build time would make a page that is wrong between deploys with nothing to
  say so, which is worse than a page that is briefly honest about waiting. All
  three states are said out loud: waiting, empty, and could not be read. The
  second and third are different facts and a reader has to be able to tell
  them apart.

## One engine, many views: where it stands, 2026-08-25

The owner's ask: every 6502 page that runs the chip goes full screen in the
house style, the Lab's play controls become one fixed transport under every
6502 page, and **one engine runs for all of them: a pause in one screen is a
pause in all.** Single representation, many views, same breakpoints.

**What is true now (1.0.65).** The explorer's `chip-controls.js` was already
the single store: running or stopped, the simulated clock in Hz, and the
page's machine registered as its driver, with every control a view of it.
`ChipTransport` is one more view, fixed to the floor of all eighteen explorer
pages, importing the same module URL their pages import so it is the same
instance and not a lookalike. Play, pause, step, back, power cycle and the
clock act on whatever machine the page has; the running state is written
down and restored on the next page, and their clock already persists the
same way. Measured live: play on the explorer, navigate to the chipmap, the
chipmap's chip is running; pause there, return, the explorer is paused.

**One transport per page, 2026-08-25.** The demo pages (primer, programs,
halfshot) build one chip and paint a copy of their transport into every
example panel; with the floor transport present those copies are hidden and
the floor is the only control. Nothing of theirs changes: the floor bar and
the panels are views of the same store and the same chip.

**Why every link into or out of an explorer page is a full navigation.**
Their page modules were written for full page loads: loops, subscriptions
and DOM handles live at module scope with no teardown and no re-init. A
client-side leave left the old page's view subscribed and throwing on
elements that were gone, which aborted the store's `announce()` before it
reached the bar (a pause that applied and never painted); a client-side
return found the module cached and never ran its init (the boot overlay
stuck). `MenuItem.hard`, `isHardRoute()` and the `hard` prop on the
workbench bar make those links plain anchors. Each page starts clean, and
the state crosses by being written down rather than by sharing a document.

**What remains, and it is upstream.** Three things, in order:

1. **A lifecycle for the page modules**: an exported `mount(root)` returning
   a teardown, so a page can be entered and left client-side. This is the
   change that lets the hard links go back to being soft.
2. **One `Machine` shared through the store**, so the chip's own state (the
   half-cycle, the registers, the program position) crosses views rather
   than only the transport state. Today each page news its own machine; the
   store's driver is a per-page object. `chip-controls.js` is the right home
   for the singleton, and it already owns the driver slot.
3. **The Lab and the console join the store.** The Halfwave Lab runs its own
   engine with its own transport (the one the bar is modelled on); Die
   Runner runs frames over the HTTP API. Both need an adapter that registers
   as the driver and reads the clock from the store, and then the bar is the
   one transport on every 6502 page rather than on the explorer's eighteen.

None of these are reachable from this repository without forking the
modules, which the working agreement says not to do; they are the engine
sub-project's first work when it arrives here.

## The 6502 as four tracks, and what the cart lab needs, 2026-08-25

The owner's shape, now on the landing: **Learn, Cart, Lab and tools,
Archive**, each a sub-landing at `/6502/<track>` and named once in
`web/lib/tracks.ts`, which the landing, the menu and the crumbs all read.

**Landed this round.** The walkthrough (`docs/6502/build-your-first-cart`,
both languages) and the one-URL brief (`/6502/cart/brief.md`: the walkthrough
plus the console contract, cartridges, the registry and MCP, assembled from
the docs at request time so it cannot drift). The public mint feeds step one.

**Next, in order, and what each needs decided:**

1. **Mint hands out a cart code.** LANDED 2026-08-25, as HMAC (the owner's
   call): `api/mint.py` derives the code from the token with a per-install
   secret, claims the page (the handle asked for, or the code) over loopback,
   returns code, handle, page, the console with the starter loaded, and the
   brief precharged. Publishing the starter under the new page is a switch,
   `TM_MINT_PUBLISH_STARTER`, off by default so the public feed is not one
   Die Runner per newcomer. The original ask, for the record: minting a token also
   creates a slug, the slug is the cart code, and a default cart is set up
   under it. Mechanically: the roof mints the token, claims a generated
   handle with it on the chip API, publishes a starter cartridge under
   `<handle>/<slug>`, and returns token, handle and slug together; the brief
   at `/6502/cart/brief.md?slug=<slug>` is precharged with them. Open: the
   phrase "a slug that decrypts with their key". If it means the slug is
   derived from the token so the pair can be verified, that is an HMAC and
   costs nothing. If it means the token can be recovered from the slug, that
   is a secret in a URL and should not be built; the slug should identify,
   the token should authorise, and only the token should be secret.
2. **The starter cartridge.** Which ROM is the default cart, and where it
   lives (the games repo mints Die Runner on deploy; cartridge zero is Snake).
   All the test programs packaged as one cartridge, as the owner asked, is a
   games-repo change.
3. **The cart lab.** Editor, tester, prober, exploration tool, on one page,
   against the currently loaded cart. Depends on 4.
4. **One engine, many views.** `chip-controls.js` is already the store; the
   transport is its view; every link into or out of an explorer page is a
   full navigation until the modules get a lifecycle. The remaining steps
   are upstream and unchanged from the note above: a `mount()`/teardown per
   page module, one `Machine` shared through the store, and the Lab and the
   console registering as drivers. Then "every screen with a play button is
   subservient to the loaded cart" is one store and one machine, and the
   browser is the console.

**Notes for later, from the owner:** expand the 6502 hardware; the hotbits
animation on bradley.io, copied over.

## The console on the store, and the driver proposal (after 1.0.85)

The console (/6502/games) is the last 6502 page to get the floor strip. Its
game.js is upstream's byte for byte and exports nothing, so
`games/ConsoleDriver.tsx` bridges through the ids the page already promises
game.js: it registers `{reset, halfCycle}` with the one store, presses the
console's own power or pause button when the store's running state differs,
and reads the console's state back off those buttons through a
MutationObserver. The strip takes a `caps` map and shows only what the page
can honour (the console: start and play); the driver saying so itself is the
first item of `notes/upstream-transport.md`, the written proposal for the
6502 repository (caps, power, sync/op, length/seek, lifecycle, shared
Machine), with the Lab's player as the model.

## Checkpoint, 2026-08-26, at 1.0.102: the suite is green

State: live at 1.0.102; `bun run e2e` passes 327/327 against production in
about four minutes. Since the 1.0.96 checkpoint: the full strip on every
instrument page (1.0.97/98), the tool pages on the kit's edge with one
transport each (1.0.99), the schematic row (1.0.100/101), the e2e suite and
its first findings (1.0.102). Harness scripts in the scratchpad are now
superseded by `web/e2e/`; only the contact-sheet builder (`mobile/`) stays
there, the artifact is current for 1.0.101.

Open, in order: the starter cart (`TM_MINT_PUBLISH_STARTER`, framed by the
owner's batch of carts); prove the GitHub loop live once the owner signs in;
the one engine, step 1 (`notes/one-engine.md`); the upstream proposals in
`notes/upstream-transport.md` (transport driver shape, `sw.js` path, the
changed-since panel, the explorer's `F` key). Every rule added from here
gets its spec in the same change.

## The e2e suite: unreasonable perfection, automated (2026-08-26)

`web/e2e/`, Playwright Test on the system Chrome, `bun run e2e` against
production or `BASE=` a preview; `./scripts/deploy.sh --e2e` runs it after a
deploy. Ten specs, one per rule the site was held to by hand this week:
pages (one h1, lang, one flag the other way, no em dash), mobile (0px
sideways at 390 on all pages and 360 on the English ones), manage (the
signed-in card injected), header (one bar, the menu at one x on every page),
strip (the Lab's set in order, disabled where a page cannot honour it, two
rows on a phone), fullscreen, kit (no 2px borders or wide radii on the
ported pages, no page transport beside the strip), parity (upstream links,
query state and block cards), footer (the API's version, never clipped),
api (openapi generated, the brief carries no token, strangers get 401).
The page list is the live sitemap; every spec asserts a count before a
property. `web/e2e/README.md` is the table. Output in `web/e2e/out/`,
gitignored.

## 1.0.101: the schematic, chip map and blocks checked against upstream

All three answer on the roof as they do on `6502.tinymachines.ai`: the
schematic reads `?signal=&dir=&depth=` to the same caption, the chip map
derives its containers, the block index and `block?b=` views carry the same
in-content links (diffed, none missing). Two fixes from the comparison, both
in explorer.css: the signal filter (a search input upstream never styled,
whose browser box our reset removed) wears the kit's field; the direction
buttons, wider in the house mono face, wrap in their cell instead of running
into the Chip I/O switch. Harness: `cmp.mjs`, `links.mjs`, `sch.mjs`.

## 1.0.99: the tool pages wear the kit's edge; one transport per page

- **`web/lib/kit-borders.ts`**: a pass over the ported stylesheets (explorer
  and Lab, in their `scope()` functions) that rewrites what a rule says
  rather than listing what it is called: 2px and 3px borders become 1px,
  radii above 2px become `var(--radius-hair)`; percentages, outlines and
  0/1px stay. Measured on the explorer: 99 border weights and 92 radii
  rewritten; on production every element at 2px or above is gone, and the
  only 4px corner left is `.console`/`.panel`, the kit's `--radius-mod` set
  deliberately in explorer.css. Throws if it changes nothing.
- **The pages' own transports are hidden where the strip honours the same
  action** (components.css, section 27): the explorer's power/back/run/half/
  cycle and clock select, the blueprint's four buttons and clock, the
  tracer's transport box and clock, exploded's and schematic's run/step/
  reset, plus the two fullscreen glyphs the first list missed (`#tc-`,
  `#sch-fullscreen`). Every upstream driver's `step` is a half-step and
  `reset` a power cycle, checked in the 6502 tree before hiding. The
  explorer's instruction step and timeline stay until the strip's op and
  seek are live. Halfshot, trace, decode and timing register no driver, so
  nothing of theirs is touched.
- Harness: `live.mjs` (strip liveness plus every element with a bold border
  or a wide radius, per page), `ctl.mjs` (every control with its border).

## 1.0.97: the full strip, the manage page on a phone, the one-engine note

- **The strip is the same set of controls on every instrument page**, the
  Lab's set: power, start, half-steps, play, cycle, opcode, rate, seek,
  position, full screen. A control the page cannot honour is disabled with
  the reason in its title, never hidden (owner: "always show the full strip").
  Power, opcode step and seek are disabled everywhere until the one engine
  (`notes/one-engine.md`); the console's half-steps are disabled because it
  runs whole frames.
- The seek slider fills its line, so on a phone the rate, position and full
  screen share the second row; the Lab's own seek gives way the same way
  (`lab.css`), which is what had put "full" on a third row.
- `/6502/manage` scrolled sideways on a phone **only when signed in**: the
  account card is a grid item that grew to its tokens table's minimum width
  (501px at 390). Column `minmax(0,1fr)`, `min-width: 0` on cards, tokens
  stacked per row on phones. The sweep never saw it because it was signed
  out; the harness now un-hides every `[hidden]` section and injects the
  account card before measuring (`ovf2.mjs`).
- `notes/one-engine.md`: the finale, one engine in the strip driving every
  screen, local wasm or the API, with the order of arrivals.

## Checkpoint, 2026-08-25 (night), at 1.0.96: one bar, the mobile sweep

**Live and verified.** A phone sweep of every sitemap page (102, both
languages, 390x844, full page, the overflow read on each) is the new
harness alongside the triptych; the contact sheet is a Claude artifact. It
found six pages scrolling sideways (inline code with no break point: a
42-character identifier, and in Japanese a run of paths joined by an
ideographic comma the browser will not break before), fixed in 1.0.94 by
one rule, `overflow-wrap: anywhere` on inline code; and the locked footer
clipping its version run, fixed in 1.0.95 by letting the run drop to a
second line (the footer's height is measured live, so the page's padding
follows).

**1.0.96, the headers, the owner's brief.** One bar on every page
(`Topbar` in `SiteFrame.tsx`, used by the Shell and the workbench): the die
tile as section indicator and the wordmark on the left, an instrument's
name beside the mark (on a phone the word steps aside and the tile alone is
home); one flag on the right, the OTHER language's, half again larger, then
the menu, at the same x on every page (the workbench bar had its own
padding, which was the explorer's "shifted menu"). Full screen moved to the
right end of the floor strip on every instrument page (the chip transport;
portalled into the Lab's own player row) and is the WHOLE document, bar
hidden, page still scrolling, the same button the way out. Removed: the
bar's fullscreen slot and floating exit, the explorer's "Launch full screen"
button, the explorer's and chip map's own toolbar buttons (hidden by CSS;
their scripts bind by id). Section strips read the bar's measured height
(`--app-head-h`) rather than a constant.

**Open.** The explorer's upstream `F` key still fires its die-only
fullscreen (upstream proposal). The Lab's strip on a phone wraps to three
rows with the button alone on the last. Everything from the 1.0.93 list
still stands: the starter cart decision, proving the GitHub loop live, the
cart lab, the JA review, the upstream proposals.

## Checkpoint, 2026-08-25 (evening), at 1.0.93: cart-building mode

The owner's direction: shift into cart building and make it easy at every
level. Done since 1.0.90:

- **Sign in with GitHub** on the roof API (`api/auth.py`, migration 3:
  `logins`, `sessions`, `builder_tokens`). Sessions are HttpOnly SameSite=Lax
  cookies stored by digest; the OAuth app lives in
  `$STATE/github.secret` (JSON, 0600, owned by the unit's user: it was
  written as root once and read as "not configured" until chowned). Routes:
  `/v1/auth`, `/v1/auth/github(+/callback)`, `/v1/auth/logout`, `/v1/me`,
  `/v1/me/tokens` (mint held by the account, 3 live max, counted per
  account), `/v1/me/tokens/{id}/reissue` (revokes in the registry and moves
  the page to a fresh token: two direct UPDATEs on the registry's `tokens`
  table, the one place the roof touches its schema; a `transfer()` upstream
  would replace it), `DELETE /v1/me/tokens/{id}`. 103 API tests.
- **The editor** (`/6502/manage`): `Account.tsx` above the public mint
  (sign in, token table, mint/re-issue/revoke, every token handed to the
  editor's own `#token`/`#signin`), and `Brief.tsx`: the brief with the key
  in it, composed in the browser (`lib/brief-token.ts` `withToken`), copy or
  download as `SKILL.md`. The server never serves a token.
- **The brief** is one text (`web/lib/brief.ts`) served as
  `/6502/cart/brief.md` and, with skill frontmatter, `/6502/cart/skill.md`
  (name `tm6502-cart`); it gained a "How to work" section (prove the chain
  before writing a game). The walkthrough (EN/JA) describes the account and
  the skill.
- **Menu**: page scroll locked while open, scrim closes it at every width,
  button reads Close/閉じる while open, and an account row at the foot
  (Sign in with GitHub, or who you are + your tokens + sign out).

Open, in order:

1. **The starter cart decision** (`TM_MINT_PUBLISH_STARTER`): which cart,
   and whether a fresh token publishes it by default. The owner is
   generating a batch of carts to frame this; the skill should teach one
   cart layout (`cart.s`, `tiles.chr`, `cart.json`, a measure script).
2. **Prove the GitHub loop on production** end to end (owner signs in;
   mint, re-issue, brief with key, publish under the new token).
3. The cart lab; owner review of Japanese drafts; upstream
   (`notes/upstream-transport.md`, plus a registry `transfer()`).

## Checkpoint, 2026-08-25, at 1.0.90

The "unreasonable perfection" zone is closed on this side: the Lab-shaped
floor strip is the one transport on every page that runs the chip
(explorer, the seventeen pages, the primer, the console); every page
declares canonical, hreflang, translated title and description, structured
data, and is in the sitemap; every page unfurls into a card drawn from its
own words. The full triptych (22 pages, 3 widths, 2 languages) is clean.

What is open, in the order it is worth taking:

1. **Upstream** (the 6502 repo, not from here): `notes/upstream-transport.md`.
   caps first; then op (sync), scrub (length/seek), power; then module
   lifecycle and the shared Machine. When caps land, retire the console's
   button-id bridge (`games/ConsoleDriver.tsx`) and the per-page `caps`
   props.
2. **The mint's starter cart**: whether a fresh token publishes
   `tinymachines/die-runner` by default (`TM_MINT_PUBLISH_STARTER`), and which
   cart is the starter. A decision, then one env line.
3. **The cart lab**: the full editor experience beyond /6502/manage.
4. **Owner review of the Japanese drafts** (the artifact "The Japanese
   Corpus" holds the rulings so far).
5. Small: docs-tree gap on the docs landing; the parts table's scroll
   affordance; the tracer crumb at tablet.

## Social cards, after 1.0.88

Every page's `og:image` is `/og/<its path>` (`/og/ja/...` for Japanese),
drawn on the server by `web/lib/card.tsx` from the same words the page
declares (`web/lib/pages.ts` is the one table of fixed pages; the docs tree,
the explorer's own `<head>` and the registry feed the rest) on the house
paper with the project's accent band, the die tile and the address. A
builder's card asks the registry for their name and latest cover and draws
the CHR picture itself (`chrSvg`). The renderer reads TTF/WOFF, so
`style/fonts/og/` carries the site's faces in those containers (the Google
woff2s are variable fonts and had to be instantiated at their weights) and a
5 MB subset of Noto Sans CJK JP; `data/check-og-font.py` fails the build on
a Japanese character it cannot draw. `/og` is excluded from the language
rewrite in `next.config.ts`; without that it became `/en/og/...` and a 404.
The explorer pages' titles are now in the overlay too, so their Japanese
pages and cards carry Japanese names.

## SEO, at 1.0.88

Every page is built from one call, `pageMeta()` in `web/lib/seo.ts`: title
and description translated through the overlay (55 entries added to
`data/ja.json`, the explorer pages' own `<meta description>` read by
`lib/explorer.ts` beside their title), canonical, `hreflang` en/ja/x-default,
Open Graph and Twitter fields, `noindex` where a page asked for it (admin,
the zoo). The origin comes from the manifest's site surface, not a literal.
`app/sitemap.ts` lists both languages of every static route, docs page and
explorer page (102 entries), generated from the same sources the pages are;
`robots.ts` points at it. Structured data: `WebSite` on the home page,
`TechArticle` on every document (with `inLanguage` telling the truth about an
untranslated body under /ja), `BreadcrumbList` from the same trail the page
shows, in both the Shell's Crumbs and the workbench bar. `check-build.mjs`
now fails a page without canonical, all three hreflang links, a description
or an og:title. Not done, by design: builder pages are not in the sitemap
(listing them would put a live service in the build); the social image is
the square site icon until the social stream draws one per page.

## Checkpoint, 2026-08-25, at 1.0.84

**Live and verified (triptych, 23 pages, both languages, zero overflow):**
the slim frame (one-row bar, card menu scoped to the floor you stand on,
locked one-line footer); the accent knob per project; the Japanese edition
with its own typography rules; the public token mint with the HMAC cart code
and the page claimed at mint; the four-track 6502 landing with sub-landings;
the first-cart walkthrough and the one-URL AI brief; the workbench standard
set on the Lab and carried to every instrument: the site's bar as the only
header (short menu names for titles, a fullscreen slot with the way out at
the corner), the instrument's own header collapsed to its strip, a section
strip on the reading pages, one floor transport per page that withdraws
where no chip comes. The porting voice is out of the copy.

**Next zone, the owner's list, in order:**

1. **The Lab's player strip becomes the standard floor transport** on every
   instrument page: power, start, half-cycle back and forward, play, cycle
   and opcode steps, the rate as a slider with its label, the position
   readout. What the store's driver interface supports today: power (reset),
   half-cycle back/forward, play, and the clock. Cycle-step is two
   half-steps; opcode-step needs a `sync` reader and a scrubber needs a
   position and a seek, and both are upstream additions to the driver shape
   in `chip-controls.js`. The strip should show only the controls the page's
   driver can honour.
2. **SEO.** Per-page titles and descriptions that read as sentences,
   canonical URLs, `hreflang` pairs for en/ja, a sitemap and robots, JSON-LD
   for the site, the project pages, the documents and the builders' pages.
3. **Social.** Open Graph and Twitter cards on every page, with a generated
   image per page (title on paper with the project's accent; a cartridge's
   own cover on a builder's cart page), so a link pasted into iMessage, X or
   Slack unfurls as the page and not as a bare URL.

## The console, 2026-08-26: one shell for every ratio

The owner's handoff pack (`notes/console-shell/pack/`, from five candidate
blueprints and the prior geometry sheets) asked for THE console: a
chamfered-octagon screen sized to the short side, flex zones taking what the
ratio leaves over, controls docked by priority, deterministic 45-degree
facets absorbing the rest, the machine as part of the game, four pages
swiped on the glass. It is live at `/6502/games`, both languages.

What it is, in this repo's terms:

- **A solver, pure and tested.** `web/lib/shell/solve.ts` takes a viewport
  and a seed and gives the whole shell in units: mask, integer scale, zones,
  docks, facets, and a params footer. `bun test lib/shell` runs the pack's
  M1 to M3 gates over its ratio matrix and hashes two runs against each
  other. Nothing on the page is placed by hand.
- **A parts kit that is not a font.** Every control is polygons on the half
  module at 0, 45 or 90 degrees; the credits counter is seven segment
  polygons per digit; the words on a control are the text of the button
  laid over it, so nothing scales with the frame that should not.
- **The same DOM contract.** game.js is still byte for byte upstream's. The
  shell docks the four `[data-dir]` buttons, presses `#b-power` and
  `#b-pause` for the rocker and the pills, drives `#cart` from the shelf,
  and reads its phase off what game.js paints (`consoleState.ts`, shared
  with the floor strip's driver so the two cannot disagree about a pause).
- **The machine.** Coins are given by the acceptor and spent to continue
  after game over (NOTICE.md's rule, unchanged). The LED is off, ATTENTION
  orange while booting, ACTIVE blue while live; never red, because red is a
  failed assertion on every page of this site. Hold the rocker to switch
  off. Turning the phone re-solves in place with the credit kept.
- **The pack's two wrong assumptions, filed rather than fudged**
  (`notes/console-shell/ISSUES.md`, twelve entries): the native screen is
  128 x 128, one page of chip memory, so the crop camera has nothing to
  crop; and the controller byte carries four directions, so A and B are
  docked, drawn and disabled with the reason, which is the floor strip's
  rule applied to a console.

Refused, with the reason on the settings page: rewind (the engine keeps no
snapshots), achievements (nothing mints them), a palette loader (a
cartridge carries tiles; the colours are the die's layers). Not built: the
pack's M5 raster ladder, since the shell is served live from the solver at
every size and the sheets are SVG (`bun scripts/shell-sheets.ts`).

The rule for the next arrival: `web/e2e/shell.spec.ts` is the console's
gate, and a change to the shell lands with its assertion.

## Checkpoint, 2026-08-26, at 1.0.103: the console is live

State: `/6502/games` is the console shell from the handoff pack, both
languages; `bun test lib/shell` green (13 tests); `bun run e2e` green on
production, 337 of 337, the ten new gates in `web/e2e/shell.spec.ts`; the
phone sheet re-shot at 1.0.103, 102 of 102 pages without overflow.

Open, in order: the starter cart decision, framed by the owner's batch;
prove the GitHub loop live; one engine step 1 (`notes/one-engine.md`); the
upstream proposals (`notes/upstream-transport.md`: driver shape, `sw.js`
path, changed-since panel, the explorer's `F` key, and now the controller
`buttons` map so A/B come alive); cartridge theming once a cartridge can
carry a theme (`notes/console-shell/ISSUES.md` #8).

## The module map and the engine gate, 2026-08-26

`notes/modules.md`: every module in `web/`, `api/`, `style/`, `data/` and
`projects/`, what depends on what (read off the imports), the complete
third-party list, and a table of every edge out of this repository with the
check that holds it. Written because the 6502 project is going to manage and
release halfphi, and the roof had no way to say which engine it was serving.

What the survey found, measured on the box:

- halfphi is two copies (`6502/crates/halfphi`, developed; `tinymachines/halfphi`,
  published), identical today, both `0.1.0`, no tags, not on crates.io. A
  version is a commit; the digest of the five shared files tells builds apart.
- Nothing between a 6502 commit and its release runs its tests: the mirror's
  CI tests the mirror, and `6502/deploy/deploy.sh` runs no `cargo test`.
- The served release `v0.235` was built from `ed8030f`; the checkout the roof
  builds its explorer pages from was at `15e5717`; the halfwave binary's
  mtime predates the release commit. Nothing had said so.
- The console's copied modules (`web/public/6502/games/`) matched no upstream
  commit, because two were patched on top of an unrecorded base (read at
  build time since later that day; the note's proposal 4).

The gate: `scripts/board-engine.py --board` runs `cargo test -p halfphi`
(`HALFPHI_REQUIRE_CHIPS=1`) and `cargo test -p v6502-sim`
(`V6502_REQUIRE_GOLDEN=1`) in the 6502 checkout, refuses a dirty tree, and
writes `data/engine.json` only when everything passed: 39 tests in 9 s on
the first run. `--check` is `deploy.sh` stage 2e and refuses when the served
release, the halfwave digest or the tree is not the boarded one; it skips,
saying so, where there is no 6502 checkout. The skip guard was proved by
hiding the golden oracle and watching the board refuse.

**The check fails today on the release lag above**, which is right: the roof
does not deploy until the 6502 project releases `15e5717` (its own deploy;
not done from here) or `ed8030f` is boarded deliberately. Four proposals
upstream are in the note: `halfwave --version` stamped with the commit, tests
in the 6502 deploy with counts in `build-info.json`, tags on halfphi releases,
and a recorded base for the copied console modules (or reading them at build
time like the explorer).

## halfwave names itself, 2026-08-26

Proposal 1 from the module map, done upstream at `6502@0ca70c2` with the
owner's say-so: `crates/v6502-sim/build.rs` stamps the binary with the
workspace version and the commit (out of `.git`, `-dirty` when unclean,
`unknown` outside a checkout); `halfwave --version` prints it, the `META`
reply carries it, `/v1/meta` passes it through, a service test holds the
shape. The 6502 site was released at that commit, halfwave rebuilt and the
API restarted; `/v1/meta` on the live service reports `0.1.0 0ca70c24`.

`scripts/board-engine.py` now takes four measurements instead of three: the
binary's stated commit and the running service's commit join the release
commit and the tree. A rebuild without a restart, which nothing could see
before, is a named fault now. Still open: tests in the 6502 deploy, tags on
halfphi releases, a recorded base for the copied console modules.

## The 6502 deploy tests before it builds, 2026-08-26

Proposal 2, done upstream at `6502@0a41ba6` and `462cc59`: `deploy.sh`
builds halfwave, runs `cargo test --workspace` (chips required, golden
required where the oracle exists and logged where not) and `pytest service/`,
refuses to publish on a failure or a zero, and `build-info.py` writes the
counts as `tests` beside the commit. Release `v0.246` carries
`cargo 91 passed, service 176 passed`.

The first run refused, correctly: 56 service tests failed under the unit and
passed by hand, because systemd's PATH reaches `/usr/bin/node` v12 and the
assembler reads `NODE`. The trap CLAUDE.md lists under "anything a deploy
shells out to" bit a third time, and the gate caught it before anything was
published. Node is resolved ahead of the tests now.

## halfphi 0.1.1, the first tagged release, 2026-08-26

Proposal 3, done upstream. `6502/tools/release-halfphi.sh X.Y.Z` is the
release: both `Cargo.toml`s bumped, the changelog's `[Unreleased]` dated,
a commit and an annotated tag on each repository (`v0.1.1` on halfphi,
`halfphi-v0.1.1` on 6502) carrying the shared-file digest, pushed. Gates
first, on the bytes being tagged: parity, fmt, clippy, the three chips
required, doc, and this workspace's halfphi test. Two refusals on the way
were both right: a dirty tree (the tool's own uncommitted file) and a
`tee | grep -q` race under pipefail; a third stop, halfphi's ignored
`Cargo.lock` refusing `git add`, became `add -u`. `v0.1.0` was tagged after
the fact at `700331e`, the commit the changelog already linked to.

`board-engine.py` records the tag beside the digest and shows it in the
stage 2e line. The site's version stamp excludes `halfphi-*` tags. Not done,
by decision: crates.io. Still open: proposal 4, the copied console modules.

## The console's modules are read, not copied, 2026-08-26

Proposal 4, the last of the module map's four. `web/lib/console-modules.ts`
reads `game.js`, `console.js`, `chr.js`, `art.js`, `registry.js`,
`manage.js`, the two ROMs and the tile sheet out of `../6502/games` at build
time, the way the explorer's pages and the lab are read, and applies the
three patches (the chip API off the page in `game.js` and `registry.js`, the
builders' base in `game.js`) as exact matches that throw when upstream's
line changes. `scripts/pull-console.mjs` writes them to
`web/public/6502/games/`, now gitignored, with `upstream.json` naming the
commit and every file's digest: the base the copies never had. The two
CC BY-NC-SA ROMs are no longer in this public repository.

`bun test lib` is `deploy.sh` stage 1b now; nothing ran the shell's or the
console's tests at deploy before. The first draft's registry.js anchor
matched inside `export const` and put the patch comment between the two
keywords: legal JavaScript, found by diffing the generated files against the
old copies, and the reason the test now checks the API statement itself.

## Checkpoint, 2026-08-26, at 1.0.108: the engine is boarded, the map is closed

One day, five deploys (1.0.104 to 1.0.108), and the 6502 repository went
from `15e5717` to `1df1e68` with five commits of its own.

**What is true now.**

- `notes/modules.md` is the map: every module, every dependency, every edge
  out of this repository and the check that holds it.
- The engine is boarded, not assumed. `scripts/board-engine.py --board` runs
  the 6502 checkout's suites here and records `data/engine.json`; `deploy.sh`
  stage 2e refuses any release, binary, running service or tree that is not
  the boarded one. Four measurements, all agreeing.
- Upstream, all four proposals done: halfwave stamps its commit and `/v1/meta`
  reports it; the 6502 deploy tests before it builds and the release carries
  the counts (`cargo 91, service 176`); halfphi is released by one command,
  tagged on both repositories at one digest, 0.1.1 first; the console's
  modules are read from `../6502/games` at build time with three exact-match
  patches, and the copies (two NC-SA ROMs among them) left git.
- `bun test lib` runs at deploy (stage 1b). e2e 336 passed at 1.0.108.

**The routine after a 6502 release.** The release rebuilds halfwave and says
so; restart `6502-api` by hand, then `python3 scripts/board-engine.py
--board`, then deploy the roof. A failing stage 2e is a lag, not a bug.

**Open, in the order agreed before today.** The starter cart decision
(`TM_MINT_PUBLISH_STARTER`), proving the GitHub loop live, one engine step 1
(`notes/one-engine.md`), the transport proposals in
`notes/upstream-transport.md`, cartridge theming (console ISSUES #8), and
crates.io for halfphi, which stays a decision rather than a default.

## One strip, and power is real, 2026-08-26

The strip is mounted once, in the 6502 layout, and renders on any page that
declares a chip floor (`.workbench.has-transport`); the pages mount nothing
and hand it no capability map. What it offers is what the registered
driver says (`driverCaps()`), disabled where not offered. Power is the first
key and solid while a machine is powered: off, the store refuses to run or
step and the switch is written down (`v6502.power`), so the next page opens
off. Opcode step (`stepInstruction`) and seek (the Machine's rewind window;
forward by running) are live on every wasm page. And the machine crosses
pages: `6502/web/chip-machine.js` restores each page's Machine from the
snapshot the previous page left, same program only, with a deep link that
names a half-cycle outranking it.

Upstream: 6502@d50c52e, release v0.251, boarded. Held by `_chipnav-test.html`
section 1b (a fake Machine: caps, op, seek, power, unregister) and a two-load
wiring test (leave at 51, arrive at 51); on the roof by `e2e/engine.spec.ts`
(power off greys the rest, op advances by at most one instruction, seek
moves the count, explorer to tracer at 51, the console's set) and
`strip.spec` (one strip, every key live on a wasm page).

The console's shell still acts through game.js's buttons; the driver
declares caps and power now, the shell's keys are next. `notes/strip-recon.md`
is the survey; `notes/one-engine.md` the order.

## Every instrument on the store, and the Lab is read, not copied, 2026-08-26

Later the same evening (6502@4f8bebb then 64b093f, roof 1.0.110 to 1.0.113). Three pages were off the
store: trace.js kept a private running flag and a fixed three half-cycles a
second, so the strip could pause every page but that one; halfshot registered
no driver; the Lab had its own player and its own `POWER`. Now trace and
halfshot register drivers that seek over their rows (no power switch, since a
recording is not booted; no opcode step, since the rows carry no SYNC to stop
on), and the Lab registers through a handover the strip makes
(`window.tmChipStore`, or a `tm:chip-store` event when the Lab's script ran
first), paces its play off the store's clock, and marks its player `driven`,
which lab.css hides. Standalone on halfwave.tinymachines.ai nothing is
provided and nothing changes. One strip on twelve pages.

Found on the way: the Lab's HTML was a committed copy at `projects/6502/lab/`
since 2026-08-23, hand-edited for em dashes, with no recorded base, and (as
it embeds a canned trace of the chip) carrying the die data's licence into
this public repository. The same three costs the console's modules paid that
afternoon. It is read from the 6502 checkout at build time now, the em-dash
pass runs over the whole document (a comma before a conjunction, a colon
otherwise), `public/6502/lab/upstream.json` records the commit and digest,
and `lib/lab.test.ts` holds that no dash ships, the API is named, and the
Lab registers. Upstream this is held by `_chipnav-test` (trace has the
header transport; the two-load test waits for the boot first); on the roof
`strip.spec` runs on twelve pages with `NO_SWITCH` and `NO_OP` naming the two
recordings, and `engine.spec` drives the Lab from the strip (op moves its
own readout; power off shows its off note).

Three rounds it took to hold, each found by the suite and each a seam: the
strip's view unsubscribed itself (an effect dep on the state it set); the
Lab attached mid-boot and never reported the boot landing; the console's
mirror pauses on every announce rather than on the store's running edge.
Suite at 1.0.113: 347 passed.

## The console's keys act on the store, 2026-08-26

1.0.114. The shell's power rocker, reset and start went through game.js's
own buttons (`#b-power`, `#b-pause`) and kept an `off` flag of their own, so
the console had three surfaces for pause and one of them the strip could not
see. Now `games/chipStore.ts` takes the store from the strip's handover (the
same `window.tmChipStore` / `tm:chip-store` the Lab uses), and every key is a
call on it: a tap on power is `toggleRunning`, a hold is `setPower(false)`,
reset is `reset`, start spends its credit into `setPower(true)`. Off is the
store's fact (`isPowered()` false over a paused machine), so the LED, the
HUD and the strip's power key cannot disagree. The clicks remain only as the
fallback for a page whose strip never loaded a store, and they are what the
console's driver makes of the store's calls anyway. `shell.spec` holds the
hold-to-off round trip against the strip and `sessionStorage`.

## The API engine, and the switch in the strip, 2026-08-26

One-engine step 3. The strip carries an engine pair beside power, local or
api. Local is the page's own wasm Machine, as ever. API is halfwave: the
driver exports the Machine whole, `POST /v1/step` steps it (one half-cycle,
a frame's worth while running, or `until: instruction` for op), and the
answer is imported back into the same Machine, so every page draws exactly
as before and nothing about a renderer changed. The same machine JSON
crosses both ways (`tm6502.mjs` was built on that), which is what makes the
switch mid-run a transfer: local to api sends where you are; api to local
continues from the last answer. The store stops the chip on a switch, so a
half-cycle in flight lands on one engine before the other takes over.

Measured, not assumed: the strip shows the last round trip beside the rate
("api 41 ms"); an API that stops answering stops the chip and the readout
says so. What the API cannot offer is refused: it keeps no history, so back
and seek are grey on it (the driver's caps are a function of the engine).
The console, the Lab and the two recordings run where they run and have no
switch. `?engine=api` names it in a link; the choice persists like the clock.

Upstream 6502@2f9471d (release v0.254, boarded): `chip-controls.js` (`engine`, `setEngine`,
`noteEngine`, `halfCyclesFor(now, who)`), `chip-machine.js` (the runner and
the crossing), `_chipnav-test` 1c against a fake `/v1/step`. Roof: the pair
and the latency in `ChipTransport`, `data-chip-api` on the explorer pages,
`engine.spec` crossing to the API on the explorer and back. Roof 1.0.115 to
1.0.117: on a phone the pair sits on the second row as icons, before full
screen, and the seek slider and readout give so the row holds.

## The headless kind, and the pack, 2026-08-26

Owner's call: the contract gains a kind rather than the engine gaining a
second file format. `console.kind: "headless"` (6502@de82d6b, release
v0.255, boarded) is a cartridge that draws nothing: no screen page, no tick
flag, `half_cycles` to run and `peek` bytes to read out. Verifying one boots
it, runs it, and reads the registers and the named bytes off the silicon;
the last quarter is sampled four times so "the pc still moves" is a claim
about the run and not about two instants (a three-byte BRK loop read as
stopped when it was sampled a whole number of laps apart). The registry
publishes and lists it as one (`kind` in the brief); the file carries no
screen fields, so nobody reads a default screen off a cartridge that has
none; the console refuses to boot one, with the reason. Held by five tests
in `service/test_cartridge.py` and one in `test_registry.py`.

The pack: `games/tools/mint-pack.mjs` reads `web/programs.js` (the seven
programs the explorer boots are the source, so a program added there is a
cartridge here by being added) plus the API page's worked example, and
mints each through `/v1/cartridge`. Minted against the live API on
2026-08-26: counter ($0F reaches $47 in 4000 half-cycles), fibonacci (sum
$68), add (sum $42), multiply ($2A), bits (six ones), copy, fill, and
two-ways-in. Published the same evening under a handle of the pack's own,
`programs` (owner's call: a token minted with `registry_admin.py` on the live
registry, shown once and not kept; the handle claimed through the API; all
eight PUT through `mint-pack.mjs --publish`). The registry ran each again
and lists them as headless: <https://tinymachines.ai/6502/builders/programs>.

On the roof (1.0.118): `lib/registry.ts` carries the kind, the builders'
listing and a builder's page show "draws nothing", the run length, the
registers and the peeked bytes in the measured panel, and the contract page
documents the kind in both languages.

## The console is the whole viewport, 2026-08-26

Owner's call: no bar on the console, just the strip and the console using
every pixel between. 1.0.119 to 1.0.121. The workbench bar is gone from
`/6502/games`; the page's name is an `h1` for the document and screen
readers; game.js's `header .sub` stays as an element with nothing to show.
The stage is `100dvh` less the strip in and out of full screen alike. Two
promises every page makes had to be kept another way: a route home and a
flag for the other language now sit on the console's settings pane, with
the builders and the editor beside them. `header.spec` and
`fullscreen.spec` name the console as the one page without a bar;
`shell.spec` holds that the stage starts at the top and meets the strip.

Found on the way: the shell measured the strip once at mount, and the strip
now arrives later (the 6502 layout mounts it once the store has loaded), so
the fallback height stood and left a 15px gap. The shell watches for the
strip now. And the engine pair read "local" on the console, which runs on
the API whatever the store says: a driver that runs in one place says where
(`caps.runsOn`, 6502@90a6da4, v0.256), and the strip lights the engine that
is actually stepping.

## Checkpoint, 2026-08-26, at 1.0.121: no daylight between the seams

The evening's brief was the strip, and it is done end to end. One strip,
mounted once in the 6502 layout, power first and solid; one store, upstream,
with power, opcode step, seek and the engine choice in it, and every page
with a chip registered on it, the Lab, the two recordings and the console
included; the machine crossing pages by snapshot; a local/api engine switch
beside power with its latency beside the rate, and back and seek refused on
the API because it keeps no history; the console's every key a call on the
store; the headless cartridge kind in the contract and the eight scattered
programs minted from `web/programs.js` and published under `programs`; the
console the whole viewport. Twelve roof deploys (1.0.109 to 1.0.121), six
6502 releases (v0.251 to v0.256), each boarded.

Two copies were retired on the way, both found because the work went
through them: the Lab's HTML (a committed copy carrying NC-SA trace data)
and the console's modules the afternoon before. Both are read from the
6502 checkout at build time now, with a manifest naming the commit.

What the suite found, each a seam and each fixed: a React effect that
unsubscribed its own view; the Lab attaching mid-boot; the console mirror
acting on every announce; a 15px gap from a strip measured before it
arrived; a BRK loop sampled a whole number of laps apart. 349 tests hold
it. Open, and written down rather than pending: the console and the Lab
have no local engine, so no switch (`notes/one-engine.md`); re-publishing
the pack needs the `programs` token, which is not kept anywhere.

## The console page is pinned, not measured

The owner's iPhone (stash IMG_5445, 2026-08-26) showed the seam the suite
had not: a line of the page's prose between the console and the strip. The
stage was `100dvh` less a measured strip, and on iOS the two disagree by a
line; and the prose was under the stage, so the page scrolled into the gap.
Two fixes. The console root is `position: fixed`, ending at the strip's
height, so both are laid out in the same coordinate space on every browser
and nothing is left in flow to scroll. The three paragraphs live on the
console's status page, where the readouts already are. One more found on
the way: a strip present but not yet loaded measures 0px, and the stage
kept it; a height of zero is not a measurement now. `shell.spec` runs the
whole-viewport test on a phone as well as a desk and asserts the document
does not scroll and nothing is under the strip. `scripts/fetch-stash.sh`
pulls a shared zip into `notes/stash/` (gitignored) so a brief can arrive
as a file.

Shipped as 1.0.122 on the engine boarded at `6502@6e9900a` (v0.259). The
board had refused twice first, both correctly by its rule and neither for
an engine difference: once for a tree the 6502 session had dirtied on
purpose (a mutation test on its api.html figures, reverted a minute later)
and once for a halfwave binary stamped `73e0e05` under a HEAD two commits
on, commits that touched no Rust. The gate matches commit identity, which
is what it is for; it did not catch an engine change here because there
was none. The prose-number hole that mutation test proved is recorded in
`notes/modules.md` as open.

## Checkpoint, 2026-08-27, at 1.0.122: the console meets the strip on a phone

The strip's evening ended with one seam the suite could not see and a
phone could: prose between the console and the strip. It is closed by
construction (a fixed root ending at the strip, nothing left in flow) and
held by a phone-viewport test that asserts the document does not scroll.
Engine boarded at `6502@6e9900a` (v0.259). Both trees clean and pushed;
roof at `ece2dce`. Open, unchanged: local engines for the console and the
Lab (`notes/one-engine.md`); re-publishing the pack needs the `programs`
token; upstream's api.html figures are held by no test (`notes/modules.md`
item 5, that project's call).

## 1.0.123, 2026-08-27: the version on every page, one engine key, the Lab's paper tokens

Three of the owner's five items shipped in one deploy (`0ca8cf2`, e2e
349/350, the one miss a network blip on retry); the other two are a
proposal in `notes/forward.md`.

- **The footer is on every page, strip pages included.** `SiteFooter`
  sits at the end of `.wb-main` on the explorer, the eighteen tool pages
  and the Lab, in the flow above the fixed strip; the console, which is
  the viewport, carries it on the status page beside the prose.
  `strip.spec` reads `v<version> · <commit> up` on every strip page.
- **The engine is one key, a toggle like power.** The rabbit, solid, is
  the chip in the page; the turtle is halfwave over the API; pressing it
  swaps. A driver with no switch (the console, the Lab, a recording)
  shows where it runs, grey. The pair had cost the phone's key row a
  slot; eight keys now sit on one row at 390px.
- **The Lab was not wearing the house type outside its panels**, and the
  reason is CLAUDE.md's silent trap: `--disp`, `--mono`, `--sans` and ten
  ladder steps were defined only inside `.panel`, so every rule on paper
  naming one dropped (the tab strip was Plex Sans wearing Archivo's
  tracking). `lab.css` defines the 13 on `.lab-shell`; `lab.test.ts`
  holds the names the Lab's rules use against the names the shell
  defines, and goes red without the block.

**Forwarding the subdomains** is `notes/forward.md`: the redirect map for
all three, and the constraint that orders it. `/api/` cannot be
redirected (a 301 turns a POST into a GET, and the apex's own pages POST
to the subdomain 1,200 times per log), so step 1 is in this repo (the
apex calls `/6502/api`, its own origin), step 2 is the 6502 repo's nginx
(pages redirect, assets and `/api/` stay), and step 3 waits. **Traffic
statistics** follow the forward, on `bradleyio/scripts/visitors_collector.py`'s
pattern; the first move is that the apex gets an access log of its own,
which it does not have today.

## b9ab3ad (still 1.0.124), 2026-08-27: pretext measured, and the visitors board

- **`extern/pretext`** is a submodule (MIT, no die data). `notes/pretext.md`
  has the measurement on the live tracer: heights match the browser 12 of
  12 in the house fonts, `layout()` about 20 times cheaper than a DOM
  measure once prepared. The page's cost is elsewhere: a half-cycle is
  3.8 ms of style recalculation and 1.7 ms of layout from twelve readout
  cards rewritten by `innerHTML`, and the text blob a reader sees is one
  20,661-character paragraph in the tracer's prose (upstream, line 251).
  Where pretext has a job here (card heights without reflow, canvas
  labels, a fits-at-390px check) is in the note; none of it is built.
- **Visitors.** `scripts/visitors-collect.py` reads the four nginx access
  logs on a timer and writes one snapshot, no address in it, that
  `/api/v1/visitors` serves and `/visitors` draws. A read is a document
  served to a person: not an asset, an API call, a prefetch or an error.
  The test runs the collector over nine synthetic lines and checks each
  is counted as what it is. The apex had no access log of its own until
  this round; `deploy/tinymachines.ai.nginx` now sets one, and both hand
  steps (the nginx install, the timer) are in `HOSTING.local.md`.

## 1.0.128, 2026-08-27: the companion articles

Owner's call: a page with a large amount of text is a page nobody reads;
the tracer had two blobs under a full-viewport instrument. Shipped as
1.0.125 in a first form, rewritten the same night, deployed as 1.0.126
through 1.0.128 once the 6502 side served `ddc1480` (the fourth gate
refusal of the day, cleared by their deploy; boarded as v0.264). Three
measured fixes on the way to a clean fit: an inline element's chrome is
measured (drawn width minus pretext's natural width, which catches a
pseudo-element arrow), the paragraph's width is its content width (a
padded note set its lines 21px wide), and the hero and the instrument's
remainder stay in the document hidden so every id the tool's script boots
against exists:

- **`/6502/<tool>/article` for all seventeen tools.** `lib/article.ts`
  lifts the tool page's `section.bp-prose` blocks whole (their widgets,
  tables and the 36 `[data-fact]` slots the tool script fills with
  measured numbers come through and stay live; the block page's whole
  instrument lives in one), splits the tracer's 20,661-character paragraph
  at sentence ends (a test checks the parts join back to the original),
  and rewrites links a segment deeper. The rest of the instrument is a
  live figure above the prose. The tool page links to it under the bench.
- **Justification through pretext**, in place on the DOM
  (`components/Justify.tsx`): pretext picks the breaks from its own
  measurement of each run in its computed font (padding and border of
  `code` included: the first miss), each line becomes a block with
  `text-align-last: justify`, elements move whole into the lines so a slot
  filled later re-sets its paragraph. Measured: 0 lines over their block,
  0 loose, at 1280 and 390, on the tracer (45 of 48 paragraphs set; the
  rest are the browser's, a button or a cut element).
- **pretext is bundled from the submodule at build** (`scripts/build-pretext.mjs`,
  gitignored output, hand-written `.d.ts` held by a test).
- **The golden "before"**: `web/e2e/golden/tracer-before-{desk,phone}.jpg`.
- **Hand step, same nginx install as the access log:** the chip-asset
  location now allows any depth under `/6502/` (the tracer fetches
  `schematic.<hash>.json` relative to the document, and from
  `/6502/tracer/article` that is a segment deeper). Until it is installed
  the bench in the article says "Could not start: schematic.json: HTTP
  404" and `article.spec` fails on that page.
- **Open, found on the way:** every Shell page on the live site throws a
  React hydration error (#418, a text node) intermittently, article or
  not; dev mode shows nothing. Not the article's; not chased tonight.

## Same morning: the hand steps are done, and the board is live

The owner granted standing control of nginx and the related units (memory:
deploy-needs-manual-restarts). The apex nginx file is installed (its own
access log; chip assets at any depth under /6502/, with `^~` on the chip
location after the greedy first form 404'd every tool page's wasm for ten
minutes: a regex location beats a prefix unless the prefix says `^~`, and
the segment group must refuse `pkg/`). `tinymachines-visitors.timer` is
enabled; `/visitors` shows 8,464 reads on four logs. `article.spec` passes
6 of 6 and `engine.spec` 6 of 6 against the live site.


## 1.0.130, 2026-08-27: the gate boards the served release

Owner's call after four refusals in a day on docs commits: `board-engine.py`
now reads the served release's `build-info.json` commit, refuses unless the
running chip API reports it, checks it out into a detached worktree
(`../6502-served`, own cargo target, the generated oracle and layout linked
from the sibling), runs the suites there, and `--check` holds the served
release, the running API and the worktree to the record. The build reads
the 6502 pages from the worktree (`web/lib/chip-src.ts`, the chipdocs pull,
the deploy's sweep); the 6502 working tree is never read. First board:
v0.264 at `ddc1480`, 39 tests, 80 s (a cold cargo build; incremental after).
Two `.git`-is-a-pointer-file fixes came with it (`head_of`,
`upstreamCommit`). The apex nginx asset regex learned to refuse `api/` as a
segment after the deploy's door check caught `/6502/api/openapi.json` being
served as a chip asset; the check earned its place.

## Checkpoint, 2026-08-27 morning, at 1.0.130

Live and green: 441 of 441 e2e against the site. The morning's rounds, in
order: step 1 of the subdomain forward (the apex calls its own `/6502/api`);
the visitors board (collector, timer, `/api/v1/visitors`, `/visitors`), with
the apex's own access log and the timer installed under the owner's standing
grant of nginx and unit control; pretext measured on the tracer and then
built on: `/6502/<tool>/article` for all seventeen tools, prose sections
whole with their live panels, the long paragraph split, justification set in
place through pretext; and the engine gate re-based on the served release
(worktree `../6502-served`, copies not links). Boarded 6502 v0.264 at
`ddc1480`. Open: `TM_SELF_NETS` in `/etc/tinymachines/visitors.env` (hand);
the intermittent React #418 on Shell pages (pre-existing); the magazine
design brief (owner's); forward steps 2 and 3 (`notes/forward.md`).

## Same day: the tracer page's two blocks, as paragraphs

Owner's ask: the tracer page itself, on a phone, was two walls of text,
the caption under the drawing (6,604 characters the script writes as one
string) and the 23,341-character paragraph under it. The sentence-end
split the articles use moved into `web/lib/prose.ts`, one copy, and
`explorer()` now applies it to every tool page's prose; `Justify` mounts
on the tool page too, and cuts the script-written caption at sentence
ends in the browser, re-setting it every time the script rewrites it.
Measured 0 overflowing lines at phone and desk; `e2e/tool-prose.spec.ts`
holds it. `notes/pretext.md` has the round.

Then, the owner's call: folded after the first three paragraphs of each
section behind a native `<details>` reading "Read on" (`foldSection`,
`web/lib/prose.ts`; the article never folds, and a section carrying a
widget never folds). The tracer on a phone: 6,502 pixels folded, from
19,413 as paragraphs and 54,741 as the two blocks.

Then 1.0.133: the article link under the prose shares the prose's wrap
box, so it lines up with the fold's summary (its rule had lived in
`article.css`, which the tool page never loaded). And the golden
reference, owner's call: `web/e2e/golden/tracer-golden-{phone,desk}.jpg`,
taken from the live site at 1.0.133, 6,846 CSS px tall at 390 against
the "before" pair's 18,247. `web/e2e/golden/README.md` lists both.

## Same day, the riff: chunks, peeks, the table

Owner's brief after the golden: no lab on the article, keep the two-tone
header, "Read on" with a faded peek and a pointer, a heading for each
chunk of related paragraphs on both pages with the folds breaking there,
and a table for the text blobs. `data/articles.json` is the table (the
tracer: 23 chunks, each `heading` plus the words it starts `at`; an
anchor not on the page fails the build). `chunkSection` in
`web/lib/prose.ts` heads each chunk and, on the tool page, folds it
behind a clipped, fading copy of its first paragraph; the article gets
the headings and the tool's own hero as its head, and no bench.
`notes/pretext.md` has the round.

## Same evening: the other pages fold per heading block

exploded, schematic, halfshot, timing and decode were to be chunked like
the tracer; read, they already have three to five `h2` blocks each, so
the change is the fold rule, not the table: one fold per heading block
under its heading and lede (`foldSection`, `web/lib/prose.ts`), never
around a widget, never shorter than 400 characters. Reaches every tool
page without a table entry; nothing on any page has a heading inside a
fold. `notes/pretext.md` has the round.

## Same evening, second pass: two tones, one Read on, no caption

Owner's notes on the golden: the headline had gone all black (the
tracer's h1 never carried the explorer's accent span; `explorer()` now
supplies it after the first comma); one "Read on" travels down the page
(one `:has` rule hides everything after the first closed fold); the
6,600-character caption under the drawing is hidden (Justify marks a
`.bk-foot` longer than a paragraph, explorer.css hides it).

## Same night, third pass: the article folds too, one Read on, the strip, the copy

The article gets the tool page's reading rules (folds, one travelling
"Read on"); an opened fold's summary disappears; the article button is
its own colour at the summary's size; the full-screen key moves up to
the strip's key row on a phone; the API reference's self-description
and coverage counters are removed as placeholder copy (owner's list).
`notes/pretext.md` has the round.
Then, mid-round: the article is just the article (owner): hero head,
subheads, nothing folded, no tool button, a Return button at the end.

## Checkpoint, 2026-08-27 night, at 1.0.142

Live: 1.0.142 on 6502 v0.264 (`ddc1480`); the gate boards the served
release. Both trees clean and pushed. What the day built, in order:

- The tracer page's two blocks of text became paragraphs (`lib/prose.ts`,
  one sentence-split rule for the tool pages, the articles and the
  browser; `Justify` on the tool pages), then chunks: `data/articles.json`
  names each chunk's heading and the sentence it starts on (the tracer:
  12); every other page folds per heading block. One "Read on ›" travels
  down the page and disappears once opened; a chunk's first lines show
  faded above it. A caption longer than a paragraph is hidden. The
  headline is two tones on every hero.
- The article (`/6502/<tool>/article`) is just the article: the tool's
  hero head, the prose with its subheads, a Return button. Inline images
  are the owner's next step there.
- The strip: the full-screen key on the key row at phone width, keys at
  1.25u inline padding so eight keys, full screen and "pause" fit 390.
- Placeholder copy cut: the API reference's intro and coverage counters
  (`Coverage.tsx` deleted), the article's meta line, the "not a redirect"
  sentence, two unrendered dictionary sections.
- The golden reference: `web/e2e/golden/tracer-golden-{phone,desk}.jpg`
  at 1.0.141, 4,326 CSS px at 390 (18,247 this morning);
  `golden/README.md` lists the pairs and the trail.
- Specs for all of it: `e2e/tool-prose.spec.ts`, `e2e/article.spec.ts`,
  `e2e/strip.spec.ts` (two rows), `lib/prose.test.ts`.

Open: the intermittent React #418 on Shell pages (pre-existing); forward
steps 2 and 3 (`notes/forward.md`); `/etc/tinymachines/visitors.env`
with `TM_SELF_NETS` is the owner's to write.

## 2026-08-28: the Lab on paper, the footer on the floor

Owner's three, on `/6502/lab`:

- **The panels go paper.** The explorer's call of 2026-08-24 ("why are
  they all still black?") arriving at the Lab: its twenty-six panels were
  the one dark slab left under a paper site. `lab.css` no longer restates
  the 38 tokens inside `.panel` in the panel ladder; the shell's paper set
  reaches every panel, and the rule that remains undoes the kit's bezel
  (brushed chrome, 3px, glass ink) that had been reaching in under the
  Lab's own `.panel`. Dark survives nowhere on the page now: the scope
  reads its tokens too. Measured across the tabs at 1280: no text within
  70 luminance of its ground.
- **The footer is the floor**, on every workbench that has one in the
  flow (the Lab, the tool pages, the explorer): `SiteFooter floor` adds
  `.wb-foot`, locked to the floor the way the app shell's footer is, and
  the strip sits on it by the footer's measured height (`AppMetrics`
  publishes `--app-foot-h` for it too). Full screen takes the footer with
  the bar and the strip lands back on the floor. The console keeps its
  footer on the status page. Phone: strip 733 to 812, footer 812 to 844.
- **The header's link button is hidden**, like the theme toggle: the
  script binds it by id.

Specs: `e2e/footer.spec.ts` ("workbench floor": fixed, on the floor
before any scrolling, strip on the footer, page clears both, version
arrives; the Lab has no dark panel, ink on paper, no link button);
`e2e/fullscreen.spec.ts` (the footer leaves with the bar).

## Same day: Contents on the docs, and the article's footer checked

- **The docs index behind a button on a phone.** Below 60rem the tree
  (twenty links, 633px at 390, before the document's first word) waits
  behind "Contents ›" in the Read on's shape; pressed, it opens under the
  button, and a page picked from it arrives with the list closed. On a
  desk nothing changed: no button, the sidebar. `DocsNav.tsx` holds the
  state (a `<details>` cannot be open at one width and closed at
  another); the rules are in `components.css` beside `.docs-nav`.
  `e2e/docs.spec.ts`.
- **The article pages' footer** was asked for the Lab's treatment and
  already has it: the article is a Shell page, and the Shell's `.app-foot`
  is the locked band on the floor (measured at 390: fixed, 812 to 844,
  the same line as the Lab's). No change.

## Checkpoint, 2026-08-28, at 1.0.144

Live: 1.0.144 on 6502 v0.264 (`ddc1480`); tree clean and pushed. Since
the 1.0.142 checkpoint:

- The Lab on paper: every panel takes the shell's paper set, the kit's
  bezel undone under the Lab's `.panel`, the header's link button hidden.
- The workbench footer is the floor: `SiteFooter floor` (`.wb-foot`),
  locked under the strip by its measured height, gone in full screen.
  Lab, tool pages, explorer; the console keeps its status-page footer.
  The article pages are Shell pages and already had the locked band.
- The docs index behind "Contents ›" below 60rem (`DocsNav` state,
  closed again on navigation).
- Golden: the tracer pair recaptured at 1.0.143 (4,441 CSS px at 390).
- Specs: `footer.spec.ts` (workbench floor, the Lab on paper),
  `fullscreen.spec.ts` (the footer leaves), `docs.spec.ts`.

Open, unchanged: the intermittent React #418 on Shell pages; forward
steps 2 and 3 (`notes/forward.md`); `/etc/tinymachines/visitors.env`;
inline images on the articles (owner's).

## Same day: four tool pages, and the study view under the strip

Owner's round on /6502/block, /6502/diegraph, /6502/exploded and
/6502/schematic, measured live before anything was written.

- **The block's circuit fits its stage.** block.js draws the cone at full
  size and writes width and height on the svg: the ALU walked backward is
  1,193 by 6,020 CSS px in a stage 348 by 506 on a phone, one part in
  seventy on screen. The stage has a height now (`min(70vh, 48rem)`) and
  the svg fills it, so the whole drawing is on screen and centred.
- **The block's tail is Previous and Next.** The three "drawn other ways"
  links and "All twelve blocks" are hidden (block.js fills them by id).
- **The block's "Open in the workbench" is labelled the full screen it is:**
  it opens the schematic's study view with the block on the bench
  (`solo=1`). And that view was broken under the apex: upstream's
  `body.no-scroll #view` was scoped to `.explorer-shell body.no-scroll`
  and never matched, so on a desk the sections after the console painted
  over it; the bar, the footer and the strip sat on top of it. `body.` with
  a class is now scoped as a condition like `:root` and `html`
  (lib/explorer.ts); the strip's full screen key follows the page's own
  cover (`body.no-scroll`, or native fullscreen on the console) into
  `html.has-fullscreen`, and on the schematic pressing it presses the
  page's `#sch-fullscreen`; the console stops above the strip by the
  strip's measured height (`--strip-h`, which the strip now publishes itself; the console shell read the same number and measured it too, so its measurement is gone); the
  palette's run, step, back and clock select go the way every page's
  transport went, in the by-hand cover only, since native fullscreen shows
  the console subtree alone and the strip is outside it.
- **The graph's stage is dark**, the schematic stage's literal: it had been
  `color-mix(--space 70%, #000)`, a mid grey since --space became paper.
- **The exploded view's zoom group is gone**; the stage orbits and pinches.
- **The schematic and the strip:** measured, the strip did drive it (h 0 to
  1, and the study view's clock). What the owner saw was the study view's
  own keys under the strip and the strip over the view; both above.

`web/e2e/study.spec.ts` holds each of these. They run against live: the
chip pages boot from `/6502/chip/`, which the local tree does not serve.

Later the same day, at 1.0.146: **the MCP page tells a client how to
connect.** A "Connecting a client" section on `/docs/6502/mcp` (and its ja
shadow) with both endpoints, the chip's and the site's, the Claude Code
lines, the `mcpServers` block, the three protocol revisions both servers
speak (`2025-06-18`, `2025-03-26`, `2024-11-05`; a newer request is
answered in the newest of those) and the fact that neither opens an SSE
stream. Every code block in the docs now carries a Copy control
(`components/CopyPre.tsx`, through `mdx-components.tsx`): what is copied
is the block's rendered text, and the control appears only where the
clipboard exists. `docs.spec.ts` reads the clipboard back.

## Checkpoint, 2026-08-28, at 1.0.146

Live: 1.0.146 on 6502 v0.264. Tree clean, pushed.

Landed today, after the 1.0.144 checkpoint: the block's circuit fits its
stage and its tail is Previous and Next; the block's full screen is the
schematic's study view, which now works under the apex (`body.`-scoped
conditions in `lib/explorer.ts`, the strip's key follows the page's cover,
the strip publishes `--strip-h` and the console stops above it); the
graph's stage is dark; the exploded zoom group is gone; the MCP page has a
"Connecting a client" section in both languages and every docs code block
has a Copy control. Specs: `study.spec.ts` (7), `docs.spec.ts` (3), all
against live, with `fullscreen`, `footer` and `shell` still green.

MCP position, decided with the owner: Streamable HTTP with JSON replies,
no SSE stream, no sessions; revisions `2025-06-18`, `2025-03-26`,
`2024-11-05`, newest answered for a newer request. Revisit SSE only if a
tool wants progress (the chip's `run` would be the one).

Open, unchanged: the intermittent React #418 on Shell pages; forward
steps 2 and 3 (`notes/forward.md`); `/etc/tinymachines/visitors.env`;
inline images on the articles (owner's). One reading to confirm: the
graph's stage went dark on "black theme for lab, my bad"; a one-line
change if paper was meant.

## Same day: the graph is dark, and a stipple that was on every element

The reading confirmed: the graph is dark. The stage already was (1.0.145);
what was on it was not, because the drawing reads the page's tokens (an
edge is `--line`, a switch `--accent`, a lit node's ring `--foreground`)
and those became the paper theme's inks when the pages moved onto paper.
Measured on live: a gate edge was `#16150f` at 55% over `#080c15`, 1,282
edges of ink on ink. Inside `.dg-stage` the five tokens the drawing reads
are the drawing's own dark values again (`explorer.css`), as literals,
because they are that drawing's and not the site's.

Found while measuring, and older: the scoper's `body(?=[.\[:])`
lookahead, added at 1.0.145 for `body.no-scroll`, also took `body::before`,
so upstream's stipple rule became `body .explorer-shell ::before`, a fixed
dot grid painted by every element's `::before` in the shell. It showed as
a grid of white dots over the dark stage, and had been over the paper
too since 1.0.145. `lib/explorer.ts` now keeps a pseudo-element on body
dead like bare body; `lib/explorer.test.ts` holds the three shapes and
was watched fail without the fix. `study.spec.ts` asserts the gate edge
is light and that no element's `::before` paints a radial gradient.

Deployed 1.0.147. Then the click-path study test failed at one worker,
3 runs in 6, with the cover up after leaving native fullscreen: upstream's
toggle re-checks `fullscreenElement` 120ms after a native request took
and raises its cover if it finds none, and the test left inside that
window by calling `exitFullscreen()` the instant the class flipped. Not a
site bug (nobody leaves in 120ms); the test waits 300ms after the entry
settles, 6 of 6 after, 7 of 7 for the spec.

## Checkpoint, 2026-08-28, at 1.0.148

Live: 1.0.148 on 6502 v0.264. Tree clean, pushed.

Since the 1.0.146 checkpoint: the graph is dark (the drawing's tokens
inside `.dg-stage`), the scoper keeps `body::before` dead (the stipple
that had been on every element since 1.0.145), `lib/explorer.test.ts`
(3), `study.spec.ts` grew two assertions and lets a native entry settle
300ms before leaving. Specs against live: `study` 7/7, `docs` 3/3.

Open, unchanged: the intermittent React #418 on Shell pages; forward
steps 2 and 3 (`notes/forward.md`); `/etc/tinymachines/visitors.env`;
inline images on the articles (owner's); SSE only if a tool wants
progress.

## Same day: the engine gate follows the release's file list, and compares at the tag

The 6502 session reported halfphi 0.1.2 released (`halfphi@3514617`,
`6502@e556a40`, not deployed; served stays 0.1.1 at ddc1480) and that the
shared-file digest's definition moved with it: six files from 0.1.2
(`src/slice.rs` joined), five before. `board-engine.py` recomputed the
digest over a typed list of five and would have gone on disagreeing with
what the tag names once 0.1.2 was served. It now reads the list from the
served tree's own `tools/check-halfphi.mjs` (proved on the served tree,
five; on `halfphi-v0.1.2`'s file out of the 6502 repository's objects,
six; on a tree without the file, the five as fallback) and records the
list in `data/engine.json`.

Two more things the same run turned up. `--check` was already red: it
compared the served crate against the standalone `../halfphi` at HEAD,
which the release had moved to v0.1.2, so every deploy here would have
waited on the other project's next deploy (the checkout-bound gate's
ground, 2026-08-27). It compares at the tag the served version names now
(`git show v0.1.1:<file>`), and records which. And `--board` ran both
suites to "0 passed" in under two seconds: this shell's PATH has
`/usr/bin` before `~/.cargo/bin`, so cargo 1.97 drove the distribution's
rustc 1.75, which refuses `--check-cfg`. The runner puts rustup's
toolchain bin first on PATH now. Re-boarded: 39 tests, digest unchanged
(`1792a2467e8b`), standalone at `v0.1.1` identical.

The peer also offered three pieces for the site (the branchless inner
loop, 17% more throughput, bit-exact; the bit-sliced prototype and why
the simulation is path-dependent, 2.5x half-cycles, 2061 of 3000
half-cycles identical; the 40-claim prose check). Noted here, not
written up: the engine those numbers describe is not the served one, and
this site boards what is served.

## Checkpoint, 2026-08-28, at 1.0.149

Live: 1.0.149 on 6502 v0.264 (ddc1480), halfphi 0.1.1 served. Tree
clean, pushed.

Since the 1.0.148 checkpoint: the engine gate reads the shared-file list
from the served tree (six from halfphi 0.1.2, five before), compares the
standalone halfphi at the served version's tag rather than HEAD, and runs
the suites with rustup's toolchain first on PATH. Re-boarded, 39 tests.
halfphi 0.1.2 and the branchless engine are released, not deployed, over
there; `--board` picks them up when they are served.

Open, unchanged: the intermittent React #418 on Shell pages; forward
steps 2 and 3 (`notes/forward.md`); `/etc/tinymachines/visitors.env`;
inline images on the articles (owner's); SSE only if a tool wants
progress; the three engine write-ups once the engine they describe is
the served one.

## Same day: the console's gameplay round (owner's list)

Six asks, 2026-08-28. What each became, and what was measured on the way.

**Fast and slow.** game.js runs frames as fast as the round trip. A fourth
build-time patch (`web/lib/console-modules.ts`) has its loop read a frame
period off the page (`[data-frame-ms]` on the shell) and release a frame no
sooner than that after the last: a period composes with the round trip
where a rate would promise something the trip may not deliver. The shell's
slow mode is 250 ms (`SLOW_MS`, four frames a second), fast is 0. The
switch sits in the power dock beside reset and on the settings page, and
the choice survives a reload. The build check's DOM contract wanted the
attribute present, so fast is `0`, not absence. Measured: 7.9 frames/s
fast on the live round trip, no more than 4.0 slow.

**Fifty credits.** `CREDITS0 = 50` in Shell.tsx; the coin still adds one,
to 99. Given, never sold (NOTICE.md).

**Edge to edge.** The console page links a manifest of its own
(`/6502/games/manifest.webmanifest`, `display: fullscreen`, starting at the
console; `lib/manifest.ts` now writes both documents from one base), and
carries the Apple metas (`black-translucent`), so a phone that adds THIS
page to its home screen gets a console that fills the screen under the
notch. shell.css keeps the parts inside the safe area. The settings page
says how in the device's own case: installed already, a browser with the
API (the key presses the strip's own full screen control), or an iPhone
(Share, Add to Home Screen). A browser tab on an iPhone cannot go further
than that, and the page says so rather than pretending.

**The cart-switch instability, measured.** Two things, both on the live
console with a Playwright probe. (1) After any cartridge change the store
still said powered while the console said "power on to play": the strip's
power key lit over an empty machine. The driver now reports the console
dropping its own power (cart change, game over, engine quiet) as the
store's off, guarded against the boot's own pass through unpowered.
(2) Reset, then change the cartridge before the boot lands, and game.js's
`power()` resumed past its awaits into the new cartridge: "Silicon Snake ·
521B" (Die Runner's bytes), buttons painted live, loop already stale,
nothing running; the next start ran the wrong ROM under the wrong
contract. That is upstream's `power()` not re-checking `state.gen` the way
`loop()` does; filed in `notes/upstream-transport.md` and ISSUES #13. Here
the shell refuses a change while the console is booting, with the nudge.

**Reset is a push button.** The rocker and its hold are gone; reset boots
the cartridge or boots it again, from off too (power on, then reset if the
machine came back paused). Off is the strip's power key alone.

Held by `e2e/shell.spec.ts`: the switch and the fps bound, fifty on the
counter, the strip agreeing after a change, the refused change (reset and
select pressed in one task, with the record that the boot was in flight),
the manifest and the metas, reset from paused and from off. The three
strip tests cannot run against a local preview (`/6502/chip/` is nginx's
in production), so they run against the deploy.

## Checkpoint, 2026-08-28, at 1.0.150

Live is 1.0.150 (`baa0e41`) on 6502 v0.270 (`f4b8976`), halfphi 0.1.2
served and boarded (compared at tag v0.1.2, six shared files identical).
The console's gameplay round above is deployed and held by 17 shell e2e
tests against production. Filed upstream, not done here: `power()`
re-checking its generation, and the frame period carried by game.js
itself (`notes/upstream-transport.md`, last section); the 6502 session
has been told. Open, unchanged: React #418 on Shell pages, forward steps 2
and 3, `visitors.env`, article images (owner's), SSE only if a tool wants
progress, the three engine write-ups now that the engine they describe may
be the served one.

## Same day: step 2 of the forward, the subdomain pages redirect

The owner granted this agent control of nginx and services on the host,
so `notes/forward.md` step 2 went from proposal to action: the three
subdomain vhosts now answer 301 for page paths (the 6502 pages with or
without `.html`, `/archive/`, the `/api` reference page; the games
console, builders, manage, `/b/<handle>` and `/b/<handle>/<slug>` to the
console with the apex cartridge address; the halfwave Lab), and keep
serving `/api/`, the hashed assets, `sw.js`, `game.js` and the manifests.
Every table row curl-checked after the reload; the details are in
`notes/forward.md` under step 2. The 6502 repository's `deploy/*.nginx`
copies were byte-identical to the live files before the edit; the diff went
to that project's session to commit. `web/e2e/parity.spec.ts` skips unless
the upstream answers 200 (it now answers 301, and following it would
compare a page to itself). The engine was re-boarded on v0.270 `f4b8976`
(39 tests). The 6502 project has taken both console proposals upstream
(the `power()` generation guards live on games.tinymachines.ai at
`7ebac9a`, the frame period at `12d4616`); the fourth build-time patch
stays until a tagged release carries `12d4616`, because `pull-console`
reads game.js from the served worktree, not from the games host.

## Checkpoint, 2026-08-28, at 1.0.152

Live: 1.0.152 on 6502 v0.270 `f4b8976`, halfphi 0.1.2, boarded. The
forward's step 2 is live on the three subdomain vhosts (pages 301 to the
apex, `/api/` and the assets kept); `deploy.sh` stage 9 checks that shape;
`parity.spec` skips on the 301. The 6502 session holds the nginx diff for
its `deploy/` copies. Open, unchanged: forward step 3 (wait on the logs);
the fourth game.js patch until a tagged release carries `12d4616`;
intermittent React #418 on Shell pages; `TM_SELF_NETS` in `visitors.env`;
article images (owner's); the three engine write-ups.

## The console's engine key: the chip in the page, or the chip behind the API

The console was the last page on the 6502 floor whose engine key was grey.
It is live now, and it is the same key: one choice in one store, shown on
the strip and on the console's settings page, with `api` handing every
frame to halfwave over HTTP and `local` handing it to the wasm chip running
in the tab.

The seam is three lines. `console.js`'s `post()` is the only place the
console reaches the outside, so the build patches it to try a transport the
page may offer (`web/lib/console-modules.ts`, and the proposal is in
`notes/upstream-transport.md`); `games/localEngine.ts` puts the chip behind
it, loaded at runtime from the release nginx already serves at
`/6502/chip/`, so no die data comes near this repository. Switching mid-game
is a hand-off rather than a reboot, because the machine is a value the
console holds between frames.

Measured before it was written, and now held by
`web/e2e/console-engine.spec.ts`: boot and one 8,704 half-cycle frame of
Die Runner leave the two engines with identical chip state, identical
memory and the same eight gates. Speed, off the console's own readouts on
this desk: Silicon Snake 34.3 fps in the page against 36.5 over the API,
Die Runner 2.4 against 2.6; under a fourfold CPU throttle, which is roughly
a phone, the in-page chip falls to 1.5 s a frame for Die Runner. So the
console writes `api` into the store as its default when the floor has never
chosen, which is the one decision here that is a judgement rather than a
measurement, and the key overrules it either way.

The chip runs on a worker thread, and that was found rather than planned.
On the page's own thread it worked and looked broken: a frame is a
synchronous 350 ms run and the loop starts the next on a microtask, so in
thirteen seconds a `setInterval(250)` fired once, nothing repainted, the LED
and readouts held their pre-boot values and the d-pad took no presses. The
worker (`web/public/engine/console-chip.worker.mjs`) costs one structured
clone of the machine per call, about 5 KB, which is what the round trip was
posting anyway. `notes/one-engine.md` has the table and the reasoning; that
note's last open piece is now the Lab's chip.

The frame period patch is gone: the served release carries it upstream, so
the engine was re-boarded (v0.274 `33752d7`, 39 tests) and the patch list
is four places over three files again, the newest being this transport.

## Local is the default, and what that cost to find

Owner's call, 2026-08-28: make the chip in the page the default and see how
it feels. The console no longer writes `api` into the store for a floor that
has never chosen, so the floor has one default (the chip in the page) and the
key moves it either way.

A fresh visit on this desk: the chip answers 227 ms after load, the cartridge
boots in 85 ms, Die Runner runs at 2.7 frames a second and Silicon Snake at
38.6, both with zero requests, and the page's own thread is never unavailable
for longer than the 100 ms sampling period. Over the API the same two are 2.6
and 36.5. On a desk the engines now feel the same and one of them talks to
nobody. The phone figures in the round before this one were measured on the
main-thread build and no longer apply: Chrome's CPU throttle does not reach a
worker, so a throttled run measures the browser, not the chip.

Making it the default also shipped a bug for one deploy, and it is the round's
real lesson. The install now runs at mount instead of on a press, the store
announces more than once at mount, and two installs raced: both greeted the
worker before either set its flag, both ran the wasm glue's `init()`, and the
console ended up holding a pointer into the first wasm instance while every
call went into the second. Fourteen frames of Die Runner, correct, then a
trap, then "the engine stopped answering". The fix is to keep the promise
rather than the result on both sides, which the first page-side build did and
the move into a worker dropped. `notes/console-shell/ISSUES.md` #15 has the
hunt; the e2e case now runs the default engine through a game over and a
second boot, because fourteen frames is under four seconds.

## Silicon Snake, drawn as a broken Space Invaders

The owner's report, the same day: arrive on a cartridge link, play it, choose
Silicon Snake, power on, and the snake and its food are invaders and a ship.

Not the engine, and not the new default: upstream `game.js` keeps one tile
sheet for the module, `useCart()` replaces it with a loaded cartridge's CHR
and nothing puts it back. Every cartridge chosen after a linked one borrowed
its sprites, and the legend went on showing them, which breaks the page's own
promise that a swatch cannot show something the screen does not. It has been
true for as long as `?cart=` has existed, and `?cart=` is the first thing most
people see of this console.

Two build-time patches, one fix: `useCart` keeps the sheet it displaces, the
picker puts back the one the chosen cartridge should draw in and redraws the
key with it. `notes/console-shell/ISSUES.md` #16, filed upstream in
`notes/upstream-transport.md`, and `web/e2e/console-cart.spec.ts` walks the
owner's path against a published cartridge from the registry and compares the
legend rather than the canvas.

## The tile sheet, closed on both sides

The 6502 project took it upstream the same day (`f0001d3`, not served yet):
one `selectTiles()` over `state.cart.tileset || HOUSE`, the decoded set on
the cartridge. `tileset` rather than `tiles`, because `cart.tiles` is already
the tile-index remap. The patches here stay until a served release carries it
and the boarding gate refuses their anchors, which is the mechanism working
as designed.

Their fix covered one case the roof's first two patches did not, so there is
a third now: `art/tiles.chr` and a linked cartridge are two fetches started
together, and their responses land two milliseconds apart on the live
console, so the house sheet arriving second used to take the screen from the
cartridge. It is load-bearing, checked the way this repo requires: with that
patch taken back out of the served module and the house sheet held back a
second and a half, the linked cartridge's legend became the house sheet's.

## The Lab: dark again, a flag that goes where it says, and why the engine key is grey

Three from the owner on `/6502/lab`.

**The workspace is dark.** The Lab wore paper from 2026-08-25 (the page) and
2026-08-27 (the panels); it is an instrument all the way down, twenty-six
panels of values read off storage on a running die, so the shell takes the
instrument ground and the panels are raised on it. The set is the one the
panels themselves wore, moved out to the shell so it reaches the furniture
between them. The paper set is kept as the Lab's light theme, under its own
toggle, so the switch is now a choice between two house grounds rather than a
door into a palette this site does not have.

**The language switch was pointing at a page that does not exist,** and not
only here. English is served unprefixed and rewritten onto `app/[lang]`, so a
path has two spellings, and a client component reading `usePathname()` in a
prerendered page is handed the internal one: `/en/6502/lab`. `delocalize` did
not read `/en` as a language prefix, so every statically rendered English page
shipped a flag pointing at `/ja/en/...`. One line, and `lib/lang.test.ts` now
holds both spellings and the pair of them; `e2e/header.spec.ts` asserts on
every page it walks that the flag is that page in the other language.

**The engine key stays grey on the Lab, and that is honest.** The Lab does not
step a machine, it records one: a single `/v1/step` with `trace: true,
format: "rows"` brings back 34 columns per half-cycle, and every panel reads
that recording while the player scrubs inside it. The wasm build has no trace,
so a local Lab needs `v6502-wasm` to emit the same rows; doing it in
JavaScript would be a second implementation of what `service/app.py` already
owns. Measured, written up in `notes/one-engine.md` and filed in
`notes/upstream-transport.md`.

## The flag into the Lab, and a grey key that says why

Two more from the owner on `/6502/lab`, both fixed at 1.0.164.

**"Nested windows when changing to JPN".** The Lab is one ES module that
builds this page's DOM once and has no teardown, which is why the explorer's
pages navigate hard; the Lab's bar did not, so the flag was a client-side
navigation. What arrived was the Japanese markup with nothing built in it and
the Lab's own player still visible, because that player is hidden only once
the Lab has marked it driven: two rows of controls and no instrument.
Re-inserting the script does not help, and the comment in the page claiming
`afterInteractive` covered this case is corrected: a module already in the
browser's registry does not run again. `WorkbenchBar hard`, as on every other
instrument page, and `web/e2e/lab.spec.ts` now walks the flag and holds that
what arrives is built, driven and showing one set of keys.

**The engine key stays grey, and now it says why.** A disabled control with
the general sentence on it reads as broken. A page may state its own reason
(`data-engine-why` on the workbench root, read by the strip like the chip API
base is), and the Lab's is in both its languages: the Lab records a run, 34
measurements per half-cycle, and only the engine behind the API produces
those. The line goes when `v6502-wasm` can emit the rows
(`notes/upstream-transport.md`); until then the key explains itself instead of
looking like a fault.

## The console had the same bug, and now one rule covers both

The owner asked whether the console shared the Lab's nested-window bug. It
did, by the same route: the flag on the console's settings page was the one
soft link off that page, and `game.js` is a module like the Lab's, so what
arrived was a Japanese console with a blank screen, no tile key, the
cartridge blurb missing and none of its handlers bound. Measured, then fixed:
the flag is hard and the three site links beside it are plain anchors, which
is also the rule in the other direction, since a client-side departure would
leave game.js's frame loop posting frames at a canvas that is gone.

The fix that matters is the third one. `isHardRoute()` in `lib/nav.ts` is the
site's one answer to "must this link start from a fresh document", and it
knew only about the explorer's pages; the menu kept a second copy of the same
set. Both now come from that one function and it covers the Lab and the
console, so every computed link into a module page is a real navigation
without each page having to remember. `lib/lang.test.ts` holds the rule in
both languages, and `web/e2e/lab.spec.ts` and `shell.spec.ts` each walk the
flag and assert what arrives is built rather than merely rendered.
