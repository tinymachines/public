import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { nes } from "@/lib/nes";
import { Shell } from "@/app/components/SiteFrame";
import { Playground } from "./Playground";
import { marioFrame } from "./mario";
import { slowChip } from "./slow";
import { marioTaps, xray } from "./xray";
import "./playground.css";

/**
 * /nes/playground: a hidden bench for trying ways to make the console arc
 * readable by anyone, without touching the engineers' pages. Not in the
 * sitemap, the menus, projects.json or pages.ts, and `noindex`, like
 * /6502/consolev2: an experiment until the owner says otherwise.
 *
 * The rule it tries out: keep every grain of the engineers' detail, but
 * lead with something to look at and a plain sentence, and put the record
 * one click away. Everything drawn is either the console's model running
 * in this page (the same two boarded bundles /nes/play runs, asked
 * different questions by public/nes/playground.worker.mjs) or a cell of
 * an engineers' document read at build time (mario.ts). The figures in
 * the machine map are slots from data/nes.json.
 */

const TITLE = "The NES at human speed";
const DESCRIPTION = "A playground: the NES console's model slowed down until a person can watch it draw a frame, send it down the wire, and read a pad.";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/playground", { title: TITLE, description: DESCRIPTION, noindex: true });
}

/** Where each part of the machine is written up, by the engineers. */
const PARTS = [
  {
    key: "cpu",
    name: "The 2A03",
    role: "the brain, and the sound",
    words: (t: string) =>
      `A 6502 processor, the same family as the Apple II's, with the sound hardware on the same piece of silicon. The engineers simulated all ${t} of its working transistors, switch by switch, and then built a fast copy that has to agree with the slow one.`,
    record: [
      { href: "/docs/nes/a0-report", label: "The 2A03 at its switches" },
      { href: "/docs/nes/n3-report", label: "The fast 2A03, built and checked" },
      { href: "/docs/nes/a3-report", label: "First sound from the 2A03" },
    ],
  },
  {
    key: "ppu",
    name: "The 2C02",
    role: "the picture chip",
    words: () =>
      "It walks the beam across the screen dot by dot, fetching the background and the sprites just in time for each one. The processor never draws anything: it only leaves notes for this chip.",
    record: [
      { href: "/docs/nes/p0-report", label: "The 2C02 at its switches" },
      { href: "/docs/nes/p2-report", label: "The 2C02's hard corners" },
      { href: "/docs/nes/p3-report", label: "The fast 2C02, dot for dot with the chip" },
    ],
  },
  {
    key: "cart",
    name: "The cartridge",
    role: "the game, and its pictures",
    words: () =>
      "Two memory chips on a board: one holds the program the processor runs, the other the little tiles the picture chip draws with. Bigger games add a chip that swaps banks of memory in and out.",
    record: [
      { href: "/docs/nes/cartridge", label: "A real cartridge in the model" },
      { href: "/docs/nes/n0-report", label: "The contract the chips share, the cartridge edge included" },
    ],
  },
  {
    key: "glue",
    name: "The board",
    role: "the glue between them",
    words: () =>
      "A crystal that keeps time for everyone, a little working memory, and a handful of simple chips that decide who is talking on the shared wires at any moment.",
    record: [
      { href: "/docs/nes/n4-report", label: "The mainboard's glue" },
      { href: "/docs/nes/n5-report", label: "Both chips on one clock" },
    ],
  },
  {
    key: "tv",
    name: "The television",
    role: "where it all ends up",
    words: () =>
      "An analogue signal on one wire, and a tube that paints it back into light. The engineers modelled that too, because the picture you remember was made as much by the television as by the console.",
    record: [
      { href: "/docs/nes/ntsc-spec", label: "The signal path's specification" },
      { href: "/docs/nes/m3-report", label: "The television's picture stages" },
      { href: "/docs/nes/eyes-vs-scope", label: "Eyes versus scope: the real console against the model" },
    ],
  },
] as const;

/** What the playground could grow next: proposals, for the owner to pick from. */
const NEXT = [
  { name: "The bug museum", about: "Each wrong turn the engineers kept: the title that read GWME, the sprites that never left, the Mario who ran the wrong way. What it looked like, why it happened, how it was caught." },
  { name: "Real or model", about: "A slider across the real console's picture and the model's, from the bench's captures, with the colour differences the engineers are still chasing marked on it." },
  { name: "The sound, voice by voice", about: "Each of the 2A03's sound channels as its own trace you can mute, with the note on the chip's pin and on the speaker." },
  { name: "The encyclopedia as pictures", about: "Each code pattern (the poll, the jump engine, the status bar split) as a small animated diagram, with the engineers' entry one click behind it." },
  { name: "How it was built", about: "The whole arc as a timeline: every plan and report, which part of the machine it is about, and what it proved, for a reader who wants the story before the detail." },
] as const;

export default async function Page({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const r = nes();
  const periodMs = Number(r.c2c02.p3.frame_period_ms);
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    throw new Error(`data/nes.json's frame period reads ${JSON.stringify(r.c2c02.p3.frame_period_ms)}`);
  }
  return (
    <Shell lang={lang} die="NES" title={TITLE} titleIsHeading={false} pageHead={false}>
      <div className="pg" data-lang={lang}>
        {lang === "ja" ? <p className="pg-note">この実験ページは、まだ英語だけです。</p> : null}

        <Playground mario={marioFrame()} framePeriodMs={periodMs} slowChip={slowChip()} xray={xray()} taps={marioTaps()} />

        <section className="pg-station pg-machine" id="machine" aria-labelledby="machine-h">
          <div className="pg-words">
            <p className="pg-eyebrow">The machine</p>
            <h2 id="machine-h">A handful of parts, one clock</h2>
            <p>
              Everything above is these parts talking. The processor runs the game and leaves notes for the picture chip;
              the picture chip reads the cartridge&rsquo;s tiles and walks the beam; the television turns the wire back
              into light. Each part below links to where the engineers took it apart.
            </p>
          </div>
          <figure className="pg-instrument pg-diagram">
            <svg viewBox="0 0 760 300" role="img" aria-label="The NES as a diagram: the crystal clocks both chips; the processor reads the pad and the cartridge's program and leaves notes for the picture chip; the picture chip reads the cartridge's tiles; the picture and the sound go to the television.">
              <defs>
                <marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                </marker>
              </defs>
              <g className="pg-dg-box">
                <rect x="20" y="20" width="110" height="60" />
                <rect x="20" y="120" width="110" height="60" />
                <rect x="200" y="40" width="150" height="80" />
                <rect x="200" y="190" width="150" height="80" />
                <rect x="420" y="115" width="130" height="70" />
                <rect x="610" y="115" width="130" height="70" />
              </g>
              <g className="pg-dg-name">
                <text x="75" y="47">Pad</text>
                <text x="75" y="147">Crystal</text>
                <text x="275" y="72">2A03</text>
                <text x="275" y="222">2C02</text>
                <text x="485" y="146">Cartridge</text>
                <text x="675" y="146">Television</text>
              </g>
              <g className="pg-dg-role">
                <text x="75" y="65">eight buttons</text>
                <text x="75" y="165">keeps time</text>
                <text x="275" y="92">the brain and the sound</text>
                <text x="275" y="242">the picture chip</text>
                <text x="485" y="164">program and tiles</text>
                <text x="675" y="164">light, from one wire</text>
              </g>
              <g className="pg-dg-wire" markerEnd="url(#pg-arrow)">
                <path d="M130,50 L198,62" />
                <path d="M130,140 C165,140 165,100 198,95" />
                <path d="M130,160 C165,160 165,210 198,215" />
                <path d="M275,120 L275,188" />
                <path d="M420,135 C390,135 385,100 352,98" />
                <path d="M420,165 C390,165 385,212 352,214" />
                <path d="M350,55 C500,20 580,60 608,128" />
                <path d="M350,255 C500,285 580,240 608,172" />
              </g>
              <g className="pg-dg-label">
                <text x="140" y="44">buttons</text>
                <text x="140" y="112">ticks</text>
                <text x="140" y="196">ticks</text>
                <text x="282" y="158">notes</text>
                <text x="366" y="124">program</text>
                <text x="372" y="192">tiles</text>
                <text x="480" y="40">sound</text>
                <text x="480" y="284">picture</text>
              </g>
            </svg>
            <figcaption className="pg-note">
              The processor and the picture chip never share a clock tick by accident: both count off the same crystal, and
              the engineers checked every way the two can line up at power on.
            </figcaption>
          </figure>
          <div className="pg-parts">
            {PARTS.map((p) => (
              <article key={p.key} className="pg-part">
                <p className="pg-eyebrow">{p.role}</p>
                <h3>{p.name}</h3>
                <p>{p.words(r.a0.transistors)}</p>
                <ul>
                  {p.record.map((l) => (
                    <li key={l.href}>
                      <a href={l.href}>{l.label}</a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="pg-station pg-next" id="next" aria-labelledby="next-h">
          <div className="pg-words">
            <p className="pg-eyebrow">On the bench next</p>
            <h2 id="next-h">Ideas this playground could grow</h2>
            <p>Proposals, not promises. Each would draw on something the engineers have already measured or built.</p>
          </div>
          <ul className="pg-ideas">
            {NEXT.map((n) => (
              <li key={n.name}>
                <h3>{n.name}</h3>
                <p>{n.about}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
