# Forwarding the subdomains, and counting what arrives

Proposal, 2026-08-27. The three subdomains' nginx files live in the 6502
repo and are that project's to change (CLAUDE.md: a proposal, not an
action). This note is the whole proposal: the map, the order, the one
constraint that decides the order, and what the traffic statistics look
like once the apex is the place traffic lands.

## What the subdomains serve today, and where each path lands here

Measured from the three access logs and the three nginx files, not from
memory. Every path a subdomain answers has a home at the apex already;
the roof has been serving the same files (`/6502/chip/`, `/6502/archive/`)
and proxying the same process (`/6502/api/`) since 1.0.6x.

### 6502.tinymachines.ai

| subdomain | apex | note |
|---|---|---|
| `/` | `/6502/explorer` | the die view |
| `/<page>` for the 18 pages (`primer`, `tracer`, `blueprint`, `chipmap`, `decode`, `designer`, `diegraph`, `exploded`, `halfshot`, `pinout`, `programs`, `schematic`, `talk`, `timing`, `trace`, `block`, `blockdiagram`, and `explorer`) | `/6502/<page>` | same query string; the pages read their state from it |
| `/<page>.html` | `/6502/<page>` | the extension form the old links carry |
| `/archive/...` | `/6502/archive/...` | same directory, the apex already aliases it |
| `/api`, `/api/` (the reference page) | `/6502/api` | a GET of a document; safe to redirect |
| `/api/v1/...`, `/api/openapi.json`, `/api/docs` | **stays proxied on the subdomain** | see the constraint |
| hashed assets, `build-info.json`, `sw.js`, `pkg/` | **stay served** | see the constraint |

### games.tinymachines.ai

| subdomain | apex |
|---|---|
| `/` | `/6502/games` (a `?cart=` query survives the redirect) |
| `/builders` | `/6502/builders` |
| `/b/<handle>` | `/6502/builders/<handle>` |
| `/b/<handle>/<slug>` | `/6502/games?cart=https://6502.tinymachines.ai/api/v1/registry/b/<handle>/roms/<slug>` (the form Builders.tsx links today) |
| `/manage` | `/6502/manage` |
| `/api/...` | **stays proxied** |
| `art/`, `rom/`, `*.js`, `site.css` | **stay served** until the redirect above has been live a while: the old `index.html` a browser still holds asks for them |

### halfwave.tinymachines.ai

| subdomain | apex |
|---|---|
| `/` | `/6502/lab` |
| `/api/...` | **stays proxied** |
| `sw.js`, `manifest.webmanifest`, `icons/` | **stay served**: it is an installed PWA for some readers, and an installed app whose `sw.js` 404s keeps its cached shell forever. The service worker fetches `/` network-first and follows the 301 to `/6502/lab`; a `sw.js` that keeps answering is what lets it |

## The constraint that decides the order

**`/api/` is not a set of pages. It cannot be redirected.**

1. The apex's own pages call it cross-origin. `CHIP_API` is
   `https://6502.tinymachines.ai/api` in `web/lib/lab.ts`, and
   `chipApi()` in `web/lib/projects.ts` resolves the same origin for the
   explorer, the console, the builders, the editor and the two-ways demo.
   The subdomain log shows what that means: of everything
   6502.tinymachines.ai answered in its current log, the two busiest
   paths are `/api/v1/step` (798) and `/api/v1/boot` (410), and the
   referers are the apex. A 301 on a POST is answered by the browser as a
   GET of the new location: every step from every apex page would fail
   the moment the redirect went in.
2. Published cartridges carry the origin. A `cart_url` the registry hands
   out is relative, and every page that has shown one prefixed
   `https://6502.tinymachines.ai/api`. The `?cart=` links in the wild, the
   `mint-pack` tool, and the builder pages' "address" links all name the
   subdomain. Those are inbound links worth preserving, which is the
   whole reason for a redirect map, and they are links to a JSON body,
   which a 301 would also preserve, but only for GETs. Keep them answering
   in place.
3. `openapi.json` says `servers: [{url: "/api"}]`, relative, so the
   reference works from either origin. Nothing to change there.

So the order is:

**Step 1, in this repo: the apex talks to its own origin.** Done at
1.0.124 (2026-08-27). `data/projects.json`'s `serves_today` for the 6502
API is `https://tinymachines.ai/6502/api/`, and `chipApi()` follows the
file, which is what it was written to do: the explorer, the tool pages,
the console, the builders, the editor, the OG route and the API reference
all changed by that one line. The Lab's `CHIP_API`, the brief, and the
public wrapper module `/engine/tm6502.mjs` now read or name the same
address. The apex nginx already proxied `/6502/api/` to the same uvicorn
with `X-Forwarded-Prefix`, so `openapi.json` there says `servers:
/6502/api`. The service worker's never-cache list gained `/6502/api/`
(same-origin now, and live state). The deploy's connect-src check (stage
6a) still has off-origin surfaces to check (the subdomains' pages, the
archive, hotbits). `web/e2e/parity.spec.ts` compares the apex's
in-content links to the subdomain's and skips when the subdomain does not
answer; it keeps working through step 2 and is retired at step 3.

Not changed in step 1, deliberately: the roof API's own reader-facing
strings (`api/mint.py` `CHIP_PUBLIC`, the MCP prompt, the model examples)
still name the subdomain. They are addresses handed to other people's
clients, the subdomain keeps answering them until step 3, and they move
then.

What step 1 changes for a reader: nothing visible. What it changes for
the logs: the apex's `/6502/api/` line count rises by what the subdomain's
`/api/` count falls, which is the measurement that says step 1 landed.

**Step 2, in the 6502 repo: the page paths redirect.** One `map` per
vhost, keyed on `$uri`, from the tables above; `return 301` in a
`location` that matches pages and not `/api/`, not the hashed assets, not
`sw.js`. The 6502 vhost's own `try_files $uri $uri.html` rule is the
model: "no dot in the path" is a page. A regex location
`~ "^/[^.]*$"` catches every page including `/` and leaves every asset
and every `/api/` path to the locations that already serve them (quote
it: nginx reads `{` as a block). Order inside the file matters and the
6502 file's own comments already record why.

**Step 3, later: the subdomains stop serving.** Once the redirect has
been live long enough that the subdomain logs show only 301s and API
calls (a month is the cache life of nothing here; the reason to wait is
readers' bookmarks and the installed halfwave app), the API moves behind
the apex alone, `projects.json` says so, and the parity spec is deleted
with the pages it compared. Not before: an API call is not a bookmark.

## What does not change

- DNS and the three certificates. The redirect is served by the vhost
  that holds the certificate today.
- The 6502 project's deploy. Its release directory is still what the apex
  aliases for `/6502/chip/` and `/6502/archive/`; only its nginx file
  gains a map.
- `Access-Control-Allow-Origin: *` on the API. After step 1 the apex no
  longer needs it, and other people's pages still do.

## Traffic statistics, after the forward

The prior art is `~/projects/bradleyio/scripts/visitors_collector.py`,
which is the right shape and worth copying rather than re-deriving:

- It reads the nginx access logs (rotated `.gz` included) over a window,
  fuses served traffic with the scanner-trap log, and writes one JSON
  snapshot atomically to a state directory that an API endpoint serves
  and a page renders. A timer runs it.
- It measures rather than tracks: no script on the page, no cookie, no
  beacon. The log is a fact the server already has.
- Humans are coarsened to a /24, a city and an ASN via GeoLite2 (the
  `.mmdb` files are on this host in `/var/lib/GeoIP`); scanners are shown
  in full. Bots by user-agent plus one crawler ASN; self by network.
- What it already learned the hard way, and this site will hit on day
  one: Next's `<Link>` prefetches (`?_rsc=`) were 42% of non-API requests
  and made everyone who landed look like they toured the site; a page
  polling an API twice a minute was the busiest "visitor". Reads are
  documents, not assets, not `/api/`, not prefetches.

What is different here, and it is three things:

1. **The apex has no access log of its own.** `deploy/tinymachines.ai.nginx`
   sets none, so its lines go to nginx's default `/var/log/nginx/access.log`
   with every other unlogged vhost on the box, in the default format.
   The first change is one line in that file, `access_log
   /var/log/nginx/tinymachines.ai.access.log realip;`, which is a deploy
   of this repo's nginx (hand-installed, as stage 6a's message says). Until
   that line exists there is nothing to count. Check what `$remote_addr`
   the apex sees once it logs; if it is a proxy's address the vhost needs
   the `set_real_ip_from` lines the bradley.io vhost has, and that detail
   belongs in `HOSTING.local.md`, not here.
2. **Four logs, one site.** The apex log plus `6502.access.log`,
   `games.access.log` and `halfwave.access.log`. After step 2 the three
   subdomain logs are the inbound-link record (every 301 is a link
   somebody followed from somewhere, with a referer) and the API's own
   traffic; the collector reads all four and says which is which.
3. **Where it lives.** The collector under `scripts/`, a
   `tinymachines-visitors.timer` beside the two units in `deploy/`, the
   snapshot in the API's `StateDirectory`, `/api/v1/visitors` in
   `api/app.py` from a Pydantic model (so it is in `openapi.json` by
   being written), and a page at `/visitors` that is `noindex` while it
   settles, as bradley.io's is. `maxminddb` is not installed for this
   host's Python 3.10; it goes in `api/requirements.txt`.

Nothing above states a number that was not read from a file or a log
today, and the page that ships will say where each of its numbers came
from, which is the rule this repo runs on.
