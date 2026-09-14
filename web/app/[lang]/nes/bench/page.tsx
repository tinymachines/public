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
 * /nes/bench: the real console and the model under the same controller
 * presses. Moved off /nes whole on 2026-09-14, with the four bench shelves
 * of the notebook under it. The page shares its path with the bench's
 * served files (/nes/bench/*.pdf, *.svg), which are files, not routes, so
 * the two do not collide; e2e/nes-parts.spec.ts fetches both.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/bench");
}

export default async function NesBenchPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = nes();

  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("nes", "bench").name)}>
      <div className="prose">
        <p>{S.bench(r)}</p>
        <figure className="crt-figure">
          <Image src="/nes/bench.svg" width={1200} height={1000} alt={S.benchAlt} unoptimized />
          <figcaption>{S.benchCaption}</figcaption>
        </figure>
        <figure className="crt-figure">
          <Image src="/nes/bench/bench-v1b-1.svg" width={1154} height={591} alt={S.sheetAlt} unoptimized />
          <figcaption>{S.sheetCaption}</figcaption>
        </figure>
        <figure className="crt-figure">
          <Image src="/nes/bench/bench-v1b-2.svg" width={1129} height={699} alt={S.sheetAlt2} unoptimized />
          <figcaption>{S.sheetCaption2}</figcaption>
        </figure>
        <figure className="crt-figure">
          <Image src="/nes/bench/logical-timing.svg" width={1500} height={900} alt={S.timingAlt} unoptimized />
          <figcaption>{S.timingCaption}</figcaption>
        </figure>
        <p>{S.labNote}</p>

        <Shelf lang={lang} group="bench-plan" />
        <Shelf lang={lang} group="bench-build" />
        <Shelf lang={lang} group="bench-record" />
        <Shelf lang={lang} group="bench-experiments" />
      </div>
    </Shell>
  );
}
