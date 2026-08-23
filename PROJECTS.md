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
style/
  tokens.css  components.css  zoo.html         the kit, shared, never forked
  projects/6502.css  projects/hotbits.css      the silos
data/projects.json                             the manifest
```

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
