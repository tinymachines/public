# The site: Next 16 + MDX + Tailwind 4

Serves `/` and `/docs`. Content for the docs tree lives in `../docs/`, not
here: **content and code stay in separate directories**, because the content is
the thing somebody who is not a developer should be able to edit.

Scaffolded. Next 16.3.2, React 19.2.8, Tailwind 4.3.3, built with `bun`. The
front page is still a placeholder: that is
[`../START-HERE.md`](../START-HERE.md) step 4.

```bash
bun install
bun run dev      # 127.0.0.1:6511
bun run build
```

**6511, bound to loopback.** Not 6502, which the live API holds: a server
started on a port already bound fails silently and every request then goes to
production, and that mistake has been made here once already. Loopback rather
than every interface because nginx proxies to `127.0.0.1` and this box serves
many other vhosts.

Note that `next dev` does not fail when 6511 is taken, it picks the next free
port and says so in one line. nginx will still be pointed at 6511, so read
that line rather than assuming.

## Three configuration facts, each one found by the build failing

- **`mdx-components.tsx` must exist at the repository root of the app.**
  Without it MDX pages fail to render and the message does not say that this
  is why.
- **Turbopack's root is `../`, the repository, not `web/`.** `app/globals.css`
  imports `../style/tokens.css`, and with the root at `web/` the build fails
  with `FileSystemPath("").join("../style/tokens.css") leaves the filesystem
  root`. Left unset entirely, Turbopack infers a root from an unrelated
  lockfile in the home directory. Both are in `next.config.ts` with the
  reasoning attached.
- **Remark plugins are named as strings, not imported and passed.**
  `remarkPlugins: [["remark-gfm", {}]]`. Turbopack serializes loader options,
  and a plugin function fails the build with `does not have serializable
  options`, naming the loader rather than the plugin.

The config is `next.config.ts`, not `.mjs`: that is what Next 16 generates now.

## Styles: Tailwind 4, configured in CSS

The seam is filled and wired. `../style/` is the design system and
`app/globals.css` imports it rather than copying it:

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

## Fonts

`app/layout.tsx` binds the four faces from `../style/STYLE.md` §3 to the
variable names the tokens use: `--font-display`, `--font-sans`, `--font-mono`,
`--font-serif`. All four are OFL and self-hosted by `next/font/google`, so the
built page makes no request to a font host. That was checked on the rendered
HTML, not assumed.

**Two definitions of each font variable end up in the stylesheet**, and that is
fine on purpose. `next/font` emits one on a class it puts on `<html>`, and
`@theme` in `../style/tokens.css` emits another inside `@layer theme`.
Unlayered declarations beat layered ones regardless of order or specificity, so
the self-hosted family always wins and the token value stands as the fallback
if the class is ever missing.
