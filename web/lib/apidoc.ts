import fs from "node:fs";
import { CHIP_SRC } from "./chip-src";
import path from "node:path";
import postcss from "postcss";
import { chipApi, project } from "./projects";

/**
 * The 6502 API reference, read out of the 6502 repository at build time.
 *
 * The fourth thing to come through this pattern, after the lab, the explorer
 * and the archive, and the simplest: one document, one inline stylesheet, no
 * scripts and no assets. Read it, scope its CSS, remap its palette onto the
 * house tokens, rewrite the links that now point at pages living here, and
 * frame the result.
 *
 * ## Why this rather than rendering openapi.json
 *
 * The obvious move is to draw the reference from the running service's
 * `openapi.json`, since CLAUDE.md is emphatic that the document is generated
 * from the Pydantic models that validate the requests and must not be
 * hand-written. That rule is about not writing a SECOND schema, and it is not
 * broken by what happens here, because nothing here describes a request shape.
 *
 * The reason not to render it is that it was measured: that document has no
 * tags, no operation descriptions, and summaries auto-derived from function
 * names, so `POST /v1/step` comes out as "Step". Everything that makes this
 * reference worth reading, the encoding notes, the worked examples, the reason
 * a traced run is capped, is in this file and in no other. Rendering the JSON
 * would have replaced a good document with a worse one and called it
 * generated.
 *
 * What the JSON IS good for is saying which routes actually answer; the
 * deploy's door check asks it (scripts/deploy.sh). The page used to show
 * that count too, and the owner had it removed (2026-08-27: placeholder
 * copy). `endpoints` is still read here and is what the test holds.
 *
 * ## Why it is not fetched at build time
 *
 * Same reason next/font is not used: a build that reaches the network has the
 * network as a dependency, and the failure is not a failed build, it is a
 * build that quietly ships something else. This reads a file on disk.
 */

const SRC = path.join(CHIP_SRC, "service", "api.html");

export interface ApiDoc {
  style: string;
  body: string;
  title: string;
  /** Every route the document describes, in the order it describes them. */
  endpoints: { method: string; path: string }[];
}

/**
 * The slugs the roof serves under /6502/, so a link into the explorer can be
 * rewritten to the copy on this site rather than sent back to the subdomain.
 *
 * Read from the directory that produced those routes rather than listed, for
 * the same reason everything else here is read: a page added over there is a
 * page here, and a list would be a second copy that drifts.
 */
function localSlugs(): Set<string> {
  const dir = path.join(CHIP_SRC, "web");
  const out = new Set(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
      .map((f) => (f === "index.html" ? "explorer" : f.replace(/\.html$/, ""))),
  );
  // Plus the surfaces that are not explorer pages. The lab is the one this
  // caught: it is linked here as 6502.tinymachines.ai/lab, it is served at
  // /6502/lab, and it is not in that directory because it came from a
  // different repository. A set built from one source would have sent a reader
  // off the site to read a page that is on it, which is the exact thing this
  // rewrite exists to stop.
  for (const s of project("6502").surfaces) {
    if (!s.lands_at_settled) continue;
    const last = s.lands_at.split("/").filter(Boolean).pop();
    if (last && last !== "6502") out.add(last);
  }
  return out;
}

function scope(css: string): string {
  const SCOPE = ".apidoc-shell";
  const root = postcss.parse(css);
  let scoped = 0;

  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;

    rule.selectors = rule.selectors.map((sel) => {
      const s = sel.trim();
      if (!s || s.startsWith(SCOPE)) return s;
      // `body` and `*` are the document, not a part of it. Scoped naively they
      // become `.apidoc-shell body`, which matches nothing, and the page loses
      // its measure and its box model with no error anywhere. The shell IS the
      // body as far as this stylesheet is concerned.
      if (s === "body" || s === "html" || s === ":root") return SCOPE;
      if (s === "*") return `${SCOPE} *`;
      const rootish = s.match(/^(:root|html|body)((?:\[[^\]]*\]|[:.#][\w-]+(?:\([^)]*\))?)*)/);
      if (rootish) {
        const rest = s.slice(rootish[0].length).trim();
        return rest ? `${SCOPE} ${rest}` : SCOPE;
      }
      return `${SCOPE} ${s}`;
    });
    scoped += 1;
  });

  if (scoped < 40) {
    throw new Error(
      `lib/apidoc.ts: only ${scoped} rules scoped. That is not the reference's stylesheet, ` +
        "and an unscoped stylesheet from another site would be loose on every page of this one.",
    );
  }
  return root.toString();
}

export function apidoc(): ApiDoc {
  const html = fs.readFileSync(SRC, "utf8");

  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    throw new Error(
      "6502/service/api.html has no <style> block. The whole remap depends on its palette " +
        "being in one place; if it moved, app/6502/api/apidoc.css describes nothing.",
    );
  }
  // The :root block is replaced rather than scoped: app/6502/api/apidoc.css
  // supplies those same names from the house tokens. Exactly the arrangement
  // the explorer and the lab already use.
  const rootBlock = styleMatch[1].match(/:root\s*\{[\s\S]*?\n\}/);
  if (!rootBlock) {
    throw new Error("6502/service/api.html: its <style> has no :root block to replace.");
  }
  const style = scope(
    styleMatch[1].replace(rootBlock[0], "/* :root replaced by app/6502/api/apidoc.css */"),
  );

  let body = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.indexOf("</body>"));

  // Its own masthead. The roof has one, and two on a page is worse than either.
  const before = body;
  body = body.replace(/<header\b[^>]*class="[^"]*\btop\b[^"]*"[\s\S]*?<\/header>/, "");
  if (body === before) {
    throw new Error(
      "6502/service/api.html: expected to remove its own header.top and did not. " +
        "Its masthead would render inside the roof's.",
    );
  }

  // Links to pages that are now HERE. This is the difference between a page
  // that has been moved and a page that has been copied: nine anchors pointed
  // back at the subdomains for surfaces this site serves, so following one
  // left the site to read something that is on it.
  const slugs = localSlugs();
  body = body.replace(
    /href="https:\/\/6502\.tinymachines\.ai\/([a-z0-9-]+)((?:\?|#)[^"]*)?"/g,
    (whole, slug, query = "") => (slugs.has(slug) ? `href="/6502/${slug}${query}"` : whole),
  );
  body = body.replace(/href="https:\/\/games\.tinymachines\.ai\/builders"/g, 'href="/6502/builders"');
  // The bare subdomain is the explorer's front page, which is here too.
  body = body.replace(/href="https:\/\/6502\.tinymachines\.ai\/?"/g, 'href="/6502/explorer"');
  body = body.replace(/href="https:\/\/games\.tinymachines\.ai\/?"/g, 'href="/6502/games"');

  // `docs` and `redoc` are relative, and relative to the SERVICE: they are its
  // Swagger UI and its ReDoc, generated from the same models. Left relative
  // they would resolve under /6502/api/ here, which is this page. Made
  // absolute, and marked as addresses, because that is what they are.
  body = body.replace(
    /href="(docs|redoc)"/g,
    (_w, which) => `href="${chipApi()}/${which}" data-address`,
  );

  // Everything still pointing off-site is an address rather than a way to read
  // something that is here: a curl target, a repository, the live service. The
  // build's own check requires a link like that to say so rather than be
  // skipped quietly.
  body = body.replace(
    /<a (?![^>]*\bdata-address\b)href="https:\/\/(6502|games)\.tinymachines\.ai/g,
    '<a data-address href="https://$1.tinymachines.ai',
  );

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const title = titleMatch ? titleMatch[1].split(/[·|]/).slice(-1)[0].trim() : "API";

  // Every route the document describes, read out of its own markup. Used by
  // the page to ask the running service which of them actually answer, which
  // is a question this file cannot answer and must not guess at.
  const endpoints = [...body.matchAll(/<span class="method[^"]*">([A-Z]+)<\/span>([^<]+)</g)].map(
    (m) => ({ method: m[1], path: m[2].trim() }),
  );
  if (endpoints.length < 20) {
    throw new Error(
      `lib/apidoc.ts: found ${endpoints.length} endpoints in api.html. Its markup for a route ` +
        "changed, and the coverage check on the page is about to compare against almost nothing.",
    );
  }

  return { style, body, title, endpoints };
}
