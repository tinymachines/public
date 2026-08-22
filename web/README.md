# The site: Next 16 + MDX + Tailwind 4

Serves `/` and `/docs`. Content for the docs tree lives in `../docs/`, not
here: **content and code stay in separate directories**, because the content is
the thing somebody who is not a developer should be able to edit.

Nothing here yet. See [`../START-HERE.md`](../START-HERE.md) steps 2 and 4.

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

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* THE OWNER'S. Design tokens land here: palette, fonts, type scale,
     spacing. Left minimal on purpose. Do not fill this in. */
}
```

**Tailwind 4 has no `tailwind.config.js` for theme values.** Tokens are CSS
custom properties inside `@theme`, which means the style guide is a stylesheet
rather than a JavaScript object, and dropping a new one in reaches every
component at once. bradley.io is already on this exact arrangement, so its
`globals.css` is the reference for how the block is laid out.

Use semantic utilities above that block. **Do not choose a palette, fonts or a
type scale**, and do not hardcode a colour in a component: a literal
`text-[#0B1120]` is a token that cannot be restyled, and the owner's stylesheet
will not reach it.
