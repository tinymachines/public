import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/**
 * The released 6502 pages, served locally, as the thing parity compares to.
 *
 * Parity used to fetch `6502.tinymachines.ai`. Since the forward
 * (2026-08-27) that subdomain answers 301 to the apex, so the spec skipped
 * itself rather than compare each page to itself, and twenty tests stopped
 * running while still reporting as a suite that passes. The subdomain is on
 * its way out entirely (notes/forward.md), so pointing at it again was never
 * the answer.
 *
 * What parity actually means now: this site's page carries the links the
 * RELEASED page carries. That page is on disk, in the release directory
 * nginx aliases at `/6502/chip/`, which is where `scripts/board-engine.py`
 * reads the boarded commit from and is located here the same way, out of
 * this repository's own nginx file (`TM_CHIP_RELEASE` overrides). No host
 * path is written into this file.
 *
 * The release directory and not the worktree's `web/`, which was the first
 * attempt and was wrong in a way worth recording: the worktree holds the
 * SOURCES, and the release holds what that project's deploy made of them.
 * Served from the worktree, six of the eighteen pages asked for
 * `decode.json`, `schematic.json`, `pkg/v6502_wasm.js` and `build-info.json`
 * and got 404s, because the release rewrites those references to
 * content-hashed names and builds the wasm bundle. The pages rendered anyway,
 * with no cards, no caption and no in-content links, which is exactly the
 * shape of a comparison that passes on nothing.
 *
 * Serving it over HTTP rather than reading the files is deliberate: these
 * pages build themselves with scripts, and half of what is compared (the
 * block's twelve cards, the schematic's caption) does not exist until they
 * run. A file read would compare markup; this compares pages.
 *
 * The port is 0, so the kernel picks a free one per worker. That is not
 * laziness about the port trap in CLAUDE.md, it is the trap's answer: a
 * chosen port can be held by something else and questioned instead, an
 * ephemeral one cannot be.
 */

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bin": "application/octet-stream",
  ".chr": "application/octet-stream",
  ".rom": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

export interface Served {
  origin: string;
  /**
   * Every path this server could not answer, since the last time a caller
   * cleared it.
   *
   * This is the fact that separates "the released page has nothing to
   * compare" from "the released page did not run". Both look identical from
   * the outside: the chrome renders, thirty anchors appear, and the
   * instrument that would have carried the links is not there. Pointed at
   * the worktree instead of the release, six pages looked like the first and
   * were the second.
   */
  misses: string[];
  close: () => Promise<void>;
}

/**
 * The release directory nginx serves at `/6502/chip/`, or null where there
 * is not one, which is every box but the one serving the site.
 */
export function releaseDir(): string | null {
  const explicit = process.env.TM_CHIP_RELEASE;
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  const conf = path.join(process.cwd(), "..", "deploy", "tinymachines.ai.nginx");
  if (!fs.existsSync(conf)) return null;
  const m = fs.readFileSync(conf, "utf8").match(/location (?:\^~ )?\/6502\/chip\/ \{\s*alias (\S+?);/);
  if (!m) return null;
  return fs.existsSync(m[1]) ? m[1] : null;
}

/** The released pages over HTTP, or null when there is no release to serve. */
export async function serveReleased(): Promise<Served | null> {
  const dir = releaseDir();
  if (!dir) return null;
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, "index.html"))) return null;

  const misses: string[] = [];
  const server = http.createServer((req, res) => {
    // Its own paths only. `..` in a request must not reach outside the tree,
    // even on a loopback server that lives for one spec file.
    const url = new URL(req.url ?? "/", "http://localhost");
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (rel === "" ) rel = "index.html";
    let file = path.resolve(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    // nginx serves these extensionless (`/primer` is `primer.html`), and the
    // pages link to each other that way, so the mapping is part of being the
    // same site rather than a convenience.
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { misses.push(url.pathname); res.writeHead(404).end(); return; }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      // The wasm bundle wants these to instantiate with threads on some
      // builds, and they cost nothing here.
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
      "cross-origin-resource-policy": "cross-origin",
    });
    fs.createReadStream(file).pipe(res);
  });

  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("no address from the released-pages server");
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    misses,
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
