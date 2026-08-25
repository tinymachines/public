import createMDX from "@next/mdx";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { chipApi } from "./lib/projects";

// Absolute path, resolved here in web/ where the dependency actually lives.
// @next/mdx resolves a named plugin with require.resolve(name, { paths: [
// this.context ] }), and this.context is the directory of the FILE BEING
// LOADED. That is ../docs, which has no node_modules, so a bare "remark-gfm"
// fails to resolve at load time. An absolute path is still a string, so it
// stays serializable for Turbopack, and it resolves from anywhere.
//
// import.meta.resolve returns a file:// URL under plain ESM but a bare path
// here, because Next compiles next.config.ts to CJS first. Handle both rather
// than picking one and having it break on the other.
function pluginPath(name: string): string {
  const resolved = import.meta.resolve(name);
  return resolved.startsWith("file:") ? fileURLToPath(resolved) : resolved;
}

const remarkGfm = pluginPath("remark-gfm");
const remarkFrontmatter = pluginPath("remark-frontmatter");
// Local, and resolved the same way. See lib/rehype-headings.mjs for why the
// slug rule is written here rather than taken from rehype-slug: a heading's id
// is a public address the moment somebody links to it.
const rehypeHeadings = pluginPath("./lib/rehype-headings.mjs");

const nextConfig: NextConfig = {
  // md and mdx are routable page extensions. Without these two entries an
  // .mdx file under app/ is not a page at all and the route 404s with nothing
  // saying why.
  pageExtensions: ["ts", "tsx", "md", "mdx"],

  // The redirect map, which is what a moved public path becomes.
  //
  // The registry hands out `/b/<handle>`: it is in every `play_url` the
  // service writes and in every link anybody has shared. Those links are not
  // ours to break, so the path answers here and 308s to where the page is
  // written.
  //
  // Here rather than as a route that renders a redirect. A page component
  // calling permanentRedirect() is still a page: Next prerendered /6502/b to
  // an HTML file with no heading in it, and the build's own "exactly one h1"
  // check failed on a document that exists only to say "go there instead".
  // A redirect is configuration, not a document.
  //
  // Why the page is at /6502/builders/<handle> and not /6502/b/<handle>: the
  // breadcrumbs are derived from the path, and the second spelling puts a
  // crumb called "b" in the trail pointing at a collection page that would
  // exist only to give that crumb somewhere to go.
  // English lives at the unprefixed paths it has always lived at, and
  // Japanese at /ja/... . Internally both are one route tree under
  // app/[lang]. afterFiles rather than middleware, and that choice is a
  // scar: a middleware rewrite reconstructs an absolute URL from request
  // context, and behind nginx that context named https://localhost:6511,
  // which Next then tried to PROXY over TLS to its own plain-HTTP port.
  // Every request 500d and the site was down until the revert. afterFiles
  // rewrites are internal by construction: real files and real pages
  // (/ja/*, /icon.svg, everything in public/) are served first, and only a
  // path that matched nothing is retried under /en. Nothing here builds a
  // URL at runtime, so there is nothing for a proxy header to poison.
  // afterFiles runs AFTER real files and BEFORE dynamic routes, and since
  // the whole tree is a dynamic route now, an unconditional catch-all here
  // swallowed /ja itself and rewrote it to /en/ja, which is nothing. So the
  // pattern excepts ja: a Japanese path falls through to the route tree
  // untouched, and everything else is retried as English.
  async rewrites() {
    return {
      afterFiles: [
        { source: "/", destination: "/en" },
        // /og is a route of its own (the link cards), not a page in a language:
        // it carries the language inside its path, so it is kept out of the
        // prefix the same way /ja is.
        { source: "/:path((?!(?:ja|og)(?:/|$)).*)", destination: "/en/:path" },
      ],
    };
  },

  async redirects() {
    return [
      // The internal prefix must not become a second public address for the
      // same pages: /en/docs is /docs wearing plumbing. Sent home rather than
      // served, and temporarily (307), because the internal spelling is an
      // implementation detail that should stay revisable. The rewrite above
      // still lands on /en internally: redirects run only on the request as
      // it arrived, never on what a rewrite produced.
      { source: "/en", destination: "/", permanent: false },
      { source: "/en/:path*", destination: "/:path*", permanent: false },
      { source: "/6502/b", destination: "/6502/builders", permanent: true },
      { source: "/6502/b/:handle", destination: "/6502/builders/:handle", permanent: true },
      // The third spelling the registry hands out: /b/<handle>/<slug> is a
      // published ROM's own address, served by the games origin as the console
      // with that cartridge loaded. The console's other spelling for the same
      // thing is ?cart=<url>, and the builders pages here already link play
      // that way, so this redirect translates the old address into it rather
      // than teaching a second page to parse paths. The API host comes from
      // the manifest via chipApi(), same as every page that names it.
      {
        source: "/6502/b/:handle/:slug",
        destination: `/6502/games?cart=${chipApi()}/v1/registry/b/:handle/roms/:slug/cart`,
        permanent: true,
      },
    ];
  },

  // Pin the workspace root to the REPOSITORY, not to web/.
  //
  // Two reasons, and the second one is not optional. Left unset, Turbopack
  // walks up looking for a lockfile, finds an unrelated yarn.lock in the home
  // directory, and infers a root outside this git repository. Set to web/, the
  // build fails outright: app/globals.css imports ../style/tokens.css, and
  // Turbopack refuses with "leaves the filesystem root" because style/ is
  // outside the root it was given.
  //
  // The design system and the docs tree both live beside web/ rather than
  // inside it, on purpose, so the root has to be the thing that contains all
  // three.
  turbopack: { root: path.join(import.meta.dirname, "..") },
};

const withMDX = createMDX({
  // @next/mdx defaults to /\.mdx$/, which is .mdx ONLY. Listing "md" in
  // pageExtensions above does not change that: the two settings are unrelated,
  // and with the default every .md file reaches Turbopack with no loader
  // attached and fails the build with "Unknown module type", naming the file
  // rather than the mismatch. The docs tree is almost entirely .md.
  extension: /\.mdx?$/,
  options: {
    // Tables, strikethrough, task lists and autolinks. The docs tree in
    // ../docs uses GFM tables heavily, and without this they render as
    // literal pipes rather than failing, which is the kind of quiet wrong
    // this repo tries not to ship.
    //
    // An absolute path, not an imported function and not a bare name. Both of
    // the obvious forms fail, in different places: an imported function fails
    // the build with "does not have serializable options" because Turbopack
    // serializes loader options, and a bare name fails at load time because of
    // where @next/mdx resolves it from. See the note beside remarkGfm above.
    // remark-frontmatter must be here even though nothing reads frontmatter
    // through MDX. lib/docs.ts parses it with gray-matter for the title and
    // the ordering, but the MDX compiler is handed the RAW file, and markdown
    // has its own reading of a YAML block: `---` is a thematic break and the
    // line above it is a setext heading. So every docs page shipped with its
    // own frontmatter printed at the top as an <h2> reading
    // "title: ... description: ... order: 2", followed by a rule.
    //
    // It did not error and it did not warn. It rendered, which is why it
    // survived a build, a deploy and a review: the page looked like a page.
    // With this plugin the YAML is parsed as a frontmatter node and dropped
    // from the output, which is the behaviour the frontmatter convention in
    // START-HERE.md assumed all along.
    remarkPlugins: [[remarkFrontmatter, ["yaml"]], [remarkGfm, {}]],
    rehypePlugins: [[rehypeHeadings, {}]],
  },
});

export default withMDX(nextConfig);
