# The kit plan: what moves onto `@tinymachines/kit`, and what stays

Written 2026-10-20 at `4e40fbf`, when the owner opened the question: "This is
a massive website; we definitely need to refactor UI -> ../../tinykit/". Every
count here was read from the tree that day, with the command that produced it,
so it can be re-derived. Nothing host-specific is in this file.

**Status, 2026-10-20:** the owner accepted the recommendation in section 5 as
written ("yes to all of your recommends; keep the gate in place"). The engine
boarding gate, `scripts/board-engine.py --board` and deploy stage 2e
(`notes/modules.md`), stays as it is throughout: the roof keeps boarding the
6502 release, and nothing in this plan loosens it. The four decisions in
section 6 were still open at that point. Later the same day the owner took the
first two: **the carved-out apps are private, and they wear the kit's kiosk
look** ("private, kit's kiosk look - go"). Decisions 3 and 4 stay open. The
first step, the sprite maker as a kit app, started on that word.

**The first step is done, 2026-10-20:** sprites.tinymachines.ai is live, a private kit app (`tinymachines/sprites`,
checkout `../sprites`) with the maker page, a colours page, and its own API in front of the generator; the kit's
check ends `ALL OK` against the live host. The 64 colours there are a record measured through the ntsc-crt bundle
this repository boarded (`scripts/board-palette.ts` there reads `web/public/nes/palette.mjs` and `data/ntsc.json`
here), so a re-board of the bundle here is a re-measure there. Nothing in this repository changed for it; the desk's
Sprite maker and the `/sprites` location still work as before. Later the same day, on the owner's word, `/sprites`
and `/sprites/` here became a 301 to the app (`deploy/tinymachines.ai.nginx`, installed by hand); what stays under
`/sprites/` is the machinery the desk's Sprite maker and programs with a dev key still use, until the desk moves.

One word is overloaded, so it is pinned first. In this repository "the kit"
has meant `style/components.css`, the site's own CSS kit, since 2026-08-24
(`style/README.md`, `lib/kit-borders.ts`). In this document **the kit** is
`@tinymachines/kit`, the app kit at `../../kit`, whose showcase is
`../../tinykit`. Where the CSS kit is meant, it is called the CSS kit.

## 1. What this site is, measured

Counted in `web/` with `find`, `wc -l` and `grep -l '"use client"'`.

- Next 16 app router. 50 `page.tsx` under `app/[lang]`, which the build
  renders in two languages: `check-build` reports **424 pages**.
- 174 `.tsx` files. `app/` is 42,429 lines across 239 source files; `lib/`
  is 12,686 lines across 76. 31 shared components in `app/components`
  (4,091 lines).
- By section, lines of `.ts`, `.tsx` and `.css` / pages / files marked
  `"use client"`:
  - `nes`: 20,470 / 12 / 35
  - `6502`: 7,534 / 16 / 10
  - `autopsy`: 4,732 / 7 / 0
  - `hotbits`: 2,076 / 4 / 7
  - `computer-tree`: 813 / 1 / 1
  - `style`: 589 / 3 / 0
  - `docs`: 407 / 2 / 0
- 173 markdown documents under `docs/`, most pulled from sibling checkouts at
  build time (`web/scripts/pull-nesdocs.mjs`, `pull-chipdocs.mjs`), each with a
  Japanese twin held to it by a digest stamp (`data/ja-docs.json`,
  `check-ja-docs.mjs`).
- The CSS kit: `style/tokens.css` (244 lines, the `@theme` block),
  `style/components.css` (3,195 lines), `fonts.css` (313), the zoo with 34
  specimens, `STYLE.md`. Four self-hosted type families.
- 50 e2e specs holding 305 browser tests (`web/e2e`), plus the unit tests in
  `lib/*.test.ts`, plus the deploy's own checks: figures, i18n, cascade,
  tokens, OG font, tm links.
- The heavy pieces, by file: `nes/create/Program.tsx` 1,229 lines,
  `nes/playground/words.tsx` 995, `nes/prose.tsx` 924,
  `components/AdminConsole.tsx` 797, `nes/playground/Playground.tsx` 684,
  `6502/games/shell/Shell.tsx` 637, `nes/playground/Twins.tsx` 629,
  `nes/signal/page.tsx` 620, `nes/play/Sprites.tsx` 574. Dependencies beyond
  Next and MDX: `three` and `@react-three/fiber` (the pad in 3D), `mermaid`
  (the diagrams).

## 2. What the kit is, read from `../../kit` and `../../tinykit`

- Vite + React 19 + zustand. Source only: `exports` point at `.ts` and
  `.tsx`, the app's Vite and `tsc` compile them. Private; apps pin a tag over
  ssh (`v0.3.27` on 2026-10-20).
- Eleven apps on it, listed by `../../tinykit/apps/*.yaml`: tinychase,
  astrostack, hotbits, bradley.io's beta, snailmail, amy-io, gopher, events,
  tinybrain, tinypeek's site, tinykit itself. Two of those are this project's
  neighbours already: hotbits (whose bench this site documents at
  `/hotbits/bench`) and tinypeek (whose protocol this site serves at `/api`).
- What an app gets: the kiosk look (`styles/kiosk.css`, large type and high
  contrast, byte-identical to tinychase's), the frame (`SiteHeader`,
  `SiteFooter`, the Menu), themes checked for contrast, install and offline
  (its own service worker), sharing and QR, passkey sign-in on the shared
  account service with preferences and Your files, sensors and widgets, the
  zoo, Plan diagrams, and the `kit` command (`check`, `deploy`, `nginx`,
  `dns`, `setup`) with `kitapi` for an app's own FastAPI.
- Its rules that bear on this: nothing app-specific in the kit; every app has
  the same sign-in and Your files; a shared fix goes in the kit and the tag is
  bumped; a change to the kit's exports is a change to every app.

## 3. Where it fits

The app-like parts of this site are what the kit is for. Each of these is a
signed-in or stateful tool that happens to be served from a page:

- **The NES desk**, `/nes/create`: windows, OPFS, the shelf, saves, raw dumps,
  sign-in. The shelf is a Your files problem; the sign-in is a passkey problem.
- **The sprite maker**, `/sprites` and the converter on the desk: already
  signed-in only and allowlisted.
- **The games console and console v2**, `/6502/games`, `/6502/consolev2`.
- **The explorer and the Lab**, `/6502/explorer`, `/6502/lab`: ported
  stylesheets that `lib/kit-borders.ts` already rewrites to fit the CSS kit.
- The site's own service worker (`web/scripts/build-sw.mjs`) and the sign-in
  DB behind `api/` duplicate what the kit ships for every app.

## 4. Where it does not fit

These are structural, and each one is a decision rather than a port.

- **The kit is a single-page-app kit. The roof is 424 pre-rendered pages.**
  The docs in two languages, the plan log, the autopsy, the sitemaps, the
  JSON-LD, the OG images, the anchors that must land in both languages
  (`docs-anchors.test.ts`): none of that exists in the kit, and Vite does not
  provide it. The measure-then-write machinery (`CLAUDE.md`) is Node scripts
  around Next's build.
- **Two looks.** The kit's kiosk look and this site's binder palette with four
  faces are different design systems with different reasons (`STYLE.md` §0;
  the kit's "a primary user has low vision, never shrink"). One yields, or the
  kit grows a second look as a first-class citizen.
- **Public over private.** This repository is public and "a fresh clone must
  build" (`CLAUDE.md`). The kit installs over ssh from a private repository,
  and every app on it today is private. A kit dependency here breaks the rule;
  a piece that moves out has to decide whether it stays public.
- **The licence line.** `NOTICE.md`: the NES and 6502 pieces carry
  CC BY-NC-SA 3.0 because they derive from the die data; the kit is private
  and unlicensed to the public. Wherever code moves, the licence file moves
  with it and the boundary is redrawn (`CLAUDE.md`, "the sub-project boundary
  has to follow the licence line").
- **The pulls.** The build reads nes-bench, the 6502 worktree, geiger and
  meatball-labs. That belongs to the roof and moves with nothing.

## 5. The recommendation

Keep the roof on Next, and carve the apps out onto the kit one at a time, each
as its own kit app on its own subdomain, the way hotbits and tinypeek already
are. The roof links to each app and keeps its old public path as a redirect,
which is what `CLAUDE.md` said public paths would become at the move.

This is the "five sub-projects" direction of 2026-08-23 and the kit's "every
app has the same sign-in and Your files" rule, both at once. It also matches
what has happened without a plan: hotbits and tinypeek went onto the kit and
left their documentation here.

The order, by how little Next each piece touches and how much it wants what the
kit gives:

1. **The sprite maker.** Already a signed-in tool with its own service behind
   it. Smallest, and the kit's sign-in and files fit it exactly.
2. **The NES desk.** The largest, and the one that gains most: the shelf and
   raw dumps become Your files, the GitHub sign-in becomes a passkey, the
   windows stay as they are. `Program.tsx` and the lesson measuring come with
   it; the lessons' pages stay on the roof and link in.
3. **The games console and console v2.**
4. **The explorer and the Lab.** Last, because they read the 6502 project's
   pages through `web/lib/chip-src.ts` and the engine boarding gate
   (`notes/modules.md`), which stays with the roof.

What stays on the roof: the docs and notebook, the plan log, the autopsy and
its lessons, the playground (pages, not an app), the style guide and zoo, the
computer tree, the hotbits bench page, the family footer, the tm namespace.

The first step, small and reversible: one kit app from the kit's
`scripts/new-app.sh`, registered under `../../tinykit/apps/`, holding only the
converter page of the sprite maker. Nothing in this repository changes until it
is live and checked; then `/sprites` here becomes a link, and the allowlisted
nginx location is retired with the owner's word.

**The desk's sign-in plan, 2026-10-23:** `notes/desk-move.md` answers decision 4 below. Measured, the move is one
shelf of 19 cartridges whose owner is already on the account service under the same GitHub id; it recommends the
shelf stay in the roof's API and take a passkey alongside GitHub through a link table, before any app exists.

## 6. Decisions that are the owner's

Not taken here, and nothing above proceeds until they are.

1. **Public or private** for each carved-out app. Every kit app today is
   private; this repository is public. That decides the licence files and
   whether the "fresh clone must build" rule survives in each one.
2. **Which look** inside the apps: the kit's kiosk, or the binder palette
   ported into the kit as a look. Until this is decided, no stylesheet moves.
3. **The roof's chrome.** Whether the menu, the strip, the footer and the
   family dots become the kit's `SiteHeader` and `SiteFooter`, which puts the
   private kit in this public repository's build, or stay the roof's own,
   which means two frames kept in step by hand.
4. **Sign-in.** Every shelf in the live sign-in DB would migrate to a passkey
   on the shared account service. That is a change people see and a data move
   with no undo; it needs a plan of its own before the desk moves.

## 7. Not covered

- No line counts for the kit itself; only its exports and rules were read.
- No estimate of time. The counts above are the size; how long each move takes
  depends on decisions 1 to 4.
- The reverse direction (porting the CSS kit into the kit as a look) is named
  as an option in decision 2 and not sized.
- Whether Next can compile the kit's `.tsx` sources directly
  (`transpilePackages`) was not tried; the kit's modules assume Vite's router
  and service worker, so a partial import would be of styles and components
  only, and decision 3 comes first.
