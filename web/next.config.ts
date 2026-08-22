import createMDX from "@next/mdx";
import path from "node:path";
import type { NextConfig } from "next";

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
  options: {
    // Tables, strikethrough, task lists and autolinks. The docs tree in
    // ../docs uses GFM tables heavily, and without this they render as
    // literal pipes rather than failing, which is the kind of quiet wrong
    // this repo tries not to ship.
    //
    // Named as a string, not imported and passed as a function. Turbopack
    // serializes loader options, and an imported plugin function fails the
    // build with "does not have serializable options" naming the loader
    // rather than the plugin.
    remarkPlugins: [["remark-gfm", {}]],
  },
});

export default withMDX(nextConfig);
