import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";
import postcss from "postcss";
import { kitBorders } from "./kit-borders";

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
      // The lab's theme toggle was silently killed that way.
      const rootish = s.match(/^(:root|html)((?:\[[^\]]*\]|[:.#][\w-]+(?:\([^)]*\))?)*)/);
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

export function explorer(file = "index.html"): Explorer {
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

  return { style, body, script, title, description };
}
