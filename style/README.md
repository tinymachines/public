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

```
python3 -m http.server 8000    # then open zoo.html
```

Or just open `zoo.html`: it works from `file://`.

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
  template, and to the three live subdomains without a build.
- No print stylesheet. Noted as open in `STYLE.md` §9.
