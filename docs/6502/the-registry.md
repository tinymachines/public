---
title: The registry
description: Builders and their pages, where publishing measures rather than believes.
order: 8
---

# The registry

The builder pages are at [/6502/builders](/6502/builders). They still answer
at `games.tinymachines.ai/builders` too, because nothing has been switched off.

**The only stateful thing here, and the boundary is the point.** The chip is
untouched: every request still carries the whole machine, and running a
published ROM still means POSTing it. What is stored is a catalogue. One SQLite
file (`REGISTRY_DB`), a row per thing.

It is not a separate service. The cartridge mint, the console spec and the
registry are routes on the **same** FastAPI app. There is one Python service,
not two.

## Tokens

There is no sign-up. A token is minted by hand, handed over, and claimed. One
token, one builder.

```bash
python3 service/registry_admin.py mint --note "who it is for"   # printed once
python3 service/registry_admin.py tokens
python3 service/registry_admin.py builders
python3 service/registry_admin.py revoke <token-or-hash>
python3 service/registry_admin.py grant <token> <handle> <name>  # reserved names
```

That is deliberately the whole of the auth story for now, and it is a
limitation rather than a design.

What it does get right is the part that would hurt to change later: **a token
is shown once and only its SHA-256 is stored**, so a copy of the database is
not a copy of everybody's credentials.

A token that is not this builder's gets **404, not 403**: it has no business
learning whether the builder exists. Revoking leaves the page and its ROMs
alone, because revoking is about the credential.

## Three rules that shape the rest

**The registry measures rather than believes.** A cartridge is a file somebody
can edit, so its own `verify` block is a claim by its author. On publish the
cartridge is unpacked and **run here**, and the size, tile count and frame cost
printed beside it are what that run produced. A ROM that does not complete its
frames is refused rather than listed.

The test publishes a cartridge claiming a 12-half-cycle frame and requires the
stored number to be the measured one. See
[cartridges](/docs/6502/cartridges#the-frame-cost-is-measured-on-a-ladder-that-ignores-the-cartridge)
for what happens when a page reads its own request back.

**Art is only ever rows of `'0'..'3'`.** Converting a photograph happens in the
browser, so there is no image parser in the request path and what lands on disk
is CHR: the same encoding a sprite sheet uses, so the portrait on a builder
page is drawn by the same `decodeCHR` that draws the game.

**A PATCH touches only what it names**, so a client saving a bio cannot blank
an avatar it never loaded.

## Pages

A page is `/b/<handle>`, and a ROM on it is `/b/<handle>/<slug>`, which is the
console with that cartridge already loaded. Both are static documents that read
their own path: nginx points a quoted regex location at `builder.html` and at
`index.html`, so a published ROM has an address of its own rather than a query
string.

The regex is quoted because **nginx reads `{` as the start of a block**. A
location regex containing `{2,32}` fails with "unknown directive" naming the
middle of the pattern.

`/manage` is the editor: paste a token, edit the page, publish a `.cart.gz`.

## What is under the apex, and what could not follow

The reading half. [/6502/builders](/6502/builders) is this index and
`/6502/builders/<handle>` is a page; `/6502/b/<handle>` is the address the
service itself hands out and redirects there, because those links are not ours
to break. Both read the same live registry over CORS, which is what the
`Access-Control-Allow-Origin: *` on that service was for.

The writing half could not follow, and the reason is a header rather than a
decision. A preflight from `tinymachines.ai` comes back allowing
`GET, POST, OPTIONS` and accepting `Accept`, `Accept-Language`,
`Content-Language` and `Content-Type`. **`Authorization` is not among them**,
so a browser on the apex cannot send a bearer token to that service at all:
not to claim a handle, not to edit a page, not to publish. The editor stays at
`games.tinymachines.ai/manage` until it is.

Proxying the writes through the apex's own API would work, since there is no
browser between two servers and therefore no preflight. It is deliberately not
done. The read-only service scope and the identity binding were left out of
the listings work on the grounds that they turn into an internal join if games
moves under the apex, and a credentialed proxy built now is the same boundary
built twice.

## Dithering was measured, not chosen

A photograph is converted in the browser (`art.js`) into the die's four colours
and uploaded as a grid of `'0'..'3'`, never as an image.

Dithering is Floyd-Steinberg **in RGB rather than in luminance**, and that was
measured. By Rec.709 the palette is 17, 130, 169, 169, so polysilicon and metal
are the same brightness to within 0.2 of 255 and differ only in hue. A
luminance ramp has three steps, not four, and throws the warm half of the
palette away.

## The bug that only showed at depth two

`index.html` loaded `game.js` with a relative `src`. Served at `/`, that is
`/game.js`; served at `/b/tinymachines/die-runner` it is
`/b/tinymachines/game.js`, which is a 404.

**The page still rendered**, because the markup is static and only the
JavaScript was missing, so it looked like a console that had failed to boot
rather than one whose script was never fetched.

The document's references are absolute now, and the two fetches inside
`game.js` resolve against `import.meta.url` rather than the page, the same
trick the wasm glue uses. Found by driving the real page, not by reading it.
