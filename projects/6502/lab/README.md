# The Halfwave Lab

A 6502, half a clock phase at a time. One self-contained document, served at
[/6502/lab](https://tinymachines.ai/6502/lab) and still at
`halfwave.tinymachines.ai`, which is untouched.

`web/lib/lab.ts` reads this file at build time and `web/app/6502/lab/page.tsx`
frames it. It is not reimplemented as components: it is 21 KB of markup driven
by 150 KB of its own script, and hand transcribing that into JSX is exactly the
failure this site has already shipped once, when renaming one container broke
the Die Runner console while the page went on rendering perfectly. Reading the
file makes the DOM correct by construction.

## This copy is now the source

It came from `tinymachines/6502` (`docs/halfwave-lab/halfwave-lab.html`) and it
is not synced. That is the move: the lab lives here now, and the subdomain goes
on serving the older copy until it is redirected.

**21 em dashes were replaced**, which is the only edit to the file itself.
CLAUDE.md forbids them in anything shipped and this ships, so the alternative
was exempting one page from a house rule. Each was replaced by hand rather than
by a blanket substitution, because which replacement is right depends on what
follows: an appositive takes a colon, a clause beginning "and" takes a comma,
and the one inside a code comment takes `--`, which is what the rule specifies
for code. Every case asserted to appear exactly once before being replaced.

## Three things changed outside the file

**The head is gone.** It fetched Archivo, IBM Plex Sans and IBM Plex Mono from
Google, and this site self-hosts those exact three families: the lab and the
style guide had converged on the same type without either knowing. Dropping it
is also not optional, because the apex CSP is `font-src 'self'` and those
requests would be blocked, leaving the page in a fallback face with nothing on
screen to say so.

**The palette is the house palette.** The lab arrived fully tokenised, 38
custom properties and 369 `var()` uses, which is why homogenising it is a remap
rather than a rewrite: `web/app/6502/lab/lab.css` supplies those 38 names from
`style/tokens.css` and 35 KB of the lab's rules are untouched. Every colour in
them now comes from the style guide.

The one exception is the light theme, and it is a decision rather than a gap.
`lab.css` explains it: the kit has no light *instrument* ground, and inventing
one is the owner's.

**The chip API is named rather than assumed.** It was
`location.origin + "/api"`, which on `halfwave.tinymachines.ai` is nginx
proxying `127.0.0.1:6502` and here would be the roof's API, which does not run
6502 code. Substituted at build time by `lib/lab.ts`, with a `replaceOnce` that
throws unless it matches exactly once: a rewrite of somebody else's file is
only safe if it cannot half-happen.

## R&D stays R&D

Nothing was removed, reordered or simplified. The eight sections, the datapath,
the latch tables, the decode PLA and the half-cycle diff are the lab's. What
was added is a masthead and a footer.
