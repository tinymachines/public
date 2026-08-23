# tinymachines.ai: design system

The style guide `START-HERE.md` §4 leaves a seam for. Palette sampled from the
binder scans, not transcribed from their captions. See `STYLE.md` §0 for why
that distinction matters.

## Files

| File | What it is |
|---|---|
| `STYLE.md` | The guide. Read once. Every rule has its reason attached. |
| `tokens.css` | The `@theme {}` block. **This is the deliverable for the Next app.** |
| `components.css` | The kit. Plain CSS on the tokens, no framework. |
| `zoo.html` | The widget zoo: 34 specimens, normative. |
| `tokens.static.css` | **Generated.** A `:root` copy so the zoo runs with no build step. |
| `build-tokens.py` | Derives `tokens.static.css` from `tokens.css`. |

## Look at it

Two ways, and they render the same specimens from the same file.

**On the site**, which is the one that matters, because it renders against
what the app actually ships rather than against the standalone copy:

| | |
|---|---|
| `/style` | `STYLE.md`, imported through the app's MDX pipeline |
| `/style/zoo` | `zoo.html`, read at build time by `web/lib/zoo.ts` |

Neither page reimplements anything. The zoo route lifts the chrome, the body
and the script straight out of `zoo.html` and drops the head, because the site
self-hosts the same four families through `next/font` and defines the same
tokens through `@theme`. That makes the zoo a live check on the app: if a
token drifts between `tokens.css` and what the build emits, the zoo is where
it shows.

`web/lib/zoo.ts` refuses rather than rendering a page that looks finished and
is not. It throws if the chrome, the body or the script comes back short, if
it finds fewer than 20 specimens, or if it finds an em dash.

**Standalone**, with no build step at all:

```
python3 -m http.server 8000    # then open zoo.html
```

Or just open `zoo.html`: it works from `file://`. This is the path
`tokens.static.css` exists for.

## Wire it into `web/`

Already wired. `web/app/globals.css` is three lines and reads this directory:

```css
@import "tailwindcss";
@import "../../style/tokens.css";
@import "../../style/components.css";
```

**Nothing is copied into `web/`.** One copy of a fact: edit a token here and
the app has it, with no step in between that somebody can forget. Tailwind
resolves both imports at build time, so the browser still gets one stylesheet.

Two things that follow, and both were measured against tailwindcss 4.3.3:

- **Tailwind comes first**, because `@theme` extends it and because CSS
  requires every `@import` to precede other rules.
- **The block is `@theme static`, not `@theme`.** Without `static`, Tailwind
  emits only the theme variables something in the build happens to reference
  and drops the rest. Measured here: six of the 70 tokens (`--color-brushed`,
  the four `--color-chrome-*` and `--text-hero`) were absent from the built
  stylesheet, because no rule used them yet. A `var()` naming a token that is
  not there does not error, it drops the whole declaration. A palette that
  silently contains only the colours already in use is not a palette.
- **`tokens.css` carries no `@import "tailwindcss"` of its own.** A bare
  specifier resolves from the directory of the file that writes it, and
  `style/` has no `node_modules`, so the build fails with
  `Can't resolve 'tailwindcss'`. Where it does resolve, it emits preflight
  twice.

Then in `web/app/layout.tsx`:

```ts
import "./globals.css";
```

Fonts: all four are OFL, all four are on Google Fonts, so `next/font/google`
handles them and there is no external request at runtime:

```ts
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
```

Bind each to the matching CSS variable (`--font-display`, `--font-sans`,
`--font-mono`, `--font-serif`) and nothing in `components.css` changes.

## After editing tokens

`tokens.static.css` is generated and must never be hand-edited:

```bash
python3 build-tokens.py
```

The second copy exists only because the zoo has no build step. It is derived
for the same reason the docs nav is derived from the directory tree: two
hand-maintained copies of the same list drift, and a drifted palette looks
exactly like a palette.

## What is not here

- No JavaScript ships. The behaviour in `zoo.html` demonstrates interactions;
  the real components get their state from the engine.
- No React components yet. The kit is CSS so it ports to MDX, to a FastAPI
  template, and to the three live subdomains without a build. The zoo route is
  not an exception: it renders `zoo.html`, it does not reimplement it.
- No print stylesheet. Noted as open in `STYLE.md` §9.
