import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

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

const SRC = path.join(process.cwd(), "..", "..", "6502", "web");

export interface Explorer {
  style: string;
  body: string;
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

  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;
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
  return root.toString();
}

export function explorer(): Explorer {
  const html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
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
  // Its script tags are dropped too: the page injects them from the runtime
  // manifest instead, so their hashes are never pinned into our build.
  body = body.replace(/<script\b[\s\S]*?<\/script>/g, "");

  // The boot screen's title is demoted from h1 to p.
  //
  // The page carries two: the boot overlay's "Visual 6502" and the hero's. A
  // document has one name, and a loading screen's title is not it: two h1s
  // means a screen reader announces two top-level headings with nothing to say
  // which one is the page. It is styled by `.boot-title`, a class rather than
  // a tag, so this changes the semantics and nothing about how it looks.
  //
  // Left alone in the 6502 repo rather than fixed there: this file does not
  // reach across, and the page is about to be rewritten anyway.
  const boot = ['<h1 class="boot-title">', "</h1>"];
  if (!body.includes(boot[0])) {
    throw new Error(
      "6502/web/index.html no longer has an h1.boot-title. If the boot screen changed, " +
        "check whether the page still has two h1s before removing this.",
    );
  }
  const at = body.indexOf(boot[0]);
  const end = body.indexOf(boot[1], at);
  body =
    body.slice(0, at) +
    '<p class="boot-title">' +
    body.slice(at + boot[0].length, end) +
    "</p>" +
    body.slice(end + boot[1].length);

  return { style, body };
}
