import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { t } from "@/lib/i18n";
import { isLang, type Lang } from "@/lib/lang";
import Link from "next/link";
import { Shell } from "@/app/components/SiteFrame";
import { Space } from "./Space";
import "./space.css";

/**
 * /hotbits/space: the entropy, drawn.
 *
 * Moved here from bradley.io/trng/space on 2026-08-29. It belongs beside the
 * instrument it plots rather than on a consultancy site, and the instrument
 * answers at hotbits.tinymachines.ai either way.
 *
 * Every byte on this page came out of a physical process and was recorded. The
 * plots read the ARCHIVE, never the fresh pool: see ./client.ts for why that
 * distinction is the whole reason this page can exist at all.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/hotbits/space");
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? raw : "en";

  // Translated on the server and passed down as props: lib/i18n reads the
  // dictionary with fs, so it must never reach a client component.
  const labels = {
    cube: t(lang, "The field"),
    cubeWhy: t(
      lang,
      "Bytes taken three at a time and read as coordinates. A biased source draws structure here: planes, lattices, a clump in one corner. A good one fills the cube with nothing to see, which is the least interesting picture a generator can produce and exactly the one it should.",
    ),
    ret: t(lang, "The return map"),
    retWhy: t(
      lang,
      "Each byte plotted against the one after it. Any rule connecting a value to its successor shows up as a shape. This is the plot that caught RANDU, whose output falls onto fifteen planes and looked fine by every other test of its day.",
    ),
    raster: t(lang, "The raster"),
    rasterWhy: t(
      lang,
      "One pixel per bit, in order. The eye is very good at finding periodicity, and a stream with any is hard to look at without seeing it.",
    ),
    phase: t(lang, "Phase space"),
    phaseWhy: t(
      lang,
      "Not the bits: the measurements. Each point is one window of output placed by its own bias, entropy and serial correlation, so the cloud is the source describing itself over the last day rather than a single snapshot.",
    ),
  };

  return (
    <Shell lang={lang} die="ENT" title={t(lang, "The entropy, drawn")}>
      <div className="prose" lang={lang}>
        <p className="lede">
          {t(
            lang,
            "Four ways of looking at the same radioactive decay. None of them is a summary statistic: they are the bytes themselves, arranged so that a flaw would be visible rather than reported.",
          )}
        </p>
        <p>
          {t(
            lang,
            "These plots read the archive, which is the append-only record of bytes already emitted. They never draw on the fresh pool, because that refills at about 75 bytes a minute and spending it on a picture would starve the consumers it exists for.",
          )}{" "}
          <Link href={`/hotbits`}>{t(lang, "The instrument itself")}</Link>{" "}
          {t(lang, "reports what it is doing right now.")}
        </p>
      </div>

      <Space labels={labels} />
    </Shell>
  );
}
