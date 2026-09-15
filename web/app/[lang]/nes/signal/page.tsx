import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { Shelf } from "../Shelf";
import { ntsc } from "@/lib/ntsc";
import Image from "next/image";
import { Shell } from "@/app/components/SiteFrame";
import "./ntsc.css";

/**
 * /nes/signal: the composite signal between the console and the
 * television, the ntsc-crt repository's work. It was a project of its own
 * at /ntsc until 2026-09-14, when it joined the NES section it serves; the
 * old addresses redirect here (next.config.ts).
 *
 * A measurement-report page in the house voice. Its story is the ntsc-crt
 * repository's own milestone reports; its figures are slots filled from
 * data/ntsc.json, which only scripts/board-ntsc.py writes, and it writes
 * only what it measured by running that repository's scanner, suite and
 * MUTATE run at a pinned commit. No number on this page is typed.
 *
 * Structure, not identity: the page wears the NES section's silo
 * (style/projects/nes.css), like every page under /nes.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/signal");
}

const REPORTS = "https://github.com/tinymachines/ntsc-crt/blob/main/docs";

const PROSE = {
  en: {
    kinship: (
      <>
        <Link href="/6502">The 6502 work</Link> simulates a chip at its
        switches. This part of the console simulates the signal between
        the console and a tube: the composite waveform itself, twelve
        samples per colour subcarrier cycle, on a grid whose rate we keep
        as the exact fraction 12 x 315/88 MHz and never as a rounded float.
        The console&rsquo;s chips put out dots, and this turns the dots into
        a waveform and the waveform into glowing phosphor.
      </>
    ),
    figureAlt:
      "Twelve NES hue bands stepping around the colour wheel, rendered inside a simulated CRT: curved, corner-rounded, scanlined, with an aperture-grille mask.",
    figureCaption: (commit: string, href: string) => (
      <>
        This picture is here for the look of the thing, not as proof: the
        recorded colour-cycle test frame, encoded, decoded with the notch
        filter, and passed through all five CRT stages (beam, scanlines,
        persistence, mask, geometry), drawn by the repository&rsquo;s own
        reference player at commit{" "}
        <a data-address href={href}>{commit}</a>.
      </>
    ),
    oracleH: "Every stage is checked against something real, and every check can fail",
    sources: (
      <>
        Three sources converge on one waveform type. A NES dot stream is
        encoded the way the PPU encodes, with levels from a double-checked
        transcription of the measured voltage table. Any RGB framebuffer goes through
        a broadcast encoder checked against the clauses of SMPTE ST 170M
        itself, down to the published colour-bar levels. A captured
        waveform is the one source that has to find its own phase: it locks
        to sync and burst. We prove that with a round trip through a
        simulated capture card, which finds a deliberately injected 50 ppm
        rate error to within 5.
      </>
    ),
    rungs: (
      <>
        Decoding means pulling colour and brightness back apart, and there
        are four ways to do it here, each verified separately. The notch
        filter is what a cheap 1980s set did. The two-line comb is refused
        outright on the NES signal: adjacent lines sit 120 degrees apart,
        so they cannot cancel, and asking for it is an error with an
        explanation rather than a quietly worse picture. The three-line
        comb is the one that fits the NES, three lines whose colour phases
        cancel exactly. The temporal comb, which averages whole frames, is
        the one the spec got wrong, below.
      </>
    ),
    crt: (reds: number) => (
      <>
        The CRT is a model and says so: beam, scanlines, phosphor
        persistence, mask and geometry, every parameter chosen by hand and
        labelled that way. Tests of the arithmetic check it, because there
        is no real tube here to compare the model against. Then we run the
        whole suite again as a sabotage run, which deliberately corrupts
        the filter coefficients and the level tables:{" "}
        <b>{reds} tests must go red</b>, because a check that cannot fail
        is not a check.
      </>
    ),
    failedH: "Three of the spec's own numbers did not survive measurement",
    failedIntro: (
      <>
        The specification ntsc-crt was built from declared every one of its
        pre-computed numbers a claim for a test to confirm. Three of them
        failed, and each correction now sits in the current spec beside the
        test that forced it.
      </>
    ),
    failedRate: (full: string, famous: string, pair: string) => (
      <>
        <b>The famous {famous} Hz is real but belongs to a different
        quantity.</b> Full NES frames measure {full} Hz exactly; {pair} Hz is
        the two-frame average with the short frame alternating in, the rate a
        player actually sees. Each of the three NES rates now has its own
        test, so the two can no longer be mixed up.
      </>
    ),
    failedComb: (
      <>
        <b>The specced temporal comb cannot exist.</b> The spec said
        rendering-enabled frames sit 180 degrees apart, so averaging two
        frames cancels chroma. The residues its own geometry section states
        are 120 and 240 degrees, and the measurement agrees: a two-frame
        average only attenuates. Three full frames cancel exactly, and that
        is the comb that shipped.
      </>
    ),
    failedBand: (
      <>
        <b>The classic bandwidths are a historical note, not the
        standard.</b> Y to 4.2 MHz, I to 1.3, Q to 0.4 is what everyone
        quotes. The primary standard, which we have in hand with its hash
        recorded, leaves Y
        unrestricted and makes the colour-difference channels equiband; the
        split I/Q figures are its own NTSC-1953 continuation note.
      </>
    ),
    pinnedH: "Every reference is recorded by hash, and every disagreement has a name",
    blargg: (href: string) => (
      <>
        The NES pipeline is compared against blargg&rsquo;s nes_ntsc 0.2.2,
        recovered from the Wayback Machine&rsquo;s capture of a dead canonical
        URL, with its hash recorded. It is LGPL, used only inside our tests,
        and never shipped.
        Where the two pipelines disagree, the difference is attributed to a
        specific stage with a test rather than absorbed into a tolerance:
        the level rounding is his, the emphasis approximation is his, the
        decoder matrix and gamma are legitimately both, and{" "}
        <a href={href}>the consolidated table</a> names each with its
        magnitude.
      </>
    ),
    smpte: (gate: number) => (
      <>
        The broadcast encoder is checked against SMPTE ST 170M-2004 itself,
        fetched from SMPTE&rsquo;s repository with its hash recorded, down to
        re-deriving
        the published colour-bar column from the standard&rsquo;s own
        clauses. The NES level table was accepted only after two
        independent transcriptions of the same wiki revision agreed on
        all {gate} numeric values.
      </>
    ),
    realH: "A real console reached the pipeline before the colour bars did",
    realIntro: (captures: number, msa: number) => (
      <>
        On 2026-09-02 a front-loader NES and a Super Mario Bros. / Duck
        Hunt cartridge met our oscilloscope: {captures} raw
        composite records, twelve million samples each at {msa} MSa/s,
        captured straight off the video pin with no capture card and no
        decoder chip in the path. Everything below was measured from those
        records by the repository&rsquo;s own recovery.
      </>
    ),
    realScanAlt:
      "One scanline of the raw Super Mario Bros. capture: the sync tip, the ten-cycle colorburst, and the chroma-modulated active picture, with a zoom on the burst.",
    realScanCaption: (
      <>
        This one is evidence rather than an illustration: one scanline of
        the paused World 1-1 recording exactly as the ADC saw it, and the
        colorburst the recovery locks onto. Drawn straight from the raw
        samples, with no decoding involved.
      </>
    ),
    realFinding: (nesLine: number, bLine: number, bias: string, range: string) => (
      <>
        The first decode came out wrong in an instructive way. The recovery
        assumed broadcast geometry, and the NES is not broadcast: its line
        is 227 and a third subcarrier cycles ({nesLine} grid samples where
        broadcast has {bLine}), so the burst phase advances a third of a
        cycle per line, not half. Decoded under the wrong model, every
        line landed slightly more hue-rotated than the last, a smooth
        colour roll down the whole frame, and the same two-sample bias
        mismeasured the scope&rsquo;s clock at {bias} ppm slow. Under the
        NES profile the identical records measure {range} ppm. The fix,
        recover_nes, is proven on a synthetic NES capture, and the
        test&rsquo;s built-in sabotage is the broadcast assumption itself:
        the exact mistake the real console exposed, kept in the suite so it
        cannot come back.
      </>
    ),
    realPairAlt:
      "The same Super Mario Bros. capture decoded twice: hue rolling smoothly down the frame under the broadcast model on the left, flat and correct under the NES profile on the right.",
    realPairCaption: (
      <>
        One capture, two phase models: the left frame is what a broadcast
        decode makes of an NES signal.
      </>
    ),
    realScore: (luma: string, hue: string, pct: number, real: string, synth: string) => (
      <>
        With the geometry right, the sky in paused World 1-1 became the
        first real region scored against our own synthesis:
        the same colour, $22, generated from the transcribed level table
        and decoded through the identical path. Luma agrees within {luma}{" "}
        and hue within {hue} degrees. Saturation does not: the real
        console&rsquo;s chroma measures {pct} percent hotter ({real}{" "}
        against {synth}). That gap is a real finding, and widening a
        tolerance to hide it would defeat the point. Either the
        unterminated probe run flatters the chroma
        swing, or the real DAC&rsquo;s AC swing genuinely exceeds the
        table&rsquo;s DC-measured levels, and one 75 ohm terminated
        re-capture decides which.
      </>
    ),
    realScoreAlt:
      "The U-V chroma plane with two vectors: the real console's measured colour $22 and the synthesized one, same direction, the real one longer.",
    realScoreCaption: (
      <>
        The comparison drawn on the chroma plane: same hue, hotter
        saturation. The numbers come from the repository&rsquo;s own
        score-real-region run at the recorded commit.
      </>
    ),
    realDecodedAlt1:
      "Super Mario Bros., World 1-1 paused, decoded from the raw scope capture: purple-blue sky, cloud, green hill, orange bricks.",
    realDecodedAlt2:
      "Duck Hunt in play, decoded from the raw scope capture: blue sky, green tree and grass, a duck mid-flight, the HIT and SCORE bar.",
    realDecodedCaption: (
      <>
        Two of the five records, decoded end to end: probe, scope, sync,
        burst lock, resample, separate, demodulate. Game frames are
        Nintendo&rsquo;s, reproduced for commentary on the measurement;
        the famous $22 sky really is that purple.
      </>
    ),
    boardedH: "Every number here comes from re-running the tests",
    boardedIntro: (date: string) => (
      <>
        The story above comes from the repository&rsquo;s milestone
        reports, but the figures below are not copied out of them: on{" "}
        {date} we ran ntsc-crt&rsquo;s own scanner, its full test suite and
        its sabotage run again at the recorded commit, and this page reads
        only what those runs wrote.
      </>
    ),
    mTests: (n: number) => <>suite: <b>{n} tests green</b></>,
    mReds: (n: number) => <>sabotage run: <b>{n} tests red</b></>,
    mClaims: (n: number) => <>doc claims re-derived: <b>{n}</b></>,
    mCrates: (n: number) => <>crates: <b>{n}</b></>,
    mCommit: (commit: string, href: string) => (
      <>commit: <b><a data-address href={href}>{commit}</a></b></>
    ),
    benchH: "The bench runs the pipeline live",
    notHereH: "What is not here yet",
    open1: (
      <>
        The colour-bars half of the real-recording check is still open.
        Real console captures now decode end to end, but the check wants
        the seven standard colour bars at 75 percent, and a game cartridge
        does not draw those; it waits on a test ROM.{" "}
        <a href={`${REPORTS}/capture-instructions.md`}>The instructions</a>{" "}
        are one page.
      </>
    ),
    open4: (
      <>
        The saturation question above had a designed experiment waiting,
        and it has run: the same console through a 75 ohm feedthrough
        terminator, which separates the probe run&rsquo;s flattery from
        the DAC&rsquo;s own behaviour.{" "}
        <Link href="/nes/signal/composite">The composite deep-dive</Link> reads
        the terminated signal off the scope, level by level.
      </>
    ),
    open2: (notch: number, comb3: number, stamp: string) => (
      <>
        <Link href="/nes/signal/bench">The live bench</Link> runs this pipeline in
        the page, NES dots in and decoded pixels out, with the drift
        counters visible. In the browser it measures at least {notch}{" "}
        frames a second on the notch filter and {comb3} on the three-line
        comb ({stamp}): near the source&rsquo;s own 60.09881 Hz, and the
        bench prints the rate it actually achieves rather than a promise.
      </>
    ),
    open3: (
      <>
        The levers that made it fast, decimation before the chroma lowpass
        and convolutions restructured for the vectorizer, were named in the
        M2 report before being built, and every locked-down comparison
        against the references still passed through the change: the speed
        came from the same commit the figures above were re-verified at.
      </>
    ),
    repo: (href: string) => (
      <>
        The repository is public and MIT:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a>. Unlike
        the 6502 tree it has no licence boundary inside it: it embeds no die
        data, and the one LGPL piece is the reference decoder our tests
        compare against, which nothing we ship contains.
      </>
    ),
  },
  ja: {
    kinship: (
      <>
        <Link href="/ja/6502">6502 の仕事</Link>はチップをスイッチのレベルで模擬する。コンソールのこの部分が模擬するのは、コンソールとブラウン管の間の信号そのもの: コンポジット波形を色副搬送波 1 周期あたり 12 サンプルで、レートは丸めた浮動小数ではなく厳密な分数 12 x 315/88 MHz として持つ。コンソールのチップがドットを出し、こちらがそのドットを波形に、波形を光る蛍光体に変える。
      </>
    ),
    figureAlt:
      "シミュレートされた CRT の中で色相環を一周する NES の 12 色相帯。湾曲、角の丸み、走査線、アパーチャグリルのマスク付き。",
    figureCaption: (commit: string, href: string) => (
      <>
        これは証拠ではなく、見た目を伝えるための一枚: 記録済みの色相サイクルのテストフレームを、エンコードし、ノッチフィルタでデコードし、CRT の全 5 段（ビーム、走査線、残光、マスク、幾何）に通して、リポジトリ自身のリファレンスプレイヤーがコミット{" "}
        <a data-address href={href}>{commit}</a> で描いたもの。
      </>
    ),
    oracleH: "どの段も実物に照らして検査され、どの検査も失敗できる",
    sources: (
      <>
        三つのソースが一つの波形型に収束する。NES のドット列は PPU と同じやり方でエンコードされ、レベルは二重に確認して転記した実測電圧表から来る。任意の RGB フレームバッファは SMPTE ST 170M の条項そのものに照らした放送エンコーダを通り、公表されたカラーバーのレベルまで一致を求められる。キャプチャ波形だけは位相を自分で見つけなければならないソースで、同期とバーストにロックする。それを、模擬キャプチャカードを通した往復で証明する（わざと注入した 50 ppm のレート誤差を 5 ppm 以内で見つける）。
      </>
    ),
    rungs: (
      <>
        デコードとは、混ざった色と明るさをもう一度引き剥がすことで、ここにはそのやり方が四つあり、それぞれ別々に検証される。ノッチフィルタは安価な 1980 年代のテレビがやっていたこと。2 ラインコムは NES の信号ではきっぱり拒否される: 隣接する行は 120 度ずれていて打ち消せないから、選ぼうとすると黙って劣化した絵ではなく、理由付きのエラーになる。3 ラインコムが NES に合うやり方で、三つの行の色位相が正確に打ち消し合う。フレームを平均する時間コムは、仕様が間違えていたやつだ。下に書く。
      </>
    ),
    crt: (reds: number) => (
      <>
        CRT はモデルであり、そう名乗る: ビーム、走査線、蛍光体の残光、マスク、幾何。パラメータはすべて手で選んだ値で、そう明記してある。ここには比べる実物のブラウン管が無いので、計算を確かめるテストで検査する。そしてスイート全体を妨害走行としてもう一度走らせ、フィルタ係数とレベル表をわざと壊す: <b>{reds} 個のテストが赤にならなければならない</b>。失敗できない検査は検査ではないからだ。
      </>
    ),
    failedH: "仕様自身の数字のうち三つが、実測に耐えなかった",
    failedIntro: (
      <>
        ntsc-crt の元になった仕様は、自らの事前計算値をすべて「テストが確認すべき主張」と宣言していた。そのうち三つが落ち、それぞれの訂正はいま、それを強いたテストの隣で現行の仕様に載っている。
      </>
    ),
    failedRate: (full: string, famous: string, pair: string) => (
      <>
        <b>有名な {famous} Hz は実在するが、別の量に属する。</b>NES のフルフレームは正確に {full} Hz と実測される。{pair} Hz は短フレームが交互に入る 2 フレーム平均で、プレイヤーが実際に見るレートだ。三つの NES レートはいまやそれぞれ自分のテストを持ち、二度と混同できない。
      </>
    ),
    failedComb: (
      <>
        <b>仕様どおりの時間コムは存在できない。</b>仕様は、描画有効時のフレームが 180 度離れるから 2 フレーム平均でクロマが消える、と言った。仕様自身の幾何の節が述べる残差は 120 度と 240 度で、実測も一致する: 2 フレーム平均は減衰させるだけだ。フルフレーム 3 枚なら厳密に打ち消し、出荷されたのはそのコムである。
      </>
    ),
    failedBand: (
      <>
        <b>古典的な帯域幅は歴史的注記であって、規格ではない。</b>Y は 4.2 MHz、I は 1.3、Q は 0.4、と誰もが引用する。手元にあり、ハッシュを記録してある一次規格は、Y を無制限のままにし、色差チャネルを等帯域とする。I/Q の分割値は規格自身の NTSC-1953 継続注記だ。
      </>
    ),
    pinnedH: "参照資料はすべてハッシュを記録してあり、不一致にはすべて名前がある",
    blargg: (href: string) => (
      <>
        NES パイプラインは blargg の nes_ntsc 0.2.2 と比較される。死んだ正規 URL の Wayback Machine 収集から回収し、ハッシュを記録してある。LGPL で、テストの中だけで使い、出荷物には決して入らない。二つのパイプラインが食い違う所では、差は許容誤差に吸収されず、テスト付きで特定の段に帰属される: レベルの丸めは彼のもの、強調近似も彼のもの、デコーダ行列とガンマは双方正当。<a href={href}>統合表</a>が各項を大きさ付きで挙げる。
      </>
    ),
    smpte: (gate: number) => (
      <>
        放送エンコーダは SMPTE ST 170M-2004 そのもの（SMPTE のリポジトリから取得し、ハッシュを記録）に照らされ、公表カラーバー列を規格自身の条項から再導出するところまで確認される。NES のレベル表は、同じ Wiki 版を独立に二回転記し、全 {gate} 個の数値が一致して初めて受理された。
      </>
    ),
    realH: "カラーバーより先に、実機がパイプラインに届いた",
    realIntro: (captures: number, msa: number) => (
      <>
        2026-09-02、前面ローダーの NES と『スーパーマリオブラザーズ / ダックハント』のカートリッジが、うちのオシロスコープと出会った。生のコンポジット記録が {captures} 本、各 1200 万サンプル、{msa} MSa/s。ビデオピンから直接で、キャプチャカードもデコーダチップも経路にない。以下はすべて、その記録からリポジトリ自身のリカバリで実測したものだ。
      </>
    ),
    realScanAlt:
      "生のスーパーマリオ・キャプチャの 1 走査線: 同期チップ、10 周期のカラーバースト、クロマ変調された有効画面。バーストの拡大付き。",
    realScanCaption: (
      <>
        こちらは例示ではなく証拠そのもの: 一時停止した World 1-1 の記録の 1 走査線を ADC が見たままに、そしてリカバリがロックするカラーバースト。生サンプルからそのまま描き、デコードは介在しない。
      </>
    ),
    realFinding: (nesLine: number, bLine: number, bias: string, range: string) => (
      <>
        最初のデコードは、示唆的な形で間違った。リカバリは放送の幾何を仮定していたが、NES は放送ではない: 1 行は副搬送波 227 と 3 分の 1 周期（グリッドで {nesLine} サンプル。放送は {bLine}）で、バースト位相は行ごとに半周期ではなく 3 分の 1 周期進む。間違ったモデルでデコードすると、各行が前の行より少しずつ色相回転して着地し、フレーム全体を色がなだらかに転がり落ちる。同じ 2 サンプルの偏りがスコープのクロックを {bias} ppm 遅いと誤測定した。NES プロファイルでは同一の記録が {range} ppm と実測される。修正の recover_nes は合成 NES キャプチャで証明され、テストに仕込まれた妨害は放送の仮定そのもの: 実機が暴いた間違いを、二度と戻れないようスイートに残してある。
      </>
    ),
    realPairAlt:
      "同じスーパーマリオのキャプチャを二度デコード: 左は放送モデルで色相がフレームを転がり落ち、右は NES プロファイルで平坦かつ正しい。",
    realPairCaption: (
      <>
        キャプチャは一つ、位相モデルは二つ: 左は放送デコードが NES 信号から作るもの。
      </>
    ),
    realScore: (luma: string, hue: string, pct: number, real: string, synth: string) => (
      <>
        幾何が正しくなったところで、一時停止した World 1-1 の空が、私たち自身の合成に対して採点された最初の実領域になった。同じ色 $22 を転記済みレベル表から生成し、同一経路でデコードして比べる。輝度は {luma} 以内、色相は {hue} 度以内で一致する。彩度は一致しない: 実機のクロマは {pct} パーセント熱い（{synth} に対して {real}）。この差は本物の所見で、許容誤差を広げて隠したら元も子もない。終端していないプローブ経路がクロマ振幅をよく見せているのか、実 DAC の AC 振幅が表の DC 実測値を本当に超えているのか。75 オーム終端での再キャプチャ一回が決める。
      </>
    ),
    realScoreAlt:
      "U-V クロマ平面上の二本のベクトル: 実機で測った色 $22 と合成した $22。向きは同じで、実機の方が長い。",
    realScoreCaption: (
      <>
        比較をクロマ平面に描いたもの: 色相は同じ、彩度が熱い。数字はリポジトリ自身の score-real-region を記録済みコミットで走らせたもの。
      </>
    ),
    realDecodedAlt1:
      "スーパーマリオブラザーズ、World 1-1 一時停止中。生のスコープキャプチャからデコード: 青紫の空、雲、緑の丘、オレンジのレンガ。",
    realDecodedAlt2:
      "プレイ中のダックハント。生のスコープキャプチャからデコード: 青空、緑の木と草、飛んでいるカモ、HIT と SCORE のバー。",
    realDecodedCaption: (
      <>
        5 本の記録のうち 2 本を端から端までデコード: プローブ、スコープ、同期、バーストロック、リサンプル、分離、復調。ゲーム画面は任天堂のもので、測定への論評のために転載した。有名な $22 の空は本当にこの紫だ。
      </>
    ),
    boardedH: "ここの数字は、テストを走らせ直した実測から来ている",
    boardedIntro: (date: string) => (
      <>
        上の物語はリポジトリのマイルストーン報告から来ているが、下の数字はその写しではない: {date} に、記録されたコミットで ntsc-crt 自身のスキャナと全テストスイートと妨害走行をもう一度走らせ、このページはそれらの走行が書いたものだけを読む。
      </>
    ),
    mTests: (n: number) => <>スイート: <b>{n} テスト緑</b></>,
    mReds: (n: number) => <>妨害走行: <b>{n} テスト赤</b></>,
    mClaims: (n: number) => <>再導出した文書中の主張: <b>{n}</b></>,
    mCrates: (n: number) => <>クレート: <b>{n}</b></>,
    mCommit: (commit: string, href: string) => (
      <>コミット: <b><a data-address href={href}>{commit}</a></b></>
    ),
    benchH: "ベンチはパイプラインを生で走らせる",
    notHereH: "まだ無いもの",
    open1: (
      <>
        実記録の検査のうちカラーバー側は開いたまま。実機キャプチャは端から端までデコードできるようになったが、検査は 75 パーセントの標準カラーバー 7 本を求め、ゲームカートリッジはそれを描かない: テスト ROM を待っている。<a href={`${REPORTS}/capture-instructions.md`}>手順</a>は 1 ページ。
      </>
    ),
    open4: (
      <>
        上の彩度の疑問には設計済みの実験が待っていて、それは走った: 同じ実機を 75 オームのフィードスルー終端に通す。プローブ経路のお世辞と DAC 自身の振る舞いを、それが切り分ける。<Link href="/ja/nes/signal/composite">コンポジット深掘り</Link>は、終端した信号をスコープからレベルごとに読む。
      </>
    ),
    open2: (notch: number, comb3: number, stamp: string) => (
      <>
        <Link href="/ja/nes/signal/bench">ライブベンチ</Link>はこのパイプラインをページ内で走らせ、NES のドットを入れてデコード済みの画素を出し、ドリフトのカウンタを見せる。ブラウザでの実測はノッチフィルタで毎秒 {notch} フレーム以上、3 ラインコムで {comb3}（{stamp}）。ソース自身の 60.09881 Hz に迫る速さで、ベンチは約束ではなく実際に出たレートを表示する。
      </>
    ),
    open3: (
      <>
        速くしたレバー（クロマ・ローパス前のデシメーションと、ベクトル化器のために組み替えた畳み込み）は、作られる前に M2 レポートで名指しされていたものだ。変更の間も、リファレンスとの固定済みの比較はすべて通ったままだった: 速さは、上の数字が再検証されたのと同じコミットから来ている。
      </>
    ),
    repo: (href: string) => (
      <>
        リポジトリは公開で MIT:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a>。6502 の木と違って内部にライセンス境界はない: ダイ・データを一切埋め込まず、唯一の LGPL 部品はテストが比較に使うリファレンスデコーダで、出荷物には含まれない。
      </>
    ),
  },
} as const;

export default async function NtscPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = surface("nes", "signal");
  const r = ntsc();
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;
  // 60.0988 is the two-frame average's leading digits; derived, not typed,
  // so the page cannot state the famous figure against the wrong quantity.
  const famous = r.rates.nes_pair_hz.slice(0, 7);

  return (
    <Shell lang={lang} die="NTSC" title={t(lang, p.name)}>
      <div className="prose">
        <p>{t(lang, p.what)}</p>

        <p>{S.kinship}</p>

        <figure className="crt-figure">
          <Image
            src="/ntsc/crt-hue-bands.png"
            width={768}
            height={720}
            alt={S.figureAlt}
            // The frame is exact pixels from the reference player: the
            // aperture-grille mask and the scanlines are per-pixel patterns,
            // and an optimizer resampling them would moire what the caption
            // says is a faithful render. Served as committed, byte for byte.
            unoptimized
          />
          <figcaption>{S.figureCaption(commitShort, commitHref)}</figcaption>
        </figure>

        <h2>{S.oracleH}</h2>
        <p>{S.sources}</p>
        <p>{S.rungs}</p>
        <p>{S.crt(r.mutate_red)}</p>

        <h2>{S.failedH}</h2>
        <p>{S.failedIntro}</p>
        <ol>
          <li>{S.failedRate(r.rates.nes_full_hz, famous, r.rates.nes_pair_hz)}</li>
          <li>{S.failedComb}</li>
          <li>{S.failedBand}</li>
        </ol>

        <h2>{S.pinnedH}</h2>
        <p>{S.blargg("https://github.com/tinymachines/ntsc-crt/blob/main/docs/divergences.md")}</p>
        <p>{S.smpte(r.transcription_gate_values)}</p>

        <h2>{S.realH}</h2>
        <p>{S.realIntro(r.real_capture.captures, r.real_capture.msa_per_s)}</p>

        <figure className="crt-figure">
          <Image
            src="/ntsc/real-scanline.png"
            width={2000}
            height={672}
            alt={S.realScanAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.realScanCaption}</figcaption>
        </figure>

        <p>
          {S.realFinding(
            r.real_capture.nes_line_grid,
            r.real_capture.broadcast_line_grid,
            r.real_capture.broadcast_line_bias_ppm,
            r.real_capture.rate_ppm_range,
          )}
        </p>

        <figure className="crt-figure">
          <Image
            src="/ntsc/broadcast-vs-nes.png"
            width={1316}
            height={550}
            alt={S.realPairAlt}
            // Decoded pixels: an optimizer resampling the chroma fringes
            // would blur the artefact the caption points at.
            unoptimized
          />
          <figcaption>{S.realPairCaption}</figcaption>
        </figure>

        <p>
          {S.realScore(
            r.real_capture.luma_delta,
            r.real_capture.hue_delta_deg,
            r.real_capture.sat_hot_pct,
            r.real_capture.sat_real,
            r.real_capture.sat_synth,
          )}
        </p>

        <figure className="crt-figure">
          <Image
            src="/ntsc/colour-22-score.png"
            width={1024}
            height={960}
            alt={S.realScoreAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.realScoreCaption}</figcaption>
        </figure>

        <figure className="crt-figure">
          <Image
            src="/ntsc/decoded-smb-1-1.png"
            width={640}
            height={480}
            alt={S.realDecodedAlt1}
            unoptimized
          />
          <Image
            src="/ntsc/decoded-duckhunt.png"
            width={640}
            height={480}
            alt={S.realDecodedAlt2}
            unoptimized
          />
          <figcaption>{S.realDecodedCaption}</figcaption>
        </figure>

        <h2>{S.boardedH}</h2>
        <p>{S.boardedIntro(r.boarded_on)}</p>
        <div className="boarded" data-boarded>
          <span className="measured">{S.mTests(r.tests_green)}</span>
          <span className="measured">{S.mReds(r.mutate_red)}</span>
          <span className="measured">{S.mClaims(r.claims_verified)}</span>
          <span className="measured">{S.mCrates(r.crates)}</span>
          <span className="measured">{S.mCommit(commitShort, commitHref)}</span>
        </div>

        <h2>{S.benchH}</h2>
        <p>{S.open2(r.wasm_fps.notch, r.wasm_fps.comb3, r.wasm_fps.stamp)}</p>

        <h2>{S.notHereH}</h2>
        <ul>
          <li>{S.open1}</li>
          <li>{S.open4}</li>
          <li>{S.open3}</li>
        </ul>

        <Shelf lang={lang} group="signal" />

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
