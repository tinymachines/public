import fs from "node:fs";
import path from "node:path";
import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Image from "next/image";
import { pageMeta } from "@/lib/seo";
import { t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { filledShelves } from "@/lib/nes-shelves";
import { readArtefacts } from "@/lib/artefacts";
import { Shell } from "@/app/components/SiteFrame";
import { ShelfSection } from "../../nes/Shelf";

/**
 * /hotbits/bench: the bench the pool comes from, laid out like /nes/bench
 * (the 6502 session's plan, geiger docs/HOTBITS-BENCH-PAGES-PLAN.md, taken
 * on the owner's word 2026-10-09). The drawings are copied from geiger by
 * web/scripts/pull-nesdocs.mjs into public/hotbits/bench/, the package's
 * sheet from the build its record verified, and the page draws only the
 * ones that are there, so a build without ../geiger shows none rather than
 * broken pictures. The shelves are read from docs/hotbits/shelves.json,
 * which the same pull writes; a shelf with nothing on it is not drawn.
 *
 * The page names the package's revision from the pull's record rather
 * than typing it: revision D shipped 2026-10-09 with a caption saying what
 * it got wrong (the optocoupler's tap), and revision E of 2026-10-12 draws
 * the tap as built. Two things on E's sheets are marked not confirmed, and
 * the note says so.
 */

const FIGURES = [
  { file: "trng-system.svg", w: 1560, h: 740, key: "system" },
  { file: "03-schematic.svg", w: 1632, h: 1056, key: "case" },
  { file: "trng-emitter.svg", w: 1560, h: 750, key: "emitter" },
  { file: "signal-chain.svg", w: 760, h: 280, key: "chain" },
] as const;

const TEXT = {
  en: {
    intro:
      "The pool is what hotbits serves; this is the bench it comes from. A Geiger tube counts in a steel case on its own supply, an optocoupler carries each count across as light, and an ESP32-C6 outside the case times every edge in hardware before the server turns the gaps between them into bits. The bring-up was done the way the NES bench was: a scope driven from a script, the board flashed from the bench, and every step written down.",
    revision: (rev: string) =>
      `These are revision ${rev} of the drawings. Two things on them are marked not confirmed: that the counter's supply and the emitter's stay separate, which is what the isolation rests on, and the box's cable entry.`,
    alt: {
      system: "The Geiger TRNG as three places: the case with the counter and its tube, the emitter outside it, and the server, with what crosses between them.",
      case: "Sheet 3 of the drawing package: the counter board's connector pin by pin, on its own 5 V supply, and the optocoupler's LED between the connector's 5 V pin and the detector transistor's collector.",
      emitter: "The emitter: one capture pin, GPIO18, on an ESP32-C6 board, with the lead from the case and its pull-up.",
      chain: "The signal chain from the tube to the capture pin, with the three places a probe goes.",
    },
    caption: {
      system: "Three places and what crosses between them: only light crosses the case's isolation barrier, only a TCP stream leaves the emitter, and only the web server is public.",
      case: "The case, drawn pin by pin: the counter board on a 5 V adapter of its own, nothing shared with the emitter, and the optocoupler's LED tapped at the detector transistor's collector, where a count can light it.",
      emitter: "The emitter, outside the case on its own USB power: one pin latches the counter on each falling edge.",
      chain: "Where to put the probe, one hop at a time from the source toward the pin.",
    },
    pdf: "The whole package, every sheet framed and numbered:",
  },
  ja: {
    intro:
      "hotbits が配るのはプールで、これはそのプールが生まれるベンチだ。ガイガー管は専用の電源を持つ鋼のケースの中で数え、フォトカプラが一つひとつのカウントを光として向こうへ渡し、ケースの外の ESP32-C6 があらゆるエッジの時刻をハードウェアで記録する。そのあとでサーバーが、エッジのあいだの隔たりをビットに変える。立ち上げは NES のベンチと同じやり方で進めた: スクリプトで動かすオシロスコープ、ベンチから書き込むボード、そして一歩ごとの記録。",
    revision: (rev: string) =>
      `これらは図面の版 ${rev} だ。二つのことが未確認と記されている: カウンタの電源とエミッタの電源が別々のままであること (絶縁はそれにかかっている)、そして箱のケーブルの引き込み口だ。`,
    alt: {
      system: "三つの場所としてのガイガー TRNG: カウンタと管の入ったケース、その外のエミッタ、そしてサーバー。そのあいだを何が渡るか。",
      case: "図面一式の 3 枚目: カウンタ基板のコネクタをピンごとに、専用の 5 V 電源で、フォトカプラの LED はコネクタの 5 V ピンと検出トランジスタのコレクタのあいだに。",
      emitter: "エミッタ: ESP32-C6 ボードの捕捉ピン GPIO18 ひとつ、ケースからのリード線とそのプルアップ。",
      chain: "管から捕捉ピンまでの信号の連なりと、プローブを当てる三つの場所。",
    },
    caption: {
      system: "三つの場所と、そのあいだを渡るもの: ケースの絶縁の壁を越えるのは光だけ、エミッタを出るのは TCP の流れだけ、公開されているのはウェブサーバーだけ。",
      case: "ピンごとに描いたケース: カウンタ基板は専用の 5 V アダプタで動き、エミッタと何も共有しない。フォトカプラの LED は検出トランジスタのコレクタから取り、カウントが LED を灯せる。",
      emitter: "ケースの外で専用の USB 電源から動くエミッタ: ピンひとつが、立ち下がりエッジごとにカウンタを捕まえる。",
      chain: "プローブをどこに当てるか。源からピンへ向けて、一段ずつ。",
    },
    pdf: "図面一式、すべての図に枠と番号つき:",
  },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/hotbits/bench");
}

export default async function HotbitsBenchPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = TEXT[lang];
  const dir = path.join(process.cwd(), "public", "hotbits", "bench");
  const figures = FIGURES.filter((f) => fs.existsSync(path.join(dir, f.file)));
  const pkg = readArtefacts()?.artefacts.trng ?? null;
  // The package's revision, from the file the record names (geiger-TM-TRNG-001-revE.pdf); none when the record has no package.
  const rev = pkg?.href.match(/-rev([A-Z])\.pdf$/)?.[1] ?? null;

  return (
    <Shell lang={lang} die="ENT" title={t(lang, surface("hotbits", "bench").name)}>
      <div className="prose">
        <p>{S.intro}</p>
        {figures.length && rev ? <p data-bench-revision={rev}>{S.revision(rev)}</p> : null}
        {figures.map((f) => (
          <figure key={f.file} data-bench-figure={f.key}>
            <Image src={`/hotbits/bench/${f.file}`} width={f.w} height={f.h} alt={S.alt[f.key]} unoptimized />
            <figcaption>{S.caption[f.key]}</figcaption>
          </figure>
        ))}
        {pkg ? (
          <p data-bench-package>
            {S.pdf} <a href={pkg.href}>{pkg.label[lang]}</a>
          </p>
        ) : null}

        {filledShelves("hotbits").map((g) => (
          <ShelfSection key={g.key} lang={lang} g={g} />
        ))}
      </div>
    </Shell>
  );
}
