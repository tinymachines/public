import fs from "node:fs";
import path from "node:path";

/**
 * The widget zoo, read out of ../style/zoo.html at build time.
 *
 * The zoo is not reimplemented here, and that is the whole design. STYLE.md
 * calls it "the normative artifact": 34 specimens rendered on the real ground
 * with the markup that produced them, extracted from the live DOM so a
 * listing cannot drift from its render. Rewriting those 34 as components
 * would make a second copy of every one of them, and a second copy is the
 * thing this repository keeps finding at the bottom of its bugs.
 *
 * So the file is the source and this module is a reader. Editing zoo.html
 * changes the page. There is nothing here to keep in step.
 *
 * Three parts come across:
 *
 *   style   the zoo's own chrome. STYLE.md section 6 is explicit that this
 *           never enters components.css, because a zoo-only class in the kit
 *           turns up on a real page eventually. It stays scoped to this route.
 *   body    the header and main: the specimens themselves.
 *   script  waveform drawing, the phase rail, and the markup extraction that
 *           makes the listings authoritative. Without it the specimens render
 *           but every listing is empty, which would look like a design choice.
 *
 * The head is deliberately NOT carried over. It loads Google Fonts from a CDN
 * and a standalone tokens.static.css, and this site self-hosts the same four
 * families through next/font and defines the same tokens through @theme. So
 * the zoo renders here against the site's own fonts and the site's own
 * palette, which is the stronger test: if a token drifts between tokens.css
 * and what the app actually ships, the zoo is where it shows.
 */

const ZOO = path.join(process.cwd(), "..", "style", "zoo.html");

export interface Zoo {
  style: string;
  body: string;
  script: string;
}

function between(src: string, open: RegExp, close: string, what: string): string {
  const start = src.search(open);
  if (start < 0) throw new Error(`zoo.html: no ${what} opening tag. The file's shape changed; lib/zoo.ts reads it by tag.`);
  const from = src.indexOf(">", start) + 1;
  const to = src.indexOf(close, from);
  if (to < 0) throw new Error(`zoo.html: ${what} is never closed.`);
  return src.slice(from, to);
}

export function zoo(): Zoo {
  const src = fs.readFileSync(ZOO, "utf8");

  const style = between(src, /<style\b/, "</style>", "<style>");
  const script = between(src, /<script\b/, "</script>", "<script>");

  // The body runs from <body> to the script that trails it.
  const bodyOpen = src.indexOf(">", src.search(/<body\b/)) + 1;
  const bodyEnd = src.search(/<script\b/);
  const body = src.slice(bodyOpen, bodyEnd);

  // Guards, because a silently empty zoo is a page that looks finished and is
  // not. Each bound is far below what the file actually contains today, so
  // these fail on a broken read rather than on ordinary editing.
  if (style.length < 500) throw new Error(`zoo.html: chrome is only ${style.length} chars; the read is wrong.`);
  if (script.length < 500) throw new Error(`zoo.html: script is only ${script.length} chars; the read is wrong.`);
  if (body.length < 5000) throw new Error(`zoo.html: body is only ${body.length} chars; the read is wrong.`);

  const specimens = (body.match(/class="spec"/g) ?? []).length;
  if (specimens < 20) {
    throw new Error(
      `zoo.html: found ${specimens} specimens. The zoo has 34; a count this low means ` +
      `the extraction is cutting the page short rather than that specimens were removed.`,
    );
  }

  // House style, checked on the way through rather than after it has shipped.
  if (body.includes("—") || style.includes("—")) {
    throw new Error("zoo.html contains an em dash. See CLAUDE.md house style.");
  }

  return { style, body, script };
}

/** How many specimens the zoo carries, counted rather than stated. */
export function specimenCount(): number {
  return (zoo().body.match(/class="spec"/g) ?? []).length;
}
