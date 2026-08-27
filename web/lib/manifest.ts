import type { MetadataRoute } from "next";
import { token } from "@/lib/tokens";

/**
 * The web app manifests, which are what make this installable.
 *
 * Generated from here rather than dropped in public/, for the reason
 * app/robots.ts is: the two colours come out of style/tokens.css at build
 * time, and a manifest with a hand-typed theme colour is a second copy of
 * the palette that nothing re-derives. An install banner one revision behind
 * the tokens looks exactly like an install banner.
 *
 * Two documents from one function. The site's (app/manifest.ts) is a
 * documentation site with instruments on it, and takes `standalone`: taking
 * the status bar away from a reader buys nothing and costs them the clock.
 * The console's (app/6502/games/manifest.webmanifest/route.ts, linked from
 * that page alone) is a game, and takes `fullscreen`: installed from that
 * page, it opens edge to edge with nothing around it (owner's ask,
 * 2026-08-28). A browser that has no fullscreen display mode (every
 * iPhone) falls back to standalone on its own.
 *
 * `start_url` is the front door of whichever was installed. `theme_color`
 * is the ink rather than the paper: it colours the system bars around the
 * app, and STYLE.md's two grounds make ink the frame and paper the page.
 * `background_color` is what the splash shows before the first paint: the
 * paper for the site, the panel for the console, because that is what each
 * paints first.
 *
 * The icons come from style/build-icon.py, which draws them from the same
 * tokens. The maskable one is drawn smaller so the mark survives whatever
 * shape a launcher crops it into; build-icon.py has the arithmetic.
 */
function base(): Pick<MetadataRoute.Manifest, "orientation" | "theme_color" | "icons"> {
  return {
    orientation: "any",
    theme_color: token("color-ink"),
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export function siteManifest(): MetadataRoute.Manifest {
  return {
    name: "tinymachines",
    short_name: "tinymachines",
    description: "A transistor-level MOS 6502, and the things built on it.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: token("color-paper"),
    ...base(),
  };
}

/** Where the console's manifest is served; the games page links it. */
export const CONSOLE_MANIFEST = "/6502/games/manifest.webmanifest";

export function consoleManifest(): MetadataRoute.Manifest {
  return {
    name: "6502 console",
    short_name: "6502",
    description: "A console whose frames are run on a transistor-level MOS 6502.",
    start_url: "/6502/games",
    scope: "/6502/",
    display: "fullscreen",
    background_color: token("color-panel"),
    ...base(),
  };
}
