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
 * ## The four patches, and why they are here rather than upstream
 *
 * Both modules resolve the chip API as `${location.origin}/api`, which is
 * right where they live (games.tinymachines.ai/api proxies the 6502 service)
 * and wrong under the apex, where that path is the roof's own API: a service
 * that is up and answers 404 to every request, so the console would render,
 * fail to power on, and read as a broken cartridge. And game.js links a
 * cartridge's builder at `/b/<handle>`, which this site does not serve. The
 * fourth is the console's slow mode: game.js runs frames as fast as the
 * round trip, and the shell wants a switch, so the loop reads a frame period
 * off the page the way it reads the API.
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
    file: "game.js",
    // The loop's fps block, once: the pace lands after the frame is painted
    // and counted, before the next request leaves.
    find: "        state.fpsAt = now;\n        state.fpsFrames = 0;\n      }\n",
    replace:
      // The two assignments on one line: a patch's replacement must not
      // carry the upstream text (console-modules.test.ts), and this one
      // adds after the anchor rather than changing it.
      "        state.fpsAt = now; state.fpsFrames = 0;\n" +
      "      }\n" +
      "      /* Patched by tinymachines/public at build time (lib/console-modules.ts):\n" +
      "       * a frame period, read off the page ([data-frame-ms]). Unset, frames run\n" +
      "       * as fast as the round trip, as above; set, a frame is released no\n" +
      "       * sooner than that many ms after the last, so the period is the longer\n" +
      "       * of the two. The console's shell offers it as its slow mode. */\n" +
      "      const period = +(document.querySelector('[data-frame-ms]')?.dataset.frameMs ?? 0);\n" +
      "      if (period > 0) {\n" +
      "        const wait = period - (performance.now() - (state.paceAt || 0));\n" +
      "        if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));\n" +
      "      }\n" +
      "      state.paceAt = performance.now();\n",
    why: "the page may declare a frame period ([data-frame-ms]); the shell's slow mode is that, and nothing else in the module changes",
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
