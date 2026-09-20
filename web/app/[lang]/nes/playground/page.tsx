import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { nes } from "@/lib/nes";
import { Shell } from "@/app/components/SiteFrame";
import { Playground } from "./Playground";
import { marioFrame } from "./mario";
import { slowChip } from "./slow";
import { marioTaps, xray } from "./xray";
import { exhibits } from "./exhibits";
import { encyclopedia } from "./encyclopedia";
import { timeline } from "./timeline";
import { bench } from "./bench";
import { chipApi } from "@/lib/projects";
import { ProgramChip } from "./ProgramChip";
import { words, type StationKey } from "./words";
import { Bench } from "./Bench";
import { Timeline } from "./Timeline";
import { Encyclopedia } from "./Encyclopedia";
import { Museum } from "./Museum";
import { realModel } from "./realmodel";
import { RealOrModel } from "./RealOrModel";
import { Station } from "./Playground";
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

const CHIP_API = chipApi();

const TITLE = "The NES at human speed";
const DESCRIPTION = "A playground: the NES console's model slowed down until a person can watch it draw a frame, send it down the wire, and read a pad.";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/playground", { title: TITLE, description: DESCRIPTION, noindex: true });
}

/** The machine's parts: the key the prose is keyed by, and where each one is written up. */
const PARTS = [{ key: "cpu" }, { key: "ppu" }, { key: "cart" }, { key: "glue" }, { key: "tv" }] as const;


export default async function Page({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const r = nes();
  const periodMs = Number(r.c2c02.p3.frame_period_ms);
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    throw new Error(`data/nes.json's frame period reads ${JSON.stringify(r.c2c02.p3.frame_period_ms)}`);
  }
  const W = words(lang);
  const say = (key: StationKey) => ({ eyebrow: W.stations[key].eyebrow, title: W.stations[key].title, words: W.stations[key].body, record: W.stations[key].record });
  return (
    <Shell lang={lang} die="NES" title={TITLE} titleIsHeading={false} pageHead={false}>
      <div className="pg" data-lang={lang}>
        {lang === "ja" ? <p className="pg-note">この実験ページは、まだ英語だけです。</p> : null}

        <Playground lang={lang} mario={marioFrame()} framePeriodMs={periodMs} slowChip={slowChip()} xray={xray()} taps={marioTaps()} />

        <Station
          id="patterns"
          {...say("patterns")}
        >
          <Encyclopedia data={encyclopedia()} />
        </Station>

        <Station
          id="real"
          {...say("real")}
        >
          <RealOrModel data={realModel()} />
        </Station>

        <Station
          id="museum"
          {...say("museum")}
        >
          <Museum exhibits={exhibits()} />
        </Station>

        <Station
          id="program"
          {...say("program")}
        >
          <ProgramChip api={CHIP_API} />
        </Station>

        <Station
          id="bench"
          {...say("bench")}
        >
          <Bench data={bench()} />
        </Station>

        <Station
          id="arc"
          {...say("arc")}
        >
          <Timeline data={timeline()} />
        </Station>

        <section className="pg-station pg-machine" id="machine" aria-labelledby="machine-h">
          <div className="pg-words">
            <p className="pg-eyebrow">{W.machine.eyebrow}</p>
            <h2 id="machine-h">{W.machine.title}</h2>
            <p>{W.machine.intro}</p>
          </div>
          <figure className="pg-instrument pg-diagram">
            <svg viewBox="0 0 760 300" role="img" aria-label={W.machine.diagram}>
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
            <figcaption className="pg-note">{W.machine.caption}</figcaption>
          </figure>
          <div className="pg-parts">
            {PARTS.map((p) => (
              <article key={p.key} className="pg-part">
                <p className="pg-eyebrow">{W.machine.parts[p.key].role}</p>
                <h3>{W.machine.parts[p.key].name}</h3>
                <p>{W.machine.parts[p.key].words(r.a0.transistors)}</p>
                <ul>
                  {W.machine.parts[p.key].links.map((l) => (
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
            <p className="pg-eyebrow">{W.machine.nextEyebrow}</p>
            <h2 id="next-h">{W.machine.nextTitle}</h2>
            <p>{W.machine.nextIntro}</p>
          </div>
          <ul className="pg-ideas">
            {W.machine.next.map((n) => (
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
