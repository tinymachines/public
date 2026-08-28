import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Script from "next/script";
import { lab, CHIP_API } from "@/lib/lab";
import { SiteFooter, WorkbenchBar } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import "./lab.css";

/**
 * The Halfwave Lab: a 6502, half a clock phase at a time.
 *
 * Read out of the 6502 checkout (docs/halfwave-lab/halfwave-lab.html) at build time rather than
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

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/lab")
}

/**
 * Why the strip's engine key is grey here, in the Lab's own words.
 *
 * The Lab does not step a machine, it records one: a single `/v1/step` with
 * `trace: true, format: "rows"` brings back 34 columns per half-cycle, every
 * panel on the page reads that recording, and the player scrubs inside it.
 * The wasm build emits no trace, so there is nothing in this page that could
 * answer that call, and the key says so rather than looking broken (owner,
 * 2026-08-28). Filed for upstream in notes/upstream-transport.md; when the
 * crate can emit the rows, this line goes and the key lights up.
 */
const WHY = {
  en: "Engine: the API. The Lab records a run, 34 measurements per half-cycle, "
    + "and only the engine behind the API produces those. The chip in this page "
    + "can run a program, not record one.",
  ja: "エンジン: API。ラボは実行を記録する。半サイクルごとに 34 個の測定値で、"
    + "それを出せるのは API の向こうのエンジンだけだ。このページの中のチップは"
    + "プログラムを走らせられるが、記録は取れない。",
} as const;

export default async function LabPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const { body, data, assets } = lab();

  return (
    /* A workbench, not a Shell page: the owner's call is that the lab is REAL
       full screen, not an instrument inside the content panel. The bar keeps
       the crumb home and the flags; the h1 lives in the bar so the one-h1
       check holds. The footer is the last control (owner's call,
       2026-08-27: the version on every page, strip pages included). */
    /* has-transport: the project's strip is the Lab's player now. The Lab
       registers with the store (the handover in ChipTransport.tsx) and marks
       its own player `driven`, which lab.css hides: one set of keys. */
    <div className="workbench has-transport" data-workbench data-engine-why={WHY[lang]}>
      <WorkbenchBar
        /* hard, like the explorer's pages and for the same reason: the Lab
           is one module that builds this DOM once and has no teardown.
           Arriving here through a client-side navigation left the markup
           rendered and the Lab unbuilt, with its own player still showing
           because nothing had marked it driven, so the page carried two rows
           of controls and no instrument (measured 2026-08-28, reported as
           "nested windows when changing to JPN": the flag was the one link
           into this page that was still soft). */
        hard
        lang={lang}
        title="Halfwave Lab"
        trail={[
          { href: "/", label: "tinymachines.ai" },
          { href: "/6502", label: "6502" },
        ]}
      />
      <div className="wb-main">

      {/* The Lab is 21 KB of English markup read out of the 6502 checkout.
          Nothing here translates it, so the page says so. */}
      <Untranslated lang={lang} />

      {/* The lab's own 35 KB of rules, with its :root replaced by lab.css and
          every selector scoped to .lab-shell. A LINK rather than an inline
          <style>: a server component's props are serialised into the RSC
          payload as well as rendered into the HTML, so inlining sent it twice.
          scripts/build-lab.mjs writes the file from the same lab(), and the
          name carries a content hash so an hour of nginx caching cannot serve
          the previous deploy's stylesheet against this deploy's markup. */}
      <link rel="stylesheet" href={assets.css} />

      {/* .lab-shell carries the token mapping and the ground. The lab's own
          rules style `body`, which no longer reaches anything now that it is a
          div inside this site. */}
      <div className="lab-shell" lang="en" data-chip-api={CHIP_API} dangerouslySetInnerHTML={{ __html: body }} />

      {/* The canned demo trace. A data island the lab looks up by id, so it is
          rendered as the element it is and never executed. It went through
          next/script once, which handed 23 KB of JSON to the browser as
          JavaScript; lib/lab.ts keeps the two apart now. */}
      {data ? (
        <script
          id={data.id}
          type="application/json"
          dangerouslySetInnerHTML={{ __html: data.json }}
        />
      ) : null}

      {/* afterInteractive rather than an inline tag in the HTML, which runs on
          first load and never again. It does not make a client-side
          navigation into this route work, and the bar above is `hard` because
          of it: the Lab is an ES module, so re-inserting the same src on a
          navigation does not re-execute it, and what arrives is this markup
          with nothing built in it (measured 2026-08-28).

          src rather than inline, for the same reason as the stylesheet above:
          126 KB inlined is 126 KB in the HTML and 126 KB again in the payload,
          re-sent on every visit. As a file it is fetched once and cached. */}
      <Script id="halfwave-lab" src={assets.js} strategy="afterInteractive" />

      {/* What is running, on every page: see explorer/page.tsx. */}
      <SiteFooter lang={lang} floor />
      </div>
    </div>
  );
}
