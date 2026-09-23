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
| `menu` | the panel is the site and the projects, the same on every page; each project's landing links every arrived surface; every sitemap page is reached from the menu by walking the pages it lists |
| `parts` | the section's parts as a strip under the bar on every page inside a project, its first level from the manifest, the current part marked; none on the site's own pages |
| `menu-open` | opened after a scroll, the bar, the button and the panel are on screen and nothing moves (real scrollbars, so its own file) |
| `strip` | the Lab's set in order, disabled where a page cannot honour it, full screen last and at the edge, two rows on a phone |
| `fullscreen` | full screen is the document: the bar leaves and comes back |
| `kit` | no 2px borders or wide radii on the ported pages; no page transport beside the strip |
| `parity` | ported pages carry upstream's in-content links, the same query state, the same block cards |
| `footer` | the footer states the API's version and is never clipped |
| `api` | openapi.json is generated, the brief carries no token, strangers get 401 |
| `shell` | the console shell on /6502/games: octagon mask, integer scale, 88px touch floor, coin and LED, pages, rotation without reload, no Nintendo mark |
| `untranslated` | every page's notice agrees with the body it serves: English under /ja says so, Japanese does not, and a document's `inLanguage` is its body's language |

The page list is fetched from `/sitemap.xml` in `global-setup.ts`; nothing
is listed by hand. Each spec asserts a count before it asserts a property, so
an empty page list fails rather than passes. Output lands in `e2e/out/`,
which is gitignored. `bun run e2e -- --grep strip` runs one spec;
`E2E_WORKERS=8` runs faster on a machine that can take it.
