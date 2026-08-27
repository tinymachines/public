import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import { chipApi } from "./projects";
import path from "node:path";
import { createHash } from "node:crypto";
import postcss from "postcss";
import { kitBorders } from "./kit-borders";

/**
 * The Halfwave Lab, read out of its own file at build time.
 *
 * The zoo's pattern, applied to a bigger page and for the same reason: the lab
 * is one self-contained 207 KB document, and reimplementing 21 KB of markup as
 * JSX would be a hand transcription of the exact thing that has already gone
 * wrong once on this site. Renaming one container broke the Die Runner console
 * and the page still rendered. This reads the file instead, so the DOM is the
 * DOM the lab's own script was written against, by construction.
 *
 * Three parts come across and the head does not. The head loads Archivo, IBM
 * Plex Sans and IBM Plex Mono from Google, and this site self-hosts those exact
 * three families: the lab and the style guide had already converged on the same
 * type without knowing it. So dropping the head is not a loss, and it is not
 * optional either. The apex CSP is `font-src 'self'`, so those requests are
 * blocked here, and a page whose fonts are blocked renders in a fallback face
 * with no error: the quiet failure this repository keeps a list of.
 *
 * ## Two substitutions, both of which fail loudly rather than silently
 *
 * A build-time rewrite of somebody else's file is only safe if it cannot
 * half-happen. `replaceOnce` requires exactly one match and throws otherwise,
 * so an upstream edit that moves the target breaks the build here rather than
 * shipping a page that is subtly not what it was. The 6502 repo's own
 * build-web.py uses the same device, and its comment says the entire value is
 * in the failing.
 */

/**
 * The Lab, read out of the 6502 checkout beside this one at build time.
 *
 * Until 2026-08-26 this was a copy at projects/6502/lab/, committed, with
 * its em dashes replaced by hand and no recorded base: the same two costs
 * the console's modules paid (lib/console-modules.ts), and one more, since
 * the Lab embeds a canned trace of the chip and so carries the die data's
 * licence into this public repository. The copy is gone; the file is the
 * 6502 tree's, and `public/6502/lab/upstream.json` records which commit.
 */
export const LAB_SRC = path.join(CHIP_SRC, "docs", "halfwave-lab");
const LAB = path.join(LAB_SRC, "halfwave-lab.html");

/**
 * House style: no em dash in shipped text (CLAUDE.md). The Lab writes them
 * in prose and in its story beats alike, always spaced, so one pass over the
 * whole document does: a comma where a conjunction follows (", and the
 * carry between them"), a colon otherwise ("tied together: one value, two
 * names"). Only the spaced form; a dash inside an identifier or a regex
 * would not be spaced. Returns the count, so a Lab that stops having any
 * tells us the pass can go.
 */
export function replaceDashes(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(/\s(?:\u2014|&mdash;)\s/g, (m: string, at: number) => {
    count += 1;
    const tail = text.slice(at + m.length, at + m.length + 6);
    return /^(?:and|which|or|but|so|nor|yet)\b/.test(tail) ? ", " : ": ";
  });
  return { text: out, count };
}

/** Where the lab's own API lives now that the page does not sit on it: the
    manifest's address for it, which since 2026-08-27 is this site's own
    /6502/api (notes/forward.md, step 1). One copy of the fact. */
export const CHIP_API = chipApi();

export interface Lab {
  style: string;
  body: string;
  /**
   * Where the stylesheet and script are served from, with a content hash in
   * the name.
   *
   * The hash is not decoration. The apex nginx maps *.css and *.js to
   * "public, max-age=3600", so a file at a stable URL is one a returning
   * visitor holds for an hour: they would get the previous deploy's script
   * against this deploy's markup, which is a page that is subtly wrong for
   * fifty-nine minutes and correct afterwards, and nothing at the origin can
   * reach it. A name derived from the bytes cannot go stale, because
   * different bytes are a different URL.
   *
   * This is what /_next/static gets for free from the build. The lab's assets
   * are generated outside it, so they have to ask.
   */
  assets: { css: string; js: string };
  /** The canned demo trace, a <script type="application/json"> the lab reads
      by id. Data, not code: it is rendered as an element and never run. */
  data: { id: string; json: string } | null;
  /** The lab itself. */
  script: string;
}

function replaceOnce(src: string, find: string, into: string, why: string): string {
  const n = src.split(find).length - 1;
  if (n !== 1) {
    throw new Error(
      `halfwave-lab.html: expected exactly one ${JSON.stringify(find)} (${why}), found ${n}. ` +
        "The upstream file changed shape. This fails rather than rewriting the wrong thing.",
    );
  }
  return src.replace(find, into);
}


/**
 * Confine every rule in the lab's stylesheet to `.lab-shell`.
 *
 * Necessary rather than tidy, and it was found by measuring rather than by
 * reading. The lab is one self-contained document, so its CSS quite reasonably
 * styles `body` and uses short class names, and on its own subdomain both are
 * correct. Injected into a page on this site, `body` is THIS SITE'S body: one
 * of its rules is `padding-bottom: calc(58px + env(safe-area-inset-bottom))`,
 * for the lab's own fixed bottom bar, and it made the document 58 pixels
 * taller than the app shell. The chrome was locked and the whole page could
 * still be scrolled, by exactly the height of a bar that is not there.
 *
 * The short names were the larger problem and nothing on screen would have
 * said so. Nine of them collide with the kit: btn, data, eyebrow, flags, lane,
 * panel, reg, regs and tag. The lab's stylesheet comes after the kit's, so on
 * this one route the lab was quietly restyling the site's own navigation,
 * which is built out of .tag.
 *
 * Done with a real parser rather than a regex over 35 KB of someone else's
 * CSS. postcss is already here for Tailwind, and the transform is: prefix
 * every top-level selector, leave at-rules alone but descend into the ones
 * that hold rules, and never touch @keyframes, whose "selectors" are
 * percentages. `body` and `html` become `.lab-shell body`, which matches
 * nothing at all: that is the leak closed, and app/6502/lab/lab.css restates
 * the two declarations that were worth keeping.
 */
function scope(css: string): string {
  const SCOPE = ".lab-shell";
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
    // Inside @keyframes the "selectors" are 0%, 50%, from, to.
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
      if (!s) return sel;
      if (s.startsWith(SCOPE)) return s;

      // A selector anchored at the document root is a CONDITION, not a
      // target: `:root[data-theme="light"] .card` means "the card, when the
      // document is in light mode". Prefixing it gives
      // `.lab-shell :root[...]`, which can never match, because :root is the
      // <html> element and nothing is inside .lab-shell that is also <html>.
      //
      // That silently killed the lab's theme toggle: the button still worked,
      // the attribute still landed on <html>, and not one rule responded. So
      // the root part stays in front and the scope goes after it.
      const root = s.match(/^(:root|html)((?:\[[^\]]*\]|[:.#][\w-]+(?:\([^)]*\))?)*)/);
      if (root) {
        const rest = s.slice(root[0].length).trim();
        return rest ? `${root[0]} ${SCOPE} ${rest}` : `${root[0]} ${SCOPE}`;
      }
      return `${SCOPE} ${s}`;
    });
    scoped += 1;
  });

  if (scoped < 100) {
    // The lab is 35 KB of rules. If this scoped almost nothing, the parse
    // found almost nothing, and shipping the result would mean shipping an
    // unscoped stylesheet that looks like a scoped one.
    throw new Error(`lib/lab.ts: only ${scoped} rules scoped to ${SCOPE}; that is not the lab's stylesheet.`);
  }
  if (dropped < 1) {
    throw new Error(
      `lib/lab.ts: no rules were handed to the kit. Either this stylesheet stopped ` +
        "defining any of the shared control names, in which case this can go, or the " +
        "match broke and the page is about to render two buttons in one.",
    );
  }
  kitBorders(root, "lib/lab.ts");
  return root.toString();
}

export function lab(): Lab {
  if (!fs.existsSync(LAB)) {
    throw new Error(
      `lib/lab.ts: no Lab at ${LAB}. The 6502 repository must be checked out beside this one ` +
        "(notes/inventory.md has the build order); the Lab is read from it, never copied.",
    );
  }
  const dashed = replaceDashes(fs.readFileSync(LAB, "utf8"));
  if (dashed.count < 1) throw new Error("lib/lab.ts: the em-dash pass found nothing; the Lab changed, remove the pass or check the match.");
  const src = dashed.text;

  const styleMatch = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) throw new Error("halfwave-lab.html: no <style> block.");

  // The lab is fully tokenised: 38 custom properties in one :root block and
  // 369 var() uses across 35 KB of rules. That is what makes homogenising it a
  // remap rather than a rewrite, so the :root block is replaced and every rule
  // below it is left exactly as it was. app/6502/lab/lab.css holds the
  // replacement and explains each mapping.
  const root = styleMatch[1].match(/:root\s*\{[\s\S]*?\n\s*\}/);
  if (!root) {
    throw new Error(
      "halfwave-lab.html: no :root block in its <style>. The whole homogenisation " +
        "depends on the palette being in one place; if it moved, the mapping in " +
        "app/6502/lab/lab.css is now describing something that does not exist.",
    );
  }
  const style = scope(styleMatch[1].replace(root[0], "/* :root replaced by app/6502/lab/lab.css */"));

  // The two inline scripts are not the same kind of thing, and treating them
  // as one list was a bug that the parse check below caught immediately.
  //
  // The first is `<script id="demo" type="application/json">`: a canned trace
  // the lab looks up by id. It is DATA. Rendering it through next/script would
  // hand 23 KB of JSON to the browser as JavaScript to execute, and the
  // element the lab looks for would not be there in the shape it expects.
  //
  // The second is the lab. Only that one is patched, and only that one is run.
  const blocks = [...src.matchAll(/<script((?![^>]*\ssrc=)[^>]*)>([\s\S]*?)<\/script>/g)];
  if (!blocks.length) throw new Error("halfwave-lab.html: no inline <script>.");

  const json = blocks.find((b) => /type\s*=\s*"application\/json"/.test(b[1]));
  const code = blocks.filter((b) => b !== json);
  if (code.length !== 1) {
    throw new Error(
      `halfwave-lab.html: expected exactly one executable inline script, found ${code.length}. ` +
        "Two would need an order and this reader does not impose one.",
    );
  }
  const id = json ? (json[1].match(/id\s*=\s*"([^"]+)"/) ?? [])[1] : undefined;
  if (json && !id) throw new Error("halfwave-lab.html: the JSON block has no id, so the lab cannot find it.");
  const scripts = [code[0][2]];

  // The API. Same fix as the Die Runner console and the same reason: it was
  // location.origin + "/api", which on halfwave.tinymachines.ai is nginx
  // proxying 127.0.0.1:6502, and here would be the roof's API, which does not
  // run 6502 code. Cross-origin today; the 6502 API sends
  // Access-Control-Allow-Origin: * and the apex CSP names it in connect-src.
  let patched = scripts.map((s, i) =>
    i === scripts.findIndex((t) => t.includes('location.origin + "/api"'))
      ? replaceOnce(s, 'location.origin + "/api"', JSON.stringify(CHIP_API), "the chip API")
      : s,
  );

  // The em dashes were replaced over the whole document above, scripts
  // included (the story beats are strings in the script).

  // The service worker registration goes. The lab was a standalone offline
  // app on its own subdomain, with its own manifest and icons and a sw.js
  // beside it; here it is one route on a site, so `register("sw.js")` resolves
  // to /6502/lab/sw.js and 404s. It is wrapped in .catch(() => {}), so the
  // page works and logs an error on every load, which is the worst of both:
  // nothing to fix and something to see.
  //
  // Shipping the worker instead would be worse. It would put a second caching
  // layer scoped to one route in front of a site whose caching is already
  // decided in nginx, and a service worker holding a stale lab after a deploy
  // is the /_next/static 404-cached-for-a-year bug with a longer memory and no
  // server-side way to reach it.
  // The player bar measures itself and pads the body to clear it. On its own
  // page that is right; here `body` is the SITE's body, so the padding grew the
  // document past the app shell and the whole page could be scrolled by the
  // height of the bar. 49 pixels of it, which is small enough to read as the
  // shell not quite working rather than as a rule from somewhere else.
  //
  // lab.css makes the bar sticky inside the scrolling region instead of fixed
  // to the viewport, which it has to be anyway: this site has its own fixed
  // footer now, and two bars fixed to the bottom of the same window is one
  // covering the other. A sticky bar needs no padding to clear it.
  // The WHOLE statement, `document.` included. The first version of this
  // matched from `body.style...`, which is a real substring and not a whole
  // expression: the replacement produced `document.void 0`, the script threw
  // on parse, and the lab silently stopped booting. replaceOnce did its job
  // and matched exactly once; matching once is not the same as matching a
  // thing you may replace. Hence the syntax check below.
  const pad = 'document.body.style.paddingBottom=Math.ceil(pl.getBoundingClientRect().height)+"px";';
  patched = patched.map((s) =>
    s.includes(pad)
      ? replaceOnce(s, pad, "/* the bar is sticky here, not fixed: see lib/lab.ts */", "the player bar's body padding")
      : s,
  );

  // Every substitution above rewrites somebody else's JavaScript, and a
  // rewrite that produces a syntax error is a page that renders completely and
  // does nothing: the lab's markup is all there, and not one value is read off
  // the chip. Parsing it here turns that into a build failure.
  //
  // `new Function` compiles without running, which is the whole point: it says
  // whether the text is valid JavaScript and executes none of it.
  patched.forEach((src, i) => {
    try {
      new Function(src);
    } catch (e) {
      throw new Error(
        `lib/lab.ts: script ${i} does not parse after substitution: ${(e as Error).message}. ` +
          "A rewrite that breaks the syntax ships a page that renders and does nothing.",
      );
    }
  });

  const sw = 'serviceWorker.register("sw.js").catch(()=>{})';
  patched = patched.map((s) =>
    s.includes(sw) ? replaceOnce(s, sw, "serviceWorker /* not registered here: see lib/lab.ts */", "the service worker") : s,
  );

  const bodyOpen = src.indexOf(">", src.search(/<body\b/)) + 1;
  const bodyEnd = src.search(/<script(?![^>]*\ssrc=)/);
  if (bodyOpen <= 0 || bodyEnd < 0) throw new Error("halfwave-lab.html: could not find the body.");
  const body = src.slice(bodyOpen, bodyEnd);

  const script = patched[0];
  const stamp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

  return {
    style,
    body,
    assets: {
      css: `/6502/lab/lab.${stamp(style)}.css`,
      js: `/6502/lab/lab.${stamp(script)}.js`,
    },
    data: json && id ? { id, json: json[2] } : null,
    script,
  };
}
