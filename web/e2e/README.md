# e2e: unreasonable perfection, automated

Every rule the site is held to, run against a live origin. `bun run e2e`
runs the whole suite against production; `BASE=http://127.0.0.1:6512 bun run
e2e` runs it against a preview (the chip pages only boot on production, so
`strip`, `kit`, `fullscreen` and `parity` need the real thing).

| spec | the rule |
|---|---|
| `pages` | every sitemap page answers, has one h1, the right `lang`, one flag pointing the other way, no em dash in visible text |
| `mobile` | nothing scrolls sideways at 390 (all pages) or 360 (English) |
| `manage` | the editor holds on a phone with the account card and every hidden section open |
| `header` | one bar; die tile, page name, one flag; the menu at one x on every page |
| `strip` | the Lab's set in order, disabled where a page cannot honour it, full screen last and at the edge, two rows on a phone |
| `fullscreen` | full screen is the document: the bar leaves and comes back |
| `kit` | no 2px borders or wide radii on the ported pages; no page transport beside the strip |
| `parity` | ported pages carry upstream's in-content links, the same query state, the same block cards |
| `footer` | the footer states the API's version and is never clipped |
| `api` | openapi.json is generated, the brief carries no token, strangers get 401 |

The page list is fetched from `/sitemap.xml` in `global-setup.ts`; nothing
is listed by hand. Each spec asserts a count before it asserts a property, so
an empty page list fails rather than passes. Output lands in `e2e/out/`,
which is gitignored. `bun run e2e -- --grep strip` runs one spec;
`E2E_WORKERS=8` runs faster on a machine that can take it.
