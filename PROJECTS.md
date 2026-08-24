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

**4. The 6502 API as a service under the apex.** The reference moved; the
process did not, and `--root-path /api` is why. See below.

**5. hotbits' identity.** `style/projects/hotbits.css` still overrides nothing.
Both pages change the day it is filled in and neither is edited.

### Waiting on another service

**6. The cartridge editor**, on `tinymachines/6502#12`.
**7. The retired hotbits endpoints being readable from a browser**, on
`tinymachines/geiger#4`.

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
