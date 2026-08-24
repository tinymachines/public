import type { Metadata, Viewport } from "next";
import "../globals.css";
import { ServiceWorker } from "@/app/components/ServiceWorker";
import { token } from "@/lib/tokens";
// No next/font. The four families are self-hosted from ../../style/fonts.css,
// which globals.css imports.
//
// next/font/google was the obvious choice and it is the wrong one here: the
// page it serves is self-hosted, but it fetches the woff2 from Google at
// BUILD time. That makes an internet connection a build dependency, and a
// build that cannot reach Google does not fail. It silently ships different
// fonts. Vendoring the files removes the dependency in both directions.
//
// The families are named once, in style/tokens.css, as --font-display,
// --font-sans, --font-serif and --font-mono. Nothing here needs to repeat
// them, which is why this file no longer binds any variables.

export const metadata: Metadata = {
  title: "tinymachines",
  description:
    "A transistor-level MOS 6502 and the things built on it, and true random bytes from radioactive decay. Everything measured, nothing asserted.",
};

/**
 * The theme colour, which is a different thing from the manifest's.
 *
 * The manifest's theme_color paints the window of an INSTALLED app. This meta
 * tag paints the browser's own chrome around a normal tab, and a phone shows
 * that to every reader whether they install anything or not. They are two
 * surfaces and both want the same answer, so both read the same token.
 *
 * viewportFit: "cover" so a phone with a notch fills to the edges rather than
 * letterboxing the page inside the safe area. The page frame's padding already
 * keeps text off the physical edge.
 */
export const viewport: Viewport = {
  themeColor: token("color-ink"),
  viewportFit: "cover",
};

/**
 * The two languages this site speaks. The segment is the source of truth for
 * which one a page is in: /ja/... is Japanese and everything else is English,
 * with middleware.ts rewriting unprefixed paths to /en so no reader ever sees
 * the internal prefix. dynamicParams is false for the reason /6502/[page]
 * turned it off: an unknown segment is a 404, not a 500 or a page about
 * nothing.
 */
export const LANGS = ["en", "ja"] as const;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export const dynamicParams = false;

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <html lang={lang}>
      {/* `paper` is the documentation ground from ../style/STYLE.md section 1,
          and it is load-bearing rather than decorative. Without it the body has
          no background and no base family, so every page falls back to the
          browser's defaults and reads as unstyled. Panel is the other ground
          and is never put here: it means "these values came off the chip", so
          it is applied to the element making that claim, not to the page. */}
      <body className="paper">
        {children}
        {/* Installability and offline. Renders nothing, and the site is
            identical if it never runs: see components/ServiceWorker.tsx. */}
        <ServiceWorker />
      </body>
    </html>
  );
}
