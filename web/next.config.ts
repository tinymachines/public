import createMDX from "@next/mdx";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

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
const resolvedGfm = import.meta.resolve("remark-gfm");
const remarkGfm = resolvedGfm.startsWith("file:")
  ? fileURLToPath(resolvedGfm)
  : resolvedGfm;

const nextConfig: NextConfig = {
  // md and mdx are routable page extensions. Without these two entries an
  // .mdx file under app/ is not a page at all and the route 404s with nothing
  // saying why.
  pageExtensions: ["ts", "tsx", "md", "mdx"],

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
    remarkPlugins: [[remarkGfm, {}]],
  },
});

export default withMDX(nextConfig);
