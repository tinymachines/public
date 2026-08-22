# The site: Next 16 + MDX + Tailwind 4

Serves `/` and `/docs`. Content for the docs tree lives in `../docs/`, not
here: **content and code stay in separate directories**, because the content is
the thing somebody who is not a developer should be able to edit.

No app yet: `app/globals.css` exists ahead of it, because it is the seam the
style system plugs into and it is one file. Everything else comes from the
bootstrap below. See [`../START-HERE.md`](../START-HERE.md) steps 2 and 4.

## Bootstrap

```bash
cd web
bun create next-app@latest . --ts --app --tailwind --eslint --no-src-dir --import-alias '@/*'
bun add @next/mdx @mdx-js/loader @mdx-js/react @types/mdx remark-gfm gray-matter
```

Then `next.config.mjs` needs `pageExtensions: ['ts','tsx','md','mdx']` and the
`createMDX` wrapper, and `mdx-components.tsx` must exist at the root or MDX
pages fail to render with a message that does not say so. bradley.io's
`next.config.mjs` is a working example of both.

Run it on **6511**. Not 6502, which the live API holds: a server started on a
port already bound fails silently and every request then goes to production.
That mistake has been made here once already.

## Styles: Tailwind 4, configured in CSS

The seam is filled. `../style/` is the design system and `app/globals.css`
imports it rather than copying it:

```css
/* app/globals.css */
@import "tailwindcss";
@import "../../style/tokens.css";
@import "../../style/components.css";
```

**Do not paste tokens into this directory.** The palette, the type scale and
the component kit have one home, and it is `../style/`. A second copy under
`web/` drifts and looks correct while it does. See `../style/README.md`.

**Tailwind 4 has no `tailwind.config.js` for theme values.** Tokens are CSS
custom properties inside `@theme`, which means the style guide is a stylesheet
rather than a JavaScript object, and dropping a new one in reaches every
component at once. bradley.io is already on this exact arrangement, so its
`globals.css` is the reference for how the block is laid out.

The palette, the fonts and the type scale are decided: they are in
`../style/tokens.css` and `../style/STYLE.md` says what each one means. So use
the semantic utilities they generate, `bg-paper` and `text-ocean-ink` and
`text-data`, and **do not hardcode a colour in a component**: a literal
`text-[#0B1120]` is a token that cannot be restyled, and the style guide will
not reach it.

Read `../style/STYLE.md` §1 before laying out a page. Paper and panel are a
semantic distinction rather than a light/dark theme, and getting that backwards
is the one mistake the guide cannot correct after the fact.
