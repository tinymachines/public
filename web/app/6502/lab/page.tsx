import type { Metadata } from "next";
import Script from "next/script";
import { lab, CHIP_API } from "@/lib/lab";
import { Masthead, SiteNav, SiteFooter } from "../../components/SiteFrame";
import "./lab.css";

/**
 * The Halfwave Lab: a 6502, half a clock phase at a time.
 *
 * Read out of projects/6502/lab/halfwave-lab.html at build time rather than
 * reimplemented, which is the zoo's pattern and here for a stronger reason.
 * The lab is 21 KB of markup driven by 150 KB of its own script, and hand
 * transcribing that into JSX is precisely the failure this site has already
 * shipped once: renaming one container broke the Die Runner console while the
 * page went on rendering perfectly. Reading the file makes the DOM correct by
 * construction.
 *
 * ## What changed, and it is three things
 *
 * The head is gone. It fetched Archivo, IBM Plex Sans and IBM Plex Mono from
 * Google, and this site self-hosts those exact three families: the lab and the
 * style guide had converged on the same type independently. Dropping it is
 * also not optional, because the apex CSP is `font-src 'self'` and those
 * requests would be blocked, leaving a page rendered in a fallback face with
 * nothing on screen to say so.
 *
 * The palette is the house palette. lab.css supplies the 38 tokens the lab's
 * :root used to, from style/tokens.css, so 35 KB of its rules are untouched
 * and every colour in them now comes from the style guide.
 *
 * The chip API is named rather than assumed. See lib/lab.ts.
 *
 * ## R&D stays R&D
 *
 * This is the research surface and homogenising it must not mean sanding it
 * down. Nothing was removed, reordered or simplified: the eight sections, the
 * datapath, the latch tables and the half-cycle diff are the lab's, and this
 * file adds a masthead and a footer around them.
 */

export const metadata: Metadata = {
  title: "Halfwave Lab",
  description: "A 6502, half a clock phase at a time. Every value read off the running die.",
};

export default function LabPage() {
  const { style, body, scripts } = lab();

  return (
    <div className="page">
      <Masthead
        die="PHI"
        title="Halfwave Lab"
        crumb={<><b>tinymachines</b> / 6502 / lab</>}
        meta={<SiteNav />}
      />

      {/* The lab's own 35 KB of rules, with its :root replaced by lab.css.
          Scoped to this route by being rendered only here, the same way the
          zoo's chrome is: these are the lab's classes, not the kit's, and a
          lab-only rule in components.css turns up on a real page eventually. */}
      <style dangerouslySetInnerHTML={{ __html: style }} />

      {/* .lab-shell carries the token mapping and the ground. The lab's own
          rules style `body`, which no longer reaches anything now that it is a
          div inside this site. */}
      <div className="lab-shell" data-chip-api={CHIP_API} dangerouslySetInnerHTML={{ __html: body }} />

      {/* afterInteractive, in source order, so the lab is also built on a
          client-side navigation into this route. An inline tag in the HTML
          runs on first load and never again, which is the bug where a page
          works when you reload it and not when you click to it. */}
      {scripts.map((src, i) => (
        <Script key={i} id={`lab-${i}`} strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: src }} />
      ))}

      <SiteFooter />
    </div>
  );
}
