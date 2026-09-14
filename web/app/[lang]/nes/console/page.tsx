import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { nes } from "@/lib/nes";
import { t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { PROSE } from "../prose";
import { Shelf } from "../Shelf";

/**
 * /nes/console: both chips on one board, then the picture, the sound and
 * the shell. Moved off /nes whole on 2026-09-14; its figures are slots
 * filled from data/nes.json's console record, whose suite is the row at
 * the foot.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/console");
}

export default async function NesConsolePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = nes();

  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("nes", "console").name)}>
      <div className="prose">
        <h2>{S.consoleH}</h2>
        <p>{S.console(r)}</p>

        <h2>{S.pictureH}</h2>
        <p>{S.picture(r)}</p>

        <h2>{S.consoleSoundH}</h2>
        <p>{S.consoleSound(r)}</p>

        <h2>{S.shellH}</h2>
        <p>{S.shell(r)}</p>

        <h2>{S.boardedH}</h2>
        <p>{S.consoleBoardedIntro(r.boarded_on)}</p>
        <div className="boarded" data-boarded-console>
          <span className="measured">{S.mConsoleTests(r.console.tests_green)}</span>
          <span className="measured">{S.mConsoleInstr(r.console.blargg.instr_pass, r.console.blargg.instr_total)}</span>
          <span className="measured">{S.mConsoleRate(r.console.real_time_x[0], r.console.real_time_x[1])}</span>
          <span className="measured">{S.mConsoleCommit(r.console.commit.slice(0, 7), `${r.console.repo}/commit/${r.console.commit}`)}</span>
        </div>

        <Shelf lang={lang} group="console" />
      </div>
    </Shell>
  );
}
