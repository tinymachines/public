import type { Metadata } from "next";
import "./globals.css";
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
  description: "A transistor-level MOS 6502, and the things built on it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      {/* `paper` is the documentation ground from ../style/STYLE.md section 1,
          and it is load-bearing rather than decorative. Without it the body has
          no background and no base family, so every page falls back to the
          browser's defaults and reads as unstyled. Panel is the other ground
          and is never put here: it means "these values came off the chip", so
          it is applied to the element making that claim, not to the page. */}
      <body className="paper">{children}</body>
    </html>
  );
}
