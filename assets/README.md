# Vendored marks

Committed, not generated. Nothing here is rebuilt by any script; these are
assets copied in so that a build and a page load both work with no route to
the internet, the same reason `../style/fonts/` exists.

| file | size | from |
|---|---|---|
| `halfphi-512.png` | 512 x 512 | `tinymachines/halfphi`, `assets/halfphi-512.png` |

## halfphi

MIT, Copyright (c) 2026 Tiny Machines. Ours, so nothing travels with it that
does not travel with the rest of this repository. The mark is described by its
own repo as a wave breaking off a DIP package: half of phi, coming out of the
silicon.

The 512 is taken rather than the 1408 original, on that repo's own reasoning:
it is displayed small, and shipping two megabytes for a logo buys nothing.

### One thing its asset README says that is no longer true

That file warns the dark background is **baked in rather than transparent**,
and that using it on a light surface needs a cut-out made by masking the
subject, because the background is a gradient rather than a flat colour.

**All three assets already carry an alpha channel.** Measured before copying
this one: 67.6% of the 512's pixels are fully transparent, and every corner and
edge sample is `a=0`. The 1408 original is transparent too, though it retains
dark RGB underneath those transparent pixels, which is what a render against a
dark ground leaves behind and is exactly what makes it look baked in when
inspected without alpha.

The fringe was the thing worth checking, because a cut-out made against a dark
render leaves a dark halo on a light ground. It does not here: the 12093
partially transparent pixels average `(112, 78, 28)`, a warm gold, which is the
subject's own edge rather than the background. Composited onto both grounds and
looked at, it is clean on paper and on panel.

So no masking was needed and none was done. **The upstream asset README should
be corrected**, and that is a change in `tinymachines/halfphi`, not here.
