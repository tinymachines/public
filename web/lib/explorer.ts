import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";
import postcss from "postcss";
import { kitBorders } from "./kit-borders";
import { PROSE_SECTION, chunkSection, foldSection, splitParagraphs } from "./prose";
import { chunksFor } from "./articles";

/**
 * The 6502 explorer, read out of the 6502 repository at build time.
 *
 * The lab's pattern again, and the third time is where it earns being a
 * pattern: read the file, scope its stylesheet, remap its palette onto the
 * house tokens, and frame the result. Nothing is transcribed by hand, so the
 * DOM its own modules were written against is correct by construction.
 *
 * ## What is NOT copied, and why that is the whole design
 *
 * The modules and the data stay where they are. `layout.bin` is 1.5 MB of die
 * geometry traced from photographs, the JSON graphs are the measured tables
 * built from it, and the wasm bundle embeds `netlist.bin`: all of it is
 * CC BY-NC-SA 3.0. `NOTICE.md` records that `extern/visual6502` is a submodule
 * in that repo precisely so it does not redistribute NC-SA data, and copying
 * any of it here would undo that as a side effect rather than a decision.
 *
 * So the apex serves the same files from the same directory on the same box:
 * `/6502/chip/` for the modules, and the data at the document-relative paths
 * their code already asks for. One publisher, one set of bytes, a second
 * address it also owns. The repository stays clean.
 *
 * ## Why the scripts are resolved in the browser rather than here
 *
 * Their build content-hashes every filename and writes `asset-manifest.json`
 * beside them. Reading that at OUR build time would pin their hashes into our
 * page, so their next deploy would leave us loading files that no longer
 * exist. The page reads the manifest at runtime instead and imports what it
 * names, which makes the two deploys independent. That is worth a fetch.
 */

const SRC = path.join(CHIP_SRC, "web");

export interface Explorer {
  style: string;
  body: string;
  /** The one script this page entry-points, e.g. "app.js" or "primer.js". */
  script: string;
  title: string;
  /** Their own <meta name="description">, or empty. */
  description: string;
  /** How many paragraph breaks splitting the long prose paragraphs added. */
  splits: number;
  /** How many folds the prose got: one per chunk, or one per section without chunks. */
  folds: number;
  /** How many chunk headings the prose got (data/articles.json). */
  chunks: number;
}

/**
 * Every page of the explorer, read off the directory rather than listed.
 *
 * Eighteen documents, one script each, and the mapping between them is in the
 * page's own markup. Reading it means a page added over there is a page here,
 * and a renamed script is not a silently broken import.
 *
 * `index.html` is the explorer itself and is served at /6502/explorer. The
 * rest keep the slug they already had, so a link that said /primer becomes
 * /6502/primer and the rewrite below is a prefix rather than a lookup table.
 *
 * The `_`-prefixed files are test harnesses. Their own build excludes them by
 * naming what it copies; this excludes them by name, and says so, because a
 * harness published as a page is a thing that has happened here before.
 */
export function explorerPages(): { slug: string; file: string }[] {
  return fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
    .map((f) => ({ slug: f === "index.html" ? "explorer" : f.replace(/\.html$/, ""), file: f }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The chrome the roof provides and the page should not bring twice. */
const DROP = [
  // Its own masthead, nav and footer. We have all three.
  /<header\b[^>]*class="[^"]*site-head[^"]*"[\s\S]*?<\/header>/,
  /<footer\b[^>]*class="[^"]*site-foot[^"]*"[\s\S]*?<\/footer>/,
];

function scope(css: string): string {
  const SCOPE = ".explorer-shell";
  const root = postcss.parse(css);
  let scoped = 0;

  // Rules for component names the kit already owns are DROPPED rather than
  // scoped, and this is what "one entity" means in practice. A .btn inside
  // the explorer was getting the kit's button and this page's button at once:
  // the scoped rule won on whatever it set and the kit filled in the rest, so
  // a control looked like neither. A button should look like a button
  // everywhere on the site, so the kit's definition is the only one left.
  //
  // Deliberately a short list of self-contained CONTROLS. The structural
  // classes that happen to share a name, .panel and .reg and .bar among them,
  // are this page's layout and dropping those would take the page apart.
  const KIT_OWNS = new Set(["btn", "btn-ghost", "btn-primary", "chip", "tag", "eyebrow"]);
  let dropped = 0;

  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;
    // Only when EVERY selector on the rule is a kit-owned control on its own.
    // A compound like `.btn.wide` or `.toolbar .btn` is this page saying
    // something the kit does not, and is kept.
    if (rule.selectors.every((sel) => KIT_OWNS.has(sel.trim().replace(/^\./, "")) && /^\.[\w-]+$/.test(sel.trim()))) {
      dropped += 1;
      rule.remove();
      return;
    }

    rule.selectors = rule.selectors.map((sel) => {
      const s = sel.trim();
      if (!s || s.startsWith(SCOPE)) return s;
      // A selector anchored at the document root is a condition, not a target:
      // prefixing it gives `.explorer-shell :root`, which can never match.
      // The lab's theme toggle was silently killed that way. `body` with a
      // class is the same kind of condition (`body.no-scroll #view` is how
      // the schematic's study view lifts itself over the sections after it),
      // and was scoped to `.explorer-shell body.no-scroll`, so the hero text
      // painted over the study view on a desk (measured 2026-08-28). Bare
      // `body` is a target (margins, fonts) and stays dead, as before, and
      // so is a pseudo-element on it: `body::before` is the page's own
      // stipple, and a lookahead that took `::` made it
      // `body .explorer-shell ::before`, a fixed dot grid painted by every
      // element in the shell (measured 2026-08-28 on the graph's stage).
      const rootish = s.match(/^(:root|html|body(?=[.\[]|:(?!:)))((?:\[[^\]]*\]|[:.#][\w-]+(?:\([^)]*\))?)*)/);
      if (rootish) {
        const rest = s.slice(rootish[0].length).trim();
        return rest ? `${rootish[0]} ${SCOPE} ${rest}` : `${rootish[0]} ${SCOPE}`;
      }
      return `${SCOPE} ${s}`;
    });
    scoped += 1;
  });

  if (scoped < 500) {
    throw new Error(`lib/explorer.ts: only ${scoped} rules scoped; that is not style.css.`);
  }
  if (dropped < 1) {
    throw new Error(
      `lib/explorer.ts: no rules were handed to the kit. Either this stylesheet stopped ` +
        "defining any of the shared control names, in which case this can go, or the " +
        "match broke and the page is about to render two buttons in one.",
    );
  }
  kitBorders(root, "lib/explorer.ts");
  return root.toString();
}

/**
 * `readOn`: the label of the fold each prose section gets after its
 * opening paragraphs (lib/prose.ts foldSection). Without it nothing is
 * folded, which is what the companion article wants: it IS the rest.
 */
export function explorer(file = "index.html", readOn?: string): Explorer {
  const html = fs.readFileSync(path.join(SRC, file), "utf8");
  const css = fs.readFileSync(path.join(SRC, "style.css"), "utf8");

  const root = css.match(/:root\s*\{[\s\S]*?\n\}/);
  if (!root) {
    throw new Error(
      "6502/web/style.css has no :root block. The whole remap depends on the " +
        "palette being in one place; if it moved, app/6502/explorer/explorer.css " +
        "is describing something that no longer exists.",
    );
  }
  const style = scope(css.replace(root[0], "/* :root replaced by app/6502/explorer/explorer.css */"));

  let body = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.indexOf("</body>"));
  for (const re of DROP) {
    const before = body;
    body = body.replace(re, "");
    if (body === before) {
      throw new Error(
        `6502/web/index.html: expected to remove ${re}, and did not. The page's own ` +
          "chrome would be rendered inside the roof's, which is two mastheads on one page.",
      );
    }
  }
  // The one script this page entry-points, read from its own markup rather
  // than guessed from the filename: programs.html loads programs-page.js, and
  // a rule that assumed otherwise would have failed on exactly one page.
  const entries = [...body.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((src) => !/site-menu|version-footer/.test(src));
  if (entries.length !== 1) {
    throw new Error(
      `6502/web/${file}: expected exactly one page script, found ${entries.length} ` +
        `(${entries.join(", ")}). Two would need an order and this reader does not impose one.`,
    );
  }
  const script = entries[0];

  // Its script tags are dropped: the page injects them from the runtime
  // manifest instead, so their hashes are never pinned into our build.
  body = body.replace(/<script\b[\s\S]*?<\/script>/g, "");

  // Its internal links are absolute and rooted at the 6502 site: /primer,
  // /programs, /trace. Under this prefix they would resolve here, where they
  // do not exist. Every one of those pages IS here now, one segment deeper, so
  // the rewrite is a prefix rather than a lookup: /primer becomes
  // /6502/primer, and a bare / becomes the explorer itself.
  const slugs = new Set(explorerPages().map((p) => p.file.replace(/\.html$/, "")));
  body = body.replace(/href="\/([a-z0-9-]+)"/g, (whole, slug) =>
    slugs.has(slug) ? `href="/6502/${slug}"` : whole,
  );
  body = body.replace(/href="\/"/g, 'href="/6502/explorer"');

  // The prose under the instrument, with its long paragraphs split at
  // sentence ends (lib/prose.ts; the companion article applies the same
  // rule to the same sections). Owner's call, 2026-08-27: one paragraph on
  // the tracer was 23,341 characters, 48,000 pixels of a phone's scroll.
  // With chunks (data/articles.json) every chunk starts a paragraph and
  // gets its heading; folded per chunk when a label is given. Without
  // chunks, one fold per heading block, under its heading and lede.
  const specs = chunksFor(file.replace(/\.html$/, ""));
  let splits = 0;
  let folds = 0;
  let chunks = 0;
  const found = new Set<string>();
  body = body.replace(PROSE_SECTION, (sec) => {
    const r = splitParagraphs(sec, specs);
    splits += r.splits;
    for (const a of r.found) found.add(a);
    if (specs.length) {
      const c = chunkSection(r.html, specs, readOn);
      chunks += c.chunks; folds += c.folds;
      return c.html;
    }
    if (!readOn) return r.html;
    const f = foldSection(r.html, readOn);
    folds += f.folded;
    return f.html;
  });
  const missing = specs.filter((c) => !found.has(c.at));
  if (missing.length) {
    throw new Error(
      `6502/web/${file}: data/articles.json names ${missing.length} chunk(s) whose opening words are not on the page: ` +
        missing.map((c) => JSON.stringify(c.at)).join(", ") + ". The page changed under the table; fix the table.",
    );
  }

  // The two-tone headline. The explorer's own front page writes its h1 in
  // two tones, the clause after the comma in the accent (`<span
  // class="hl">`); the other pages' h1s carry no span, and the owner
  // wants the pair on every page (2026-08-27). So a hero h1 with no span
  // and a comma gets the same shape: the text after the first comma in
  // the accent. A title with no comma stays one tone.
  body = body.replace(/(<section class="hero[^"]*"[\s\S]*?<h1>)([\s\S]*?)(<\/h1>)/, (whole, open: string, inner: string, close: string) => {
    if (/class="hl"/.test(inner) || !/, /.test(inner)) return whole;
    const i = inner.indexOf(", ") + 2;
    return `${open}${inner.slice(0, i)}<span class="hl">${inner.slice(i)}</span>${close}`;
  });

  // The block's "Open in the workbench" is a full screen control (owner's
  // call, 2026-08-28): it opens the schematic's study view, the workbench's
  // own full screen, with this block on the bench (block.js paintRoot sets
  // `solo=1`, the block and its switched-on ports). So it is labelled as
  // the full screen it is, with the glyph the schematic's own control
  // uses. The anchor is found by its id and its text is asserted, so a
  // rewording upstream is a build failure here rather than two labels.
  if (file === "block.html") {
    const before = body;
    body = body.replace(
      /(<a class="btn" id="bk-root-link" href="schematic")>Open in the workbench<\/a>/,
      '$1 title="The workbench, full screen, with this block on the bench"><span aria-hidden="true">\u26F6</span> Full screen</a>',
    );
    if (body === before) throw new Error("6502/web/block.html: no #bk-root-link reading \"Open in the workbench\"; the full screen relabel found nothing.");
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const title = titleMatch ? titleMatch[1].split(/[·|]/)[0].trim() : file;
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  const description = descMatch ? descMatch[1] : "";

  // A document has one name, so a page carrying two h1s gets the second
  // demoted. On the explorer that is the boot overlay's "Visual 6502"
  // competing with the hero's; a loading screen's title is not the page. It is
  // styled by `.boot-title`, a class rather than a tag, so this changes the
  // semantics and nothing about how it looks.
  //
  // Written as a rule rather than as one page's fix, because eighteen pages
  // come through here and check-build holds every one of them to a single h1.
  // A page with two and no boot title throws, so a new case is something I
  // find out about rather than something that ships.
  const h1s = (body.match(/<h1[\s>]/g) ?? []).length;
  if (h1s > 1) {
    const open = '<h1 class="boot-title">';
    const at = body.indexOf(open);
    if (at < 0) {
      throw new Error(
        `6502/web/${file} has ${h1s} h1 elements and no h1.boot-title to demote. ` +
          "A document has one name; decide which of these is it.",
      );
    }
    const end = body.indexOf("</h1>", at);
    body =
      body.slice(0, at) +
      '<p class="boot-title">' +
      body.slice(at + open.length, end) +
      "</p>" +
      body.slice(end + "</h1>".length);
  }

  return { style, body, script, title, description, splits, folds, chunks };
}
