import fs from "node:fs";
import path from "node:path";

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

const LAB = path.join(process.cwd(), "..", "projects", "6502", "lab", "halfwave-lab.html");

/** Where the lab's own API lives now that the page does not sit on it. */
export const CHIP_API = "https://6502.tinymachines.ai/api";

export interface Lab {
  style: string;
  body: string;
  scripts: string[];
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

export function lab(): Lab {
  const src = fs.readFileSync(LAB, "utf8");

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
  const style = styleMatch[1].replace(root[0], "/* :root replaced by app/6502/lab/lab.css */");

  // Both inline scripts, in order. The second is the lab itself; the first is
  // small and sets up before it.
  const scripts = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length < 1) throw new Error("halfwave-lab.html: no inline <script>.");

  // The API. Same fix as the Die Runner console and the same reason: it was
  // location.origin + "/api", which on halfwave.tinymachines.ai is nginx
  // proxying 127.0.0.1:6502, and here would be the roof's API, which does not
  // run 6502 code. Cross-origin today; the 6502 API sends
  // Access-Control-Allow-Origin: * and the apex CSP names it in connect-src.
  const patched = scripts.map((s, i) =>
    i === scripts.findIndex((t) => t.includes('location.origin + "/api"'))
      ? replaceOnce(s, 'location.origin + "/api"', JSON.stringify(CHIP_API), "the chip API")
      : s,
  );

  const bodyOpen = src.indexOf(">", src.search(/<body\b/)) + 1;
  const bodyEnd = src.search(/<script(?![^>]*\ssrc=)/);
  if (bodyOpen <= 0 || bodyEnd < 0) throw new Error("halfwave-lab.html: could not find the body.");
  const body = src.slice(bodyOpen, bodyEnd);

  return { style, body, scripts: patched };
}
