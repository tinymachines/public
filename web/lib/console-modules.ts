import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";

/**
 * The console's modules, read out of the 6502 repository at build time.
 *
 * The fifth thing to come through this pattern, after the lab, the explorer,
 * the archive and the API reference, and the one that had been done the other
 * way: `game.js`, `console.js`, `chr.js`, `art.js`, `registry.js`,
 * `manage.js`, the two ROMs and the tile sheet were COPIED into
 * `public/6502/games/` and committed, with three lines patched on top. That
 * had two costs the rest of the tree does not pay. Nothing recorded which
 * upstream commit the copies came from, and because the patches sat on top,
 * no commit in that repository's history matched them either, so "which
 * console is this" had no answer. And the ROMs are CC BY-NC-SA 3.0 (a
 * cartridge is a program on a chip built from the die data), so this public
 * repository was redistributing them, which NOTICE.md exists to prevent.
 *
 * So they are read from the checkout beside this one instead, at build time,
 * and `scripts/pull-console.mjs` writes them to `public/6502/games/` where
 * the pages already load them from. The directory is gitignored; a fresh
 * clone builds it. `upstream.json` beside the files records the commit and
 * every file's digest, which is the base the copies never had.
 *
 * ## The patches, and why they are here rather than upstream
 *
 * Both modules resolve the chip API as `${location.origin}/api`, which is
 * right where they live (games.tinymachines.ai/api proxies the 6502 service)
 * and wrong under the apex, where that path is the roof's own API: a service
 * that is up and answers 404 to every request, so the console would render,
 * fail to power on, and read as a broken cartridge. And game.js links a
 * cartridge's builder at `/b/<handle>`, which this site does not serve.
 *
 * The fourth is the console's engine. `post()` is the one place the console
 * reaches the outside: boot and step, the whole machine out and back. The
 * patch lets the page answer instead, through a transport it puts on the
 * window, which is how the in-page wasm chip runs the same frames with no
 * round trip (games/localEngine.ts). Unset, every call goes over HTTP as it
 * always has, and the retry loop below it is untouched.
 *
 * The fifth and sixth are one fix in two places: **the tile sheet belongs to
 * the cartridge.** A cartridge loaded from a `?cart=` link or a file replaces
 * the module's `TILES` with its own CHR and nothing ever put them back, so
 * picking a built-in cartridge afterwards drew its screen in the loaded
 * cartridge's sprites. Reported by the owner and reproduced on the live
 * console, 2026-08-28: arrive on a Die Invaders link, play it, choose Silicon
 * Snake, and the snake and its food are drawn as invaders and a ship. So
 * `useCart` keeps the sheet it displaces and the picker puts back the one the
 * chosen cartridge should draw in.
 *
 * One patch has left: the slow mode's frame period is upstream now
 * (6502@12d4616), where `game.js` reads `[data-frame-ms]` off the page
 * itself. Every one of these is filed in `notes/upstream-transport.md`, and
 * the list gets shorter that way rather than by being abandoned.
 *
 * Each patch is an exact string the upstream line must match, ONCE. A module
 * that stops matching fails the build naming the file and the patch, rather
 * than shipping a console that quietly resolves the wrong API. That is the
 * lab's and the explorer's rule, and it is what makes reading at build time
 * safe: the transform is narrow and refuses.
 *
 * The right end state is upstream reading the API base from the page itself,
 * so there is nothing to patch (`notes/upstream-transport.md`). Until then
 * the patch text is the proposal, applied.
 */

export const SRC = path.join(CHIP_SRC, "games");

/** What the console needs, relative to `SRC`. Nothing else crosses. */
export const FILES = [
  "game.js",
  "console.js",
  "chr.js",
  "art.js",
  "registry.js",
  "manage.js",
  "rom/dierunner.rom",
  "rom/snake.rom",
  "art/tiles.chr",
] as const;

export interface Patch {
  file: (typeof FILES)[number];
  /** The upstream text, which must occur exactly once. */
  find: string;
  replace: string;
  why: string;
}

const API_WHY =
  "the chip API is read off the page ([data-chip-api]) rather than assumed to be at this origin, " +
  "where it would be the roof's API: up, and 404 to every request";

export const PATCHES: Patch[] = [
  {
    file: "game.js",
    find: "const API = new URLSearchParams(location.search).get('api') || `${location.origin}/api`;",
    replace:
      "/* Patched by tinymachines/public at build time (lib/console-modules.ts): the\n" +
      " * chip API is read off the page. Under the apex `${location.origin}/api` is\n" +
      " * the roof's own API, which does not run 6502 code. ?api= still overrides. */\n" +
      "const API = new URLSearchParams(location.search).get('api')\n" +
      "  || document.querySelector('[data-chip-api]')?.dataset.chipApi\n" +
      "  || `${location.origin}/api`;",
    why: API_WHY,
  },
  {
    file: "game.js",
    find: "    back.innerHTML = ' &middot; <a href=\"/b/' + WANT.from.handle + '\">by '",
    replace:
      "    /* Patched by tinymachines/public at build time: the builder pages are not\n" +
      "     * at /b/ here, so the base is read off the page ([data-builders-base]). */\n" +
      "    const base = document.querySelector('[data-builders-base]')?.dataset.buildersBase ?? '';\n" +
      "    back.innerHTML = ' &middot; <a href=\"' + base + '/b/' + WANT.from.handle + '\">by '",
    why: "the builder credit links where the builder pages are, read off the page, not at a /b/ this site does not serve",
  },
  {
    file: "console.js",
    // The two lines that open post(), with the transport landing between
    // them: a patch's replacement must not carry the upstream text
    // (console-modules.test.ts), and inserting inside the anchor is how
    // this one adds a path without rewriting the one that is there.
    find: "  async post(path, body, tries = 3) {\n    const payload = JSON.stringify(body);",
    replace:
      "  /* Patched by tinymachines/public at build time (lib/console-modules.ts):\n" +
      "   * the page may answer this call itself. `globalThis.tm6502Transport` is a\n" +
      "   * transport of the same shape as the API, and the roof puts the in-page\n" +
      "   * wasm chip behind it, so a frame runs here with no round trip. The\n" +
      "   * machine is a value either way, which is what lets the engine change\n" +
      "   * between one frame and the next. Unset, everything below is unchanged,\n" +
      "   * including `this.requests`, which counts round trips and so does not\n" +
      "   * move while the chip is in the page. */\n" +
      "  async post(path, body, tries = 3) {\n" +
      "    const here = globalThis.tm6502Transport;\n" +
      "    if (here) return here(path, body);\n" +
      "    const payload = JSON.stringify(body);",
    why:
      "the page may run the frame itself (globalThis.tm6502Transport, the in-page wasm chip); " +
      "unset, every call goes over HTTP exactly as upstream",
  },
  {
    file: "game.js",
    // The loaded cartridge's own CHR, taking over the sheet: the block is
    // where the displaced sheet has to be remembered, because this is the
    // only place it is displaced.
    find:
      "  if (cart.chr && cart.chr.length >= 32) {\n" +
      "    const chr = Uint8Array.from(cart.chr.match(/../g), (h) => parseInt(h, 16));\n" +
      "    const t = decodeCHR(chr);\n" +
      "    if (t.length) { TILES = t; state.sheet = null; }\n" +
      "  }",
    replace:
      "  if (cart.chr && cart.chr.length >= 32) {\n" +
      "    const chr = Uint8Array.from(cart.chr.match(/../g), (h) => parseInt(h, 16));\n" +
      "    const t = decodeCHR(chr);\n" +
      "    /* Patched by tinymachines/public at build time (lib/console-modules.ts):\n" +
      "     * the sheet this cartridge displaces is kept, so the picker can put it\n" +
      "     * back. Without it, choosing a built-in cartridge after a loaded one drew\n" +
      "     * its screen in the loaded cartridge's sprites: Silicon Snake as a broken\n" +
      "     * Space Invaders, measured on the live console 2026-08-28. */\n" +
      "    if (t.length) { state.house = state.house || TILES; TILES = t; state.sheet = null; }\n" +
      "  }",
    why: "a loaded cartridge's CHR takes over the sheet, so the sheet it takes over from is kept for the picker",
  },
  {
    file: "game.js",
    // The picker, at the line that swaps the contract: the tiles are swapped
    // with it. The anchor's two lines end up apart, which is how this patch
    // adds without rewriting either of them.
    find: "  state.cart = CARTS[+$('#cart').value];\n  state.con = null;",
    replace:
      "  state.cart = CARTS[+$('#cart').value];\n" +
      "  /* Patched by tinymachines/public at build time (lib/console-modules.ts):\n" +
      "   * the tiles belong to the cartridge. The one being chosen draws in its own\n" +
      "   * CHR where it carries one, and in the sheet a loaded cartridge displaced\n" +
      "   * (useCart, above) where it does not. The key is redrawn with them: the\n" +
      "   * page's promise is that a swatch cannot show something the screen does\n" +
      "   * not. */\n" +
      "  const own = state.cart.chr && state.cart.chr.length >= 32\n" +
      "    ? decodeCHR(Uint8Array.from(state.cart.chr.match(/../g), (h) => parseInt(h, 16)))\n" +
      "    : (state.house || TILES);\n" +
      "  if (own && own.length) { TILES = own; state.sheet = null; legend(); }\n" +
      "  state.con = null;",
    why: "the chosen cartridge draws in its own tiles, or in the house sheet, rather than in the last loaded cartridge's",
  },
  {
    file: "game.js",
    // The house sheet landing: art/tiles.chr, fetched at load beside a
    // linked cartridge's own. Measured on the live console 2026-08-28, the
    // two responses land two milliseconds apart, so whichever was second
    // used to win and this one winning drew the linked cartridge in the
    // house tiles.
    find:
      "    TILES = t;\n" +
      "    state.sheet = null;              // force the atlas to be rebuilt\n" +
      "    fit();\n" +
      "    legend();",
    replace:
      "    /* Patched by tinymachines/public at build time (lib/console-modules.ts):\n" +
      "     * the house sheet is kept, and it takes the screen only where no cartridge\n" +
      "     * has brought its own. This is the third quarter of the same rule: the\n" +
      "     * sheet belongs to the cartridge, and the page holds the one for the\n" +
      "     * cartridges that carry none. */\n" +
      "    state.house = t;\n" +
      "    if (!(state.cart && state.cart.chr && state.cart.chr.length >= 32)) TILES = t;\n" +
      "    state.sheet = null;              // force the atlas to be rebuilt\n" +
      "    fit();\n" +
      "    legend();",
    why: "the house sheet arriving after a linked cartridge must not take the screen from it, and it is what the picker restores",
  },
  {
    file: "registry.js",
    // `export const`: the anchor carries the keyword so the comment lands
    // before it, not between `export` and `const`, which the first draft did
    // (legal JavaScript, and exactly the kind of thing nobody would notice).
    find: "export const API = new URLSearchParams(location.search).get('api')\n  || `${location.origin}/api`;",
    replace:
      "/* Patched by tinymachines/public at build time, as game.js is: the chip API\n" +
      " * is read off the page. */\n" +
      "export const API = new URLSearchParams(location.search).get('api')\n" +
      "  || document.querySelector('[data-chip-api]')?.dataset.chipApi\n" +
      "  || `${location.origin}/api`;",
    why: API_WHY,
  },
];

/** Apply every patch for `file` to `text`. Throws when a patch does not match exactly once. */
export function patch(file: string, text: string): string {
  let out = text;
  for (const p of PATCHES.filter((p) => p.file === file)) {
    const n = out.split(p.find).length - 1;
    if (n !== 1) {
      throw new Error(
        `lib/console-modules.ts: ${file} matches the patch "${p.find.slice(0, 60)}..." ${n} times, not once.\n` +
          `  The upstream module changed at the line this site patches (${p.why}).\n` +
          `  Read the new line in ${path.join(SRC, file)} and update PATCHES, or the console would resolve the wrong API.`,
      );
    }
    out = out.replace(p.find, p.replace);
  }
  return out;
}

export interface ConsoleFile {
  rel: string;
  bytes: Buffer;
  patched: boolean;
}

/** Every file, read from the 6502 checkout and patched where a patch names it. */
export function consoleModules(src = SRC): ConsoleFile[] {
  if (!fs.existsSync(path.join(src, "game.js"))) {
    throw new Error(
      `lib/console-modules.ts: no console at ${src}. The 6502 repository must be checked out beside this one ` +
        "(notes/inventory.md has the build order); the console is read from it, never copied.",
    );
  }
  return FILES.map((rel) => {
    const raw = fs.readFileSync(path.join(src, rel));
    const patched = PATCHES.some((p) => p.file === rel);
    return { rel, bytes: patched ? Buffer.from(patch(rel, raw.toString("utf8"))) : raw, patched };
  });
}

/**
 * The commit the checkout is at, read out of .git rather than asked of git
 * (a build under systemd's PATH need not have it; api/provenance.py and
 * scripts/build-sw.mjs read it the same way). Null when it cannot tell.
 */
export function upstreamCommit(src = SRC): string | null {
  try {
    // `.git` is a directory in a checkout and a pointer file in a worktree
    // (the served one board-engine.py keeps), where it says `gitdir: <path>`.
    let git = path.join(src, "..", ".git");
    if (fs.statSync(git).isFile()) {
      const text = fs.readFileSync(git, "utf8").trim();
      if (text.startsWith("gitdir:")) git = path.resolve(path.join(src, ".."), text.slice(7).trim());
    }
    const head = fs.readFileSync(path.join(git, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return head;
    const ref = head.slice(4).trim();
    try {
      return fs.readFileSync(path.join(git, ref), "utf8").trim();
    } catch {
      const packed = fs.readFileSync(path.join(git, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(" " + ref));
      return line ? line.split(" ")[0] : null;
    }
  } catch {
    return null;
  }
}
