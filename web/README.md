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

## Five configuration facts, each one found by the build failing

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

- **`@next/mdx` defaults to `extension: /\.mdx$/`, which is `.mdx` only.**
  Listing `md` in `pageExtensions` does not change that; the two settings are
  unrelated. With the default, every `.md` file reaches Turbopack with no
  loader attached and the build fails with `Unknown module type`, naming the
  file rather than the mismatch. The tree is almost entirely `.md`, so the
  extension is widened to `/\.mdx?$/`.
- **The remark plugin is passed as an absolute path.** Both obvious forms
  fail, in different places. An imported function fails as above. A bare
  `"remark-gfm"` fails at load time, because `@next/mdx` resolves a named
  plugin with `require.resolve(name, { paths: [this.context] })` and
  `this.context` is the directory of the file being loaded, which is `../docs`
  and has no `node_modules`. An absolute path is still a string, so it stays
  serializable, and it resolves from anywhere.

The config is `next.config.ts`, not `.mjs`: that is what Next 16 generates now.

## `/docs`

`lib/docs.ts` walks `../docs` and is the only thing that knows the shape of the
tree. `app/docs/[[...slug]]/page.tsx` routes it, `app/docs/layout.tsx` renders
the navigation from the same walk, and all pages are prerendered as static HTML
via `generateStaticParams`.

**There is no nav list, no ordering array and no slug-to-file map**, because
each of those is a second copy of something the directory already says.

Four things fail the build rather than rendering something plausible, and each
was checked by breaking it on a scratch copy and watching the build go red:

| broken | what the build says |
|---|---|
| a page with no `title` | names the file, and says a page with no title is a build failure rather than a page called "Untitled" |
| frontmatter carrying `url:` or a parent | names the key, and says the URL is the path and the parent is the directory |
| a directory with no `index.md` | names the directory, and says it would be a URL that 404s while its children resolve |
| `order:` that is not a number | names the file and the type it got |

`docs/README.md` documents the conventions for whoever edits the tree and is
excluded by name, so it is not a page. `/docs/README` is a 404.

Sibling order is `order` ascending, and a page with no `order` sorts **last**,
alphabetically by title. Last rather than first: a page that forgot to declare
a position should not silently claim the top of the list.

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
