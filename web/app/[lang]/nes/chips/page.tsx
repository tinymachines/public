import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Image from "next/image";
import { nes } from "@/lib/nes";
import { t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { PROSE } from "../prose";
import { Shelf } from "../Shelf";

/**
 * /nes/chips: the contract, the 2A03 and the 2C02 at their switches, and
 * the fast chips built from them. Moved off /nes whole on 2026-09-14; its
 * figures are slots filled from data/nes.json, and the recorded rows at
 * the foot are the two chip repositories' suites.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/chips");
}

export default async function NesChipsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = nes();
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;

  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("nes", "chips").name)}>
      <div className="prose">
        <h2>{S.contractsH}</h2>
        <p>{S.contracts(r.family.nes_bus, r.family.c2c02)}</p>

        <h2>{S.fifthH}</h2>
        <p>{S.fifth(r, r.repo)}</p>

        <h2>{S.soundH}</h2>
        <p>{S.sound(r)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/first-sound.png"
            width={1760}
            height={864}
            alt={S.soundAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.soundCaption(r)}</figcaption>
        </figure>

        <h2>{S.cornersH}</h2>
        <p>{S.corners(r, r.family.c2c02)}</p>

        <h2>{S.enginesH}</h2>
        <p>{S.engines(r)}</p>

        <h2>{S.ladderH}</h2>
        <p>{S.ladder(r)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/ppu-sequencer.png"
            width={2100}
            height={630}
            alt={S.sequencerAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.sequencerCaption}</figcaption>
        </figure>

        <figure className="crt-figure">
          <Image src="/nes/ppu-sprite-world.png" width={768} height={720} alt={S.worldsAlt1} unoptimized />
          <Image src="/nes/ppu-scroll-world.png" width={768} height={720} alt={S.worldsAlt2} unoptimized />
          <figcaption>{S.worldsCaption}</figcaption>
        </figure>

        <h2>{S.pinsH}</h2>
        <p>{S.pins(r)}</p>

        <h2>{S.apuH}</h2>
        <p>{S.apu(r, r.repo)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/apu-codes.png"
            width={1210}
            height={935}
            alt={S.apuAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.apuCaption(r)}</figcaption>
        </figure>

        <h2>{S.boardedH}</h2>
        <p>{S.boardedIntro(r.boarded_on)}</p>
        <div className="boarded" data-boarded>
          <span className="measured">{S.mTests(r.tests_green)}</span>
          <span className="measured">{S.mReds(r.mutate_red)}</span>
          <span className="measured">{S.mHalfphi(r.halfphi)}</span>
          <span className="measured">{S.mCommit(commitShort, commitHref)}</span>
        </div>
        <div className="boarded" data-boarded-ppu>
          <span className="measured">{S.mPpuTests(r.c2c02.tests_green)}</span>
          <span className="measured">{S.mPpuReds(r.c2c02.mutate_red)}</span>
          <span className="measured">{S.mPpuCommit(r.c2c02.commit.slice(0, 7), `${r.c2c02.repo}/commit/${r.c2c02.commit}`)}</span>
        </div>
        <div className="boarded" data-boarded-n3>
          <span className="measured">{S.mApuHalfSteps(r.n3.apu_half_steps, r.n3.apu_worlds)}</span>
          <span className="measured">{S.mStalls(2 * r.n3.dma_frames + r.n3.dmc_frames)}</span>
          <span className="measured">{S.mRealTime(r.n3.real_time_x)}</span>
        </div>

        <Shelf lang={lang} group="chips" />

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
