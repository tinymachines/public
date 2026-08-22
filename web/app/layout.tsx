import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

// The four voices from ../style/STYLE.md §3, bound to the variable names the
// tokens already use. All four are OFL and self-hosted by next/font, so no
// request leaves the page at runtime.
//
// --font-display is the swap seam: change Archivo here and in
// style/tokens.css to drop in a licensed display face. Nothing else moves.
const display = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});
const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const serif = IBM_Plex_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "tinymachines",
  description: "A transistor-level MOS 6502, and the things built on it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
