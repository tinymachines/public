# The desk's move onto the app kit: the sign-in first

Written 2026-10-23 at `af8cccf`, on the owner's word "start the desk's move onto
the kit". This is step 2 of `notes/kit-plan.md`. That plan stopped the desk at
its decision 4: "Every shelf in the live sign-in DB would migrate to a passkey
on the shared account service. That is a change people see and a data move
with no undo; it needs a plan of its own before the desk moves." This is that
plan. Every figure was read on the day, with the command named beside it.
Nothing host-specific is in this file.

In this note **the app kit** is `@tinymachines/kit` (`../../kit`), as in the
kit plan. **The account service** is its shared sign-in, kit-accounts, on
loopback 8120, which the stream desk already uses (`api/kitaccounts.py`).
**The shelf** is a person's own cartridges, `api/carts.py`.

## 1. What the move has to carry, measured

The sign-in database, read once with a read-only connection, counts only:

- Two accounts. Both signed in with GitHub; no other way in exists on the
  roof (`SELECT provider, COUNT(*) FROM logins GROUP BY provider`).
- One shelf with anything on it: the owner's, 19 cartridges, 3,432,752 bytes
  (`SELECT COUNT(DISTINCT user_id), SUM(size) FROM carts`). The other account
  holds none.
- No revisions and no code blocks on any shelf (`cart_revisions`,
  `cart_blocks`: zero rows each). Saves are files beside the ROMs, not rows.
- Both GitHub identities are already accounts on the account service, matched
  by GitHub's own numeric id, not by name (`logins.provider_id` on both sides:
  2 of 2 found, 0 missing).

So the data move the kit plan was wary of is one person's 19 cartridges, and
the match from a roof account to an account-service account is exact. Nobody
would be merged by guess.

The desk itself, in `web/`, by `wc -l`:

| | lines | files |
|---|---|---|
| the desk, `app/[lang]/nes/create` | 3,598 | 13 |
| what it borrows from the console, `app/[lang]/nes/play` | 3,726 | 11 |
| the shelf's client, picker and manager | 901 | 3 |
| the window frame, `app/components/Desk.tsx` | 368 | 1 |
| the shelf's API, `api/carts.py` | 1,010 | 1 |

The shelf's API has 37 tests (`test_carts.py` 25, `test_revisions.py` 7,
`test_blocks.py` 5). The desk has four e2e specs: `create`, `program`,
`program-measure` and `shelf`.

## 2. What the measuring changed

**The shelf is not only the desk's.** Seven pages read it besides the shelf
manager (`grep -l 'ShelfPicker\|listShelf\|fetchCart'`): the console at
`/nes/play`, three playground benches (`Playground`, `Twins`, `XRay`), the
desk's Record window, the Menu and the picker itself. If the shelf moved out
with the desk, the console and the playground on the roof would lose it, or
read it across origins.

**The GitHub sign-in is not only the shelf's.** It also holds the 6502
registry's builder tokens (`/6502/manage`, `builder_tokens`: 5 rows). That
part is outside this plan and keeps the GitHub sign-in until someone decides
otherwise.

**The roof already asks the account service by the browser's Host**
(`api/kitaccounts.py`, `_site()`). A desk app on its own host whose nginx
sends the shelf's routes to the roof's API would be asked about as that host,
with that app's own session. So the shelf can stay where it is and still serve
the app.

## 3. The recommendation: the shelf stays, its door changes

Keep the shelf in the roof's API, where its measuring lives ("the thing that
publishes must not be the thing that claims": the service measures every
cartridge it keeps). Change who it answers to, in three steps. Each one is
small, and each one can be undone until the last.

**Step A, on the roof, before any app exists.** The shelf takes a passkey
alongside GitHub.

- Migration 9 adds a table that joins an account-service account to a roof
  account: `account_links (account_id PRIMARY KEY, user_id REFERENCES users,
  github_id, linked_at)`. No row of `users`, `carts` or any file moves.
- A script fills it once, reading the account service's database read-only
  and matching on GitHub's numeric id, with a dry run that prints the pairs
  first. The owner runs the write, as with the admin key (this session never
  writes the live database).
- `require_user` in `api/auth.py` accepts either the GitHub session, as
  today, or a passkey session the account service vouches for whose account
  has a link. The shelf, the console and the playground see the same rows
  either way.
- The menu offers "Sign in with a passkey" beside GitHub, through the same
  hand-off the stream desk uses.
- **Undo:** drop the table and the branch in `require_user`. Nothing was moved
  or deleted.
- **Tests:** a linked passkey session reads the same shelf as the GitHub
  session; an unlinked one is told it has no shelf, never handed another's;
  a link to a disabled user opens nothing. Each sabotaged once.

**Step A built, 2026-10-23,** on the owner's "yes to step A, build it": migration 9
(`account_links`), the passkey branch in `auth.current_user`, `passkey` on
`GET /v1/auth`, `via` on `GET /v1/me`, sign-out on both sides, the menu and
the shelf page offering the passkey in both languages, and
`scripts/link-accounts.py`. Its tests are `api/test_account_links.py` (nine,
seven sabotages each went red once) and `web/e2e/passkey.spec.ts` (four). The
tests now play the account service as down unless they play it themselves,
because its default address is the box's live port. The sprite generator's
check in `deploy/tinymachines.ai.nginx` now passes the scheme, without which a
passkey session would not be recognised there; that file is installed by
hand. The owner deployed it at `20e5e1e` and ran `scripts/link-passkey.sh
--yes` the same evening: 2 links written, 0 clashes, 0 accounts missing on the
service. Read back read-only afterwards: `account_links` holds 2 rows, and the
linked accounts reach 19 cartridges, the same shelf as before. Step A is done;
what remains to see is the owner's own passkey sign-in opening it.

**Step B, the desk as an app on the kit.** Private and in the kit's kiosk
look, as decided for every carved-out app on 2026-10-20.

- A new kit app from the app kit's `scripts/new-app.sh`, registered under
  `../../tinykit/apps/`, holding the desk's windows: Create, Program, Record,
  Flow, Listing, Nametables, History and the Sprite maker.
- Its nginx sends `/api/v1/me/carts` and below to the roof's API with the
  app's Host. The account service's routes go to the account service, as
  `kit nginx` writes them.
- The pieces the desk borrows from the console come with it as copies held to
  the roof's by a digest check, the way the sprites app holds `nesSprite.ts`
  today. One copy of a fact: the check fails the build when they drift.
- The roof's `/nes/create` keeps working throughout.

**Step C, the cut-over, on the owner's word.** `/nes/create` becomes a link to
the app, then a 301. The `/sprites/` machinery block in
`deploy/tinymachines.ai.nginx` and the `web/lib/nesSprite.ts` copy retire with
it (`notes/TODO-2026-10-20.md`, item 2). The GitHub way onto the shelf can
retire later, once the owner has used the passkey way for a while. That is
the only step without an undo, and by then nothing depends on it.

## 4. What is still open, and whose it is

The owner's:

1. **Step A at all.** Whether the shelf may take a passkey alongside GitHub,
   with the link table as the only new state. This is decision 4 of the kit
   plan, made small.
2. **The app's name and host.** The kit plan says "a subdomain"; which one is
   the owner's to pick.
3. **Decision 3 of the kit plan, the roof's chrome.** Not needed for steps A
   to C: the app wears the kit's frame and the roof keeps its own.

To find out while building, not decided here:

- **The boarded bundles.** The desk runs on the emulator, flow and listing
  bundles this repository boards from the console's repository
  (`web/public/nes/wasm`, `flow`, `listing`, all gitignored and rebuilt by
  the board scripts). The app either boards them itself or loads them from the
  roof across origins. The second keeps one boarding; it needs the roof to
  allow the app's origin, and the desk's workers to load cleanly from there.
- **The lessons.** The Program window measures the lessons, whose pages stay
  on the roof (`lib/lessons`, `lib/lessonMeasure`). Whether the app reads the
  roof's lesson record or carries a copy held by digest.
- **OPFS.** Recordings and the desk's local state live in the browser's
  private storage per origin. On the new host they start empty. Whether
  anything there is worth carrying over, and how, is not measured yet.

## 5. Not covered

- No line counts for the app kit's own modules.
- No time estimate.
- The 6502 registry's builder tokens and the `/6502/manage` page keep the
  GitHub sign-in; nothing here moves them.
- Whether the second roof account and the owner's account on the account
  service are one person was not looked at: that account has no shelf, so the
  link does not depend on it.
