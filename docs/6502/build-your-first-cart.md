---
title: Build your first cart
description: Mint a token, write a ROM against the contract, mint the cartridge, play it, publish it, and read what the chip measured. By hand or by handing this page to an AI.
order: 2
---

# Build your first cart

A cartridge is one file: a ROM, its tiles, and the console addresses it was
written to. This page is the whole path from nothing to a published cart that
the chip has run, in the order you actually take it. Every command is real
and every address comes from the running service rather than from this page.

There are two ways to walk it. **By hand**, below. Or **by AI**: hand a model
the one URL that carries everything on this page plus the three references
it needs, and let it do the typing. That URL is
[`/6502/cart/brief.md`](/6502/cart/brief.md); it is plain markdown, and the
whole of it fits in one read.

## 1. Mint a token

A token is your handle in the registry and your key to the chip API. It is
free, minted in the [editor](/6502/manage#mint) with one click, or from a
shell:

```bash
curl -s -X POST https://tinymachines.ai/api/v1/tokens \
     -H 'content-type: application/json' -d '{"note":"my first cart"}'
```

It is shown once. Only its SHA-256 is kept, so nothing can show it again; a
lost token is replaced, not recovered. A few per address a day, so a loop
cannot drain the registry.

## 2. Claim a handle

The handle is your page, `/6502/builders/<handle>`, and the first half of
every cart's address. One token, one handle, and it cannot be changed later.

```bash
curl -s -X POST https://6502.tinymachines.ai/api/v1/registry/claim \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"handle":"ada","name":"Ada"}'
```

## 3. Read the contract, then write the ROM

The console is [a contract, not hardware](/docs/6502/the-console-contract):
a handful of zero-page addresses the host and the ROM agree on, a screen
that is a page of the chip's own memory, and a tick flag the ROM raises when a
frame is done. Read it from the service rather than from a page:

```bash
curl -s https://6502.tinymachines.ai/api/v1/console
```

Write the ROM in 6502 assembly against those addresses. The service's own
assembler will assemble it, so the source travels with the cartridge and what
you publish is what you wrote. [Cartridge zero](/docs/6502/cartridges#cartridge-zero)
is Snake in a few hundred bytes and is the shape to copy.

## 4. Draw the tiles

Tiles are 8x8, two bits per pixel, sixteen bytes each, the NES shape; the
[contract](/docs/6502/the-console-contract#tiles) spells out the byte order
and the four colours, which are the die's own. Any sprite tool that emits
`.chr` emits this. Send the sheet as hex.

## 5. Mint the cartridge, and it runs

```bash
curl -s https://6502.tinymachines.ai/api/v1/cartridge \
     -H 'content-type: application/json' -d @cart.json -o mine.cart.gz
```

where `cart.json` carries `rom.source` and `rom.org`, `console` (the
addresses from step 3), `tiles.chr` (hex), `meta` (name, author, blurb) and
`frames`. Minting **refuses a layout that cannot work** and then **runs the
ROM on the chip**: the file that comes back carries a `verify` block saying
whether it booted, how many frames it finished, and what each cost in
half-cycles. A ROM that never raises its tick flag gets no file.

## 6. Play it

The console loads a cartridge from a URL:

```
https://tinymachines.ai/6502/games?cart=<url of your .cart.gz>
```

or from its file picker. Its tiles replace the sheet, so it brings its own
art.

## 7. Publish it, and the chip measures it again

```bash
curl -s -X PUT https://6502.tinymachines.ai/api/v1/registry/b/ada/roms/first \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d "{\"cart\":\"$(base64 -w0 mine.cart.gz)\",\"frames\":3}"
```

The registry unpacks the file and runs it here before listing it. Nothing you
write in the request decides a number: what your page shows beside the cart is
what the chip did on this run. Your page is `/6502/builders/ada`, the cart is
`/6502/builders/ada/first`, and both are live the moment the run passes.

## 8. Read what it did

The walk, [Snake, one instruction deep](/docs/6502/walk-snake), follows one
instruction of cartridge zero five cycles into the silicon, with the schematics
pulled from the switch network. The [tracer](/6502/tracer) does the same for
any program, live. That is the lesson the rest of the site is set up to teach.

## The AI route

The owner sent an AI the API reference and one sentence, and it wrote,
debugged and published a working game with its own art. The brief makes that
the normal path: one URL, everything above plus the three references, in
plain markdown.

```
https://tinymachines.ai/6502/cart/brief.md
```

Give a model that URL and the sentence: *use my 6502 as a service API to
build and run a small game.* Minting its own token counts against its own
address, and publishing needs the token, so the model cannot publish as you
unless you hand it yours.
