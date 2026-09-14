import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { project } from "@/lib/projects";
import { nes } from "@/lib/nes";
import { Shell } from "@/app/components/SiteFrame";
import { PROSE } from "./prose";
import { Shelf } from "./Shelf";

/**
 * /nes: the NES section's front door.
 *
 * What the console is, a door to each of its parts, where it stands and
 * whose it is. The measurements live on the part pages (/nes/chips,
 * /nes/console, /nes/bench, /nes/cart), which each read the boarded
 * record; this page was all of them at once until 2026-09-14, and at five
 * thousand words its doors were buried under its reports.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes");
}

export default async function NesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("nes");
  const r = nes();

  return (
    <Shell lang={lang} die="NES" title={t(lang, p.name)}>
      <div className="prose">
        <p>{t(lang, p.what)}</p>

        <p>{S.kinship}</p>

        <h2>{S.partsH}</h2>
        <ul className="nes-parts" data-parts>
          {S.parts.map((d) => (
            <li key={d.href}>
              <Link href={d.href}>{d.name}</Link>: {d.what}
            </li>
          ))}
        </ul>

        <h2>{S.aheadH}</h2>
        <p>{S.ahead(r.family.sketch)}</p>

        <Shelf lang={lang} group="start" />

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
