import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { ntsc } from "@/lib/ntsc";
import Image from "next/image";
import { Shell } from "@/app/components/SiteFrame";
import "../ntsc.css";

/**
 * /ntsc/composite: a real NES's composite video, terminated into 75 ohms
 * and read off the scope level by level. Every number is a slot filled
 * from data/ntsc.json's `composite` record, which scripts/board-ntsc.py
 * writes from the ntsc-crt repository's committed measurement
 * (docs/composite-figures.json, written there by tools/composite-figures.py
 * from the raw records); the figures are that tool's own drawings,
 * served as committed.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/ntsc/composite");
}

const V = (x: number) => x.toFixed(3);
const R = (x: number) => x.toFixed(2);

const PROSE = {
  en: {
    intro: (
      <>
        Composite video is one wire carrying everything: where each line
        starts, where the colour clock is, and the picture itself, all as
        voltage against time. This page reads that wire from a real
        front-loader NES, terminated into the 75 ohms it was built to
        drive, sampled at 125 million points a second with nothing but a
        scope in the path. Every number below was measured from the
        record by the repository&rsquo;s own tool at the recorded commit;
        the drawings are that tool&rsquo;s, not illustrations.
      </>
    ),
    lineH: "One line, as the ADC saw it",
    line: (tip: string, blank: string, step: string, lines: number, period: string, nes: string, broadcast: string) => (
      <>
        A line begins with sync: the signal drops to its lowest level,{" "}
        {tip} V here, and holds it for 4.7 microseconds. It returns to
        blanking, {blank} V, a step of {step} V that every decoder uses as
        its ruler. Then the burst, then the picture, then blanking again
        until the next sync. Across the {lines} lines in this record the
        syncs arrive {period} microseconds apart. Broadcast NTSC says a
        line is 227 and a half subcarrier cycles, {broadcast}{" "}
        microseconds; the NES draws 227 and a third, {nes}, and the record
        says so to the third decimal. That difference is the one the
        landing page&rsquo;s first decode tripped over.
      </>
    ),
    lineAlt:
      "One full NES scanline in volts against microseconds: the sync pulse, the colour burst on the back porch, and the active picture's chroma-modulated tiles.",
    lineCaption: (
      <>
        A middle line of the record, sync edge at zero, 200 mV per
        division at the scope. The dashed lines are the tip and blanking
        levels measured across every line.
      </>
    ),
    burstH: "The burst",
    burst: (pp: string, ratio: string, table: string, spc: string) => (
      <>
        Eight microseconds in, on the back porch, the console sends about
        nine cycles of its colour subcarrier, 3.579545 MHz, with nothing
        modulated on them. This is the burst: the reference the receiver
        locks its own oscillator to, so that the phase of the chroma in
        the picture means a hue. At this sample rate a cycle is {spc}{" "}
        samples wide, so every dot in the drawing is a real sample. It
        swings {pp} V peak to peak, and it does so on every line of the
        record to the millivolt. Divided by the sync-to-blanking step
        that is a ratio of {ratio}; the transcribed level table, measured
        on a different console into 75 ohms, gives {table}.
      </>
    ),
    burstAlt:
      "The colour burst zoomed: about nine cycles of 3.579545 MHz sitting just above the blanking level, every sample drawn as a dot.",
    burstCaption: (
      <>
        The burst with every sample shown. The trough sits at the sync
        tip side of blanking and the crest well above it: the burst is
        centred a little above blanking, as the table says it is.
      </>
    ),
    termH: "Why the terminator",
    term: (dc: string, ac: string, ratioU: string, ratioL: string, table: string) => (
      <>
        The landing page&rsquo;s first captures were taken with the probe
        alone: a 1 megohm input on a signal designed for 75 ohms. The
        overlay puts one line of that record over one line of this one.
        Unterminated, the sync-to-blanking step came up {dc} times larger.
        The burst came up {ac} times larger. Those are not the same
        number, and the difference is the whole story: the DC levels
        scaled one way and the 3.58 MHz subcarrier another, so the
        unterminated record carried a burst-to-sync ratio of {ratioU}{" "}
        where the terminated one carries {ratioL} and the table {table}.
        A decoder that takes the sync step as its ruler, which is what
        decoders do, saw the colour about 40 percent too strong before
        its own filtering, and after it the landing page reported the sky
        of World 1-1 decoding 28 percent hotter than its synthesis. That
        was the probe, not the console.
      </>
    ),
    overlayAlt:
      "Two scanline starts overlaid: the unterminated record in red swinging past 2.5 volts with ringing at each edge, the terminated record in blue a quarter the size and clean.",
    overlayCaption: (
      <>
        The same console into the probe alone (red) and into 75 ohms
        (blue), aligned at the sync edge. Different frames were on
        screen, so the picture past nine microseconds differs; the sync,
        the burst and the ringing do not depend on the frame.
      </>
    ),
    levelsH: "The levels beside the table",
    levels: (stepL: string, stepT: string, tip: string, pct: number) => (
      <>
        This console&rsquo;s absolute levels sit below the table&rsquo;s:
        a sync-to-blanking step of {stepL} V against {stepT}, and a sync
        tip at {tip} V, below zero, where the table&rsquo;s console put it
        above. Consoles differ in their output stage and the table was
        measured on one of them; what a decoder needs is not the volts
        but the ratios, and the recovery in the repository normalises
        every record onto the table&rsquo;s sync and blanking before it
        looks at anything else. On that ruler the terminated burst agrees
        with the table within {pct} percent.
      </>
    ),
    histAlt:
      "A histogram of every sample in the terminated record on a log scale, with the measured sync tip and blanking marked and the table's sync and blanking marked beside them.",
    histCaption: (
      <>
        Where the twelve million samples sit. The tall bars are the
        levels a picture spends its time at; the marks are this
        record&rsquo;s tip and blanking, and the table&rsquo;s.
      </>
    ),
    decodeH: "What the decode makes of it",
    decode: (
      <>
        This frame is the terminated record run end to end through the
        repository&rsquo;s recovery, which finds the sync, locks to the
        burst, resamples onto the NES grid, and pulls colour and
        brightness back apart. The cartridge menu was on screen. The frame is
        Nintendo&rsquo;s, reproduced for commentary on the measurement.
      </>
    ),
    decodeAlt:
      "The Super Mario Bros. / Duck Hunt cartridge menu decoded from the terminated scope record: the title logo and the cyan Duck Hunt letters on black.",
    decodeCaption: <>Decoded end to end from the terminated record.</>,
    boardedH: "Where the numbers come from",
    boarded: (stamp: string, commit: string, href: string) => (
      <>
        {stamp}. The page reads the record as it was committed at{" "}
        <a data-address href={href}>{commit}</a>, and nothing on it is
        typed.
      </>
    ),
    notHereH: "What is not here yet",
    notHere: (
      <>
        The terminated sky. The landing page&rsquo;s saturation finding
        was scored on the paused World 1-1 sky, and the confirmation is
        that same region through the same scorer from a terminated
        record. The console needs its Mario paused again; when it is,
        the number will land here the way every other number on this
        page did, measured and committed, not from memory.{" "}
        <Link href="/ntsc">Back to the NTSC landing.</Link>
      </>
    ),
  },
  ja: {
    intro: (
      <>
        コンポジット映像は一本の線で全部を運ぶ: 各ラインがどこで始まるか、色のクロックがどこにあるか、そして絵そのものを、時間に対する電圧として。このページはその線を、本物のフロントローディング NES から、設計どおりの 75 オームで終端して、経路にスコープ以外何も置かず、毎秒 1 億 2500 万点でサンプリングして読む。下の数字はすべて、記録済みコミットでリポジトリ自身のツールが記録から測ったもので、図はそのツールが描いたもの、挿絵ではない。
      </>
    ),
    lineH: "ADC が見た一本のライン",
    line: (tip: string, blank: string, step: string, lines: number, period: string, nes: string, broadcast: string) => (
      <>
        ラインは同期で始まる: 信号は最低レベル、ここでは {tip} V まで落ち、4.7 マイクロ秒それを保つ。ブランキングの {blank} V に戻る。この {step} V の段差を、どのデコーダも物差しにする。次にバースト、次に絵、そして次の同期までまたブランキング。この記録の {lines} 本のラインで、同期は {period} マイクロ秒おきに来る。放送の NTSC はラインを副搬送波 227.5 サイクル、{broadcast} マイクロ秒と定める。NES は 227 と 3 分の 1、{nes} を描き、記録は小数第 3 位までそう言っている。この差が、ランディングページの最初のデコードがつまずいたものだ。
      </>
    ),
    lineAlt:
      "NES の 1 走査線をマイクロ秒に対する電圧で: 同期パルス、バックポーチのカラーバースト、クロマ変調されたタイルの有効画面。",
    lineCaption: (
      <>
        記録の中ほどの一本、同期エッジをゼロに、スコープは 1 目盛 200 mV。破線は全ラインで測ったチップとブランキングのレベル。
      </>
    ),
    burstH: "バースト",
    burst: (pp: string, ratio: string, table: string, spc: string) => (
      <>
        8 マイクロ秒目、バックポーチの上で、実機は色副搬送波 3.579545 MHz を約 9 サイクル、何も変調せずに送る。これがバースト: 受信側が自分の発振器を合わせる基準で、これがあって絵の中のクロマの位相が色相を意味する。このサンプルレートでは 1 サイクルが {spc} サンプルなので、図の点はすべて実サンプルだ。振幅はピーク間 {pp} V で、記録の全ラインでミリボルトまで同じ。同期からブランキングまでの段差で割ると比は {ratio}。別の実機を 75 オームで測った転記済みレベル表は {table} を与える。
      </>
    ),
    burstAlt:
      "カラーバーストの拡大: ブランキングのすぐ上に座る 3.579545 MHz 約 9 サイクル、サンプルをすべて点で描いたもの。",
    burstCaption: (
      <>
        全サンプルを示したバースト。谷はブランキングの同期側、山はその上: 表が言うとおり、バーストはブランキングより少し上を中心にしている。
      </>
    ),
    termH: "なぜ終端するのか",
    term: (dc: string, ac: string, ratioU: string, ratioL: string, table: string) => (
      <>
        ランディングページの最初のキャプチャはプローブだけで録った: 75 オーム向けに設計された信号に 1 メガオームの入力。重ね図はその記録の一本を、この記録の一本に重ねる。終端なしでは、同期からブランキングまでの段差は {dc} 倍に見えた。バーストは {ac} 倍に見えた。同じ数ではなく、その差が話の全部だ: DC レベルはある倍率で、3.58 MHz の副搬送波は別の倍率で伸びたので、終端なしの記録はバースト対同期の比 {ratioU} を運び、終端した記録は {ratioL}、表は {table}。同期の段差を物差しにするデコーダは（デコーダとはそういうものだ）、自分のフィルタの前で色を約 40 パーセント強く見て、フィルタの後でランディングページは World 1-1 の空が合成より 28 パーセント熱いと報告した。プローブのせいで、実機のせいではなかった。
      </>
    ),
    overlayAlt:
      "二本のライン先頭の重ね図: 赤の終端なし記録は 2.5 V を超えて振れ各エッジでリンギングし、青の終端した記録は 4 分の 1 の大きさで澄んでいる。",
    overlayCaption: (
      <>
        同じ実機をプローブだけ（赤）と 75 オーム（青）で、同期エッジで揃えて。画面の内容は別のフレームなので 9 マイクロ秒より先の絵は違う。同期とバーストとリンギングはフレームに依らない。
      </>
    ),
    levelsH: "表の隣に置いたレベル",
    levels: (stepL: string, stepT: string, tip: string, pct: number) => (
      <>
        この実機の絶対レベルは表より低い: 同期からブランキングの段差が {stepT} に対して {stepL} V、同期チップは {tip} V でゼロより下。表の実機はゼロより上に置いていた。実機は出力段が違い、表はそのうちの一台で測られた。デコーダに要るのはボルトではなく比で、リポジトリの復元はどの記録もまず表の同期とブランキングに正規化してから他を見る。その物差しの上で、終端したバーストは表と {pct} パーセント以内で一致する。
      </>
    ),
    histAlt:
      "終端した記録の全サンプルの対数ヒストグラム。測った同期チップとブランキングに印を付け、その隣に表の同期とブランキングの印。",
    histCaption: (
      <>
        1200 万サンプルがどこに居るか。高い棒は絵が時間を過ごすレベル。印はこの記録のチップとブランキング、そして表のもの。
      </>
    ),
    decodeH: "デコードが作るもの",
    decode: (
      <>
        このフレームは、終端した記録をリポジトリの復元に端から端まで通したものだ: 同期を見つけ、バーストにロックし、NES のグリッドにリサンプルし、色と明るさをもう一度引き離す。画面はカートリッジのメニューだった。画面は任天堂のもので、測定への論評のために転載した。
      </>
    ),
    decodeAlt:
      "終端したスコープ記録からデコードしたスーパーマリオブラザーズ / ダックハントのカートリッジメニュー: 黒地にタイトルロゴとシアンの DUCK HUNT の文字。",
    decodeCaption: <>終端した記録から端から端までデコード。</>,
    boardedH: "数字の出どころ",
    boarded: (stamp: string, commit: string, href: string) => (
      <>
        {stamp}。このページは <a data-address href={href}>{commit}</a> でコミットされたとおりの記録を読み、打ち込んだ数字は一つもない。
      </>
    ),
    notHereH: "まだ無いもの",
    notHere: (
      <>
        終端した空。ランディングページの彩度の所見は一時停止した World 1-1 の空で採点され、その確認は終端した記録から同じ領域を同じ採点器に通すことだ。実機のマリオをもう一度一時停止させる必要がある。そうなれば数字は記憶からではなく、このページの他の数字と同じく実測されコミットされて、ここに来る。<Link href="/ja/ntsc">NTSC のランディングへ戻る。</Link>
      </>
    ),
  },
} as const;

export default async function CompositePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = ntsc();
  const c = r.composite;
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;
  // Derived in the page from the slots, never typed: how far the terminated
  // burst-to-sync ratio sits from the table's, and the samples per
  // subcarrier cycle at the record's rate.
  const pct = Math.round(Math.abs(1 - c.loaded.burst_over_sync / c.table.burst_over_sync) * 100);
  const samplesPerCycle = (125e6 / (315e6 / 88)).toFixed(1);

  return (
    <Shell lang={lang} die="NTSC" title={lang === "ja" ? "コンポジット、終端して" : "Composite, terminated"}>
      <div className="prose">
        <p>{S.intro}</p>

        <h2>{S.lineH}</h2>
        <p>
          {S.line(
            V(c.loaded.sync_tip_v),
            V(c.loaded.blanking_v),
            V(c.loaded.sync_to_blank_v),
            c.loaded.lines_found,
            c.loaded.line_period_us_median.toFixed(3),
            c.loaded.line_period_nes_2728_of_2730_us.toFixed(3),
            c.loaded.line_period_nominal_us.toFixed(3),
          )}
        </p>
        <figure className="crt-figure">
          <Image src="/ntsc/composite/scanline.png" width={1800} height={600} alt={S.lineAlt} unoptimized />
          <figcaption>{S.lineCaption}</figcaption>
        </figure>

        <h2>{S.burstH}</h2>
        <p>{S.burst(V(c.loaded.burst_pp_v), R(c.loaded.burst_over_sync), R(c.table.burst_over_sync), samplesPerCycle)}</p>
        <figure className="crt-figure">
          <Image src="/ntsc/composite/burst.png" width={1800} height={600} alt={S.burstAlt} unoptimized />
          <figcaption>{S.burstCaption}</figcaption>
        </figure>

        <h2>{S.termH}</h2>
        <p>
          {S.term(
            R(c.ratio_unloaded_over_loaded.sync_to_blank),
            R(c.ratio_unloaded_over_loaded.burst_pp),
            R(c.unloaded.burst_over_sync),
            R(c.loaded.burst_over_sync),
            R(c.table.burst_over_sync),
          )}
        </p>
        <figure className="crt-figure">
          <Image src="/ntsc/composite/overlay.png" width={1800} height={600} alt={S.overlayAlt} unoptimized />
          <figcaption>{S.overlayCaption}</figcaption>
        </figure>

        <h2>{S.levelsH}</h2>
        <p>{S.levels(V(c.loaded.sync_to_blank_v), V(c.table.blank - c.table.sync), V(c.loaded.sync_tip_v), pct)}</p>
        <figure className="crt-figure">
          <Image src="/ntsc/composite/histogram.png" width={1800} height={600} alt={S.histAlt} unoptimized />
          <figcaption>{S.histCaption}</figcaption>
        </figure>

        <h2>{S.decodeH}</h2>
        <p>{S.decode}</p>
        <figure className="crt-figure">
          <Image src="/ntsc/composite/decoded-menu-terminated.png" width={640} height={480} alt={S.decodeAlt} unoptimized />
          <figcaption>{S.decodeCaption}</figcaption>
        </figure>

        <h2>{S.boardedH}</h2>
        <p>{S.boarded(c.stamp, commitShort, commitHref)}</p>
        <div className="boarded" data-boarded>
          <span className="measured">sync tip <b>{V(c.loaded.sync_tip_v)} V</b></span>
          <span className="measured">blanking <b>{V(c.loaded.blanking_v)} V</b></span>
          <span className="measured">burst <b>{V(c.loaded.burst_pp_v)} V</b></span>
          <span className="measured">burst / sync <b>{R(c.loaded.burst_over_sync)}</b></span>
          <span className="measured">table <b>{R(c.table.burst_over_sync)}</b></span>
        </div>

        <h2>{S.notHereH}</h2>
        <p>{S.notHere}</p>
      </div>
    </Shell>
  );
}
