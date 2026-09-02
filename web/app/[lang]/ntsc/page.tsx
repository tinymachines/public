import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { project } from "@/lib/projects";
import { ntsc } from "@/lib/ntsc";
import Image from "next/image";
import { Shell } from "@/app/components/SiteFrame";
import "./ntsc.css";

/**
 * /ntsc: the third project gets a roof.
 *
 * A measurement-report page in the house voice. Its story is the ntsc-crt
 * repository's own milestone reports; its figures are slots filled from
 * data/ntsc.json, which only scripts/board-ntsc.py writes, and it writes
 * only what it measured by running that repository's scanner, suite and
 * MUTATE run at a pinned commit. No number on this page is typed.
 *
 * Structure, not identity, same as hotbits: style/projects/ntsc.css turns
 * one knob (the accent) and lists every other lever commented out for the
 * owner. The page is the house kit and changes the day that file is filled.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/ntsc");
}

const REPORTS = "https://github.com/tinymachines/ntsc-crt/blob/main/docs";

const PROSE = {
  en: {
    kinship: (
      <>
        <Link href="/6502">The 6502 work</Link> simulates a chip at its
        switches. This simulates the signal between a console and a tube:
        the composite waveform itself, twelve samples per colour subcarrier
        cycle, on a grid whose rate is held as the exact rational
        12 x 315/88 MHz and never as a float. The two projects meet at the
        NES: the engine ladder&rsquo;s machine emits dots, and this turns dots
        into a waveform and the waveform into phosphor.
      </>
    ),
    figureAlt:
      "Twelve NES hue bands stepping around the colour wheel, rendered inside a simulated CRT: curved, corner-rounded, scanlined, with an aperture-grille mask.",
    figureCaption: (commit: string, href: string) => (
      <>
        Illustrative, not verification: the recorded colour-cycle golden
        through encode, Rung A decode and all five CRT stages (beam,
        scanlines, persistence, mask, geometry), drawn by the
        repository&rsquo;s own reference player at commit{" "}
        <a data-address href={href}>{commit}</a>.
      </>
    ),
    oracleH: "Every stage has an oracle and a way to fail",
    sources: (
      <>
        Three sources converge on one waveform type. A NES dot stream is
        encoded the way the PPU encodes, with levels from a gated
        transcription of the measured table. Any RGB framebuffer goes through
        a broadcast encoder held to SMPTE ST 170M&rsquo;s own clauses, down to
        the published colour-bar levels. A captured waveform is the one
        source that must earn its phase: it locks to sync and burst, and is
        proven by a roundtrip through a modelled capture card that finds an
        injected 50 ppm rate error to within 5.
      </>
    ),
    rungs: (
      <>
        Decode is four separation rungs, each verified separately. The notch
        filter is the cheap 1980s set. The two-line comb is refused by name
        on the NES profile: a line residue of 120 degrees means two adjacent
        lines cannot cancel, so selecting it there is a construction error
        rather than a silently worse picture. The three-line comb is the
        NES-native separator, three equal phasors summing to zero. The
        temporal comb is the one the spec got wrong, below.
      </>
    ),
    crt: (reds: number) => (
      <>
        The CRT is a model and says so: beam, scanlines, phosphor
        persistence, mask and geometry, every parameter authored and
        labelled authored, held by analytic tests because no external oracle
        exists for a model. And the whole tree runs its suite once more with
        MUTATE=1, which perturbs filter coefficients and level tables:{" "}
        <b>{reds} tests must go red</b>, because a verification that cannot
        fail is not a verification.
      </>
    ),
    failedH: "Three of the spec's own numbers did not survive measurement",
    failedIntro: (
      <>
        The handoff spec declared every one of its pre-computed values a
        claim for a test to confirm. Three failed, and each correction now
        sits in the ratified v0.3 spec beside the test that forced it.
      </>
    ),
    failedRate: (full: string, famous: string, pair: string) => (
      <>
        <b>The famous {famous} Hz is real but belongs to a different
        quantity.</b> Full NES frames measure {full} Hz exactly; {pair} Hz is
        the two-frame average with the short frame alternating in, the rate a
        player actually sees. Each of the three NES rates is now pinned by
        its own test, so the two can no longer be conflated.
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
        quotes. The primary standard, in hand and pinned by hash, leaves Y
        unrestricted and makes the colour-difference channels equiband; the
        split I/Q figures are its own NTSC-1953 continuation note.
      </>
    ),
    pinnedH: "The oracles are pinned, and every disagreement has a name",
    blargg: (href: string) => (
      <>
        The NES pipeline is compared against blargg&rsquo;s nes_ntsc 0.2.2,
        recovered from the Wayback Machine&rsquo;s capture of a dead canonical
        URL and pinned by hash; it is test rig only, LGPL, and never shipped.
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
        The broadcast encoder is held to SMPTE ST 170M-2004 itself, fetched
        from SMPTE&rsquo;s repository and pinned by hash, down to re-deriving
        the published colour-bar column from the standard&rsquo;s own
        clauses. The NES level table was accepted only after two agents
        transcribed the same wiki revision independently and their copies
        agreed on all {gate} numeric values.
      </>
    ),
    boardedH: "Measured for this page, not copied from the report",
    boardedIntro: (date: string) => (
      <>
        The story above traces to the repository&rsquo;s milestone reports.
        The figures below do not repeat what those reports say: they were
        re-measured on {date} by running the project&rsquo;s own scanner, its
        full test suite and its MUTATE=1 run at the recorded commit, and
        this page reads only what that run wrote.
      </>
    ),
    mTests: (n: number) => <>suite: <b>{n} tests green</b></>,
    mReds: (n: number) => <>MUTATE=1: <b>{n} tests red</b></>,
    mClaims: (n: number) => <>doc claims re-derived: <b>{n}</b></>,
    mCrates: (n: number) => <>crates: <b>{n}</b></>,
    mCommit: (commit: string, href: string) => (
      <>commit: <b><a data-address href={href}>{commit}</a></b></>
    ),
    benchH: "The bench runs the pipeline live",
    notHereH: "What is not here yet",
    open1: (
      <>
        The capture source&rsquo;s real-recording gate is open. Its synthetic
        roundtrip is closed, and the last step waits on one file: a real
        composite recording of colour bars.{" "}
        <a href={`${REPORTS}/capture-instructions.md`}>The instructions</a>{" "}
        are one page.
      </>
    ),
    open2: (notch: number, comb3: number, stamp: string) => (
      <>
        <Link href="/ntsc/bench">The live bench</Link> runs this pipeline in
        the page, dot planes in and decoded RGBA out, with the drift
        counters visible. In the browser it measures about five frames a
        second ({notch} on the notch rung, {comb3} on the three-line comb;{" "}
        {stamp}), and the bench says so rather than hides it.
      </>
    ),
    open3: (
      <>
        Real-time decode is a named optimization with named levers,
        decimation before the chroma lowpass and explicit SIMD in the line
        convolutions, and deliberately not a correctness milestone.
      </>
    ),
    repo: (href: string) => (
      <>
        The repository is public and MIT:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a>. Unlike
        the 6502 tree it has no licence boundary inside it: it embeds no die
        data, and the one LGPL piece is the native test oracle, which no
        shipped artefact contains.
      </>
    ),
  },
  ja: {
    kinship: (
      <>
        <Link href="/ja/6502">6502 の仕事</Link>はチップをスイッチのレベルで模擬する。こちらが模擬するのは、コンソールとブラウン管の間の信号そのもの: コンポジット波形を色副搬送波 1 周期あたり 12 サンプルで、レートを浮動小数ではなく厳密な有理数 12 x 315/88 MHz として保持する。二つのプロジェクトは NES で出会う。エンジンの梯子の機械がドットを出し、こちらがドットを波形に、波形を蛍光体に変える。
      </>
    ),
    figureAlt:
      "シミュレートされた CRT の中で色相環を一周する NES の 12 色相帯。湾曲、角の丸み、走査線、アパーチャグリルのマスク付き。",
    figureCaption: (commit: string, href: string) => (
      <>
        検証ではなく例示: 記録済みの色相サイクル・ゴールデンを、エンコード、ラング A のデコード、CRT の全 5 段（ビーム、走査線、残光、マスク、幾何）に通し、リポジトリ自身のリファレンスプレイヤーがコミット{" "}
        <a data-address href={href}>{commit}</a> で描いたもの。
      </>
    ),
    oracleH: "どの段にもオラクルと、失敗する道がある",
    sources: (
      <>
        三つのソースが一つの波形型に収束する。NES のドット列は PPU と同じやり方でエンコードされ、レベルは実測表のゲート付き転記から来る。任意の RGB フレームバッファは SMPTE ST 170M の条項そのものに照らした放送エンコーダを通り、公表されたカラーバーのレベルまで一致を求められる。キャプチャ波形だけは位相を自分で獲得しなければならないソースで、同期とバーストにロックし、模擬キャプチャカードを通した往復で証明される（注入した 50 ppm のレート誤差を 5 ppm 以内で発見する）。
      </>
    ),
    rungs: (
      <>
        デコードは四つの分離ラングで、それぞれ別々に検証される。ノッチフィルタは安価な 1980 年代のテレビ。2 ライン・コムは NES プロファイルでは名前を挙げて拒否される: 行残差が 120 度である以上、隣接 2 行では打ち消せないから、そこで選ぶことは黙って劣化する絵ではなく構築時エラーになる。3 ライン・コムが NES 本来の分離器で、等しい三つのフェーザが零に和する。時間コムは仕様が間違えていたラングで、下に書く。
      </>
    ),
    crt: (reds: number) => (
      <>
        CRT はモデルであり、そう名乗る: ビーム、走査線、蛍光体の残光、マスク、幾何。パラメータはすべて創作値で、創作値と明記され、モデルに外部オラクルは存在しないから解析的テストで保持される。そして木全体が MUTATE=1 でもう一度スイートを走らせ、フィルタ係数とレベル表を乱す: <b>{reds} 個のテストが赤にならなければならない</b>。失敗できない検証は検証ではないからだ。
      </>
    ),
    failedH: "仕様自身の数字のうち三つが、実測に耐えなかった",
    failedIntro: (
      <>
        ハンドオフ仕様は、自らの事前計算値をすべて「テストが確認すべき主張」と宣言していた。三つが落ち、それぞれの訂正はいま、それを強いたテストの隣で v0.3 仕様に載っている。
      </>
    ),
    failedRate: (full: string, famous: string, pair: string) => (
      <>
        <b>有名な {famous} Hz は実在するが、別の量に属する。</b>NES のフルフレームは正確に {full} Hz と実測される。{pair} Hz は短フレームが交互に入る 2 フレーム平均で、プレイヤーが実際に見るレートだ。三つの NES レートはいまや各自のテストで留められ、二度と混同できない。
      </>
    ),
    failedComb: (
      <>
        <b>仕様どおりの時間コムは存在できない。</b>仕様は、描画有効時のフレームが 180 度離れるから 2 フレーム平均でクロマが消える、と言った。仕様自身の幾何の節が述べる残差は 120 度と 240 度で、実測も一致する: 2 フレーム平均は減衰させるだけだ。フルフレーム 3 枚なら厳密に打ち消し、出荷されたのはそのコムである。
      </>
    ),
    failedBand: (
      <>
        <b>古典的な帯域幅は歴史的注記であって、規格ではない。</b>Y は 4.2 MHz、I は 1.3、Q は 0.4、と誰もが引用する。手元にありハッシュで留めた一次規格は、Y を無制限のままにし、色差チャネルを等帯域とする。I/Q の分割値は規格自身の NTSC-1953 継続注記だ。
      </>
    ),
    pinnedH: "オラクルはハッシュで留められ、不一致にはすべて名前がある",
    blargg: (href: string) => (
      <>
        NES パイプラインは blargg の nes_ntsc 0.2.2 と比較される。死んだ正規 URL の Wayback Machine 収集から回収し、ハッシュで留めたもので、テスト装置専用（LGPL）であり出荷物には決して入らない。二つのパイプラインが食い違う所では、差は許容誤差に吸収されず、テスト付きで特定の段に帰属される: レベルの丸めは彼のもの、強調近似も彼のもの、デコーダ行列とガンマは双方正当。<a href={href}>統合表</a>が各項を大きさ付きで挙げる。
      </>
    ),
    smpte: (gate: number) => (
      <>
        放送エンコーダは SMPTE ST 170M-2004 そのもの（SMPTE のリポジトリから取得しハッシュで固定）に照らされ、公表カラーバー列を規格自身の条項から再導出するところまで確認される。NES のレベル表は、二つのエージェントが同じ Wiki 版を独立に転記し、全 {gate} 個の数値が一致して初めて受理された。
      </>
    ),
    boardedH: "このページのために実測した。報告書から写していない",
    boardedIntro: (date: string) => (
      <>
        上の物語はリポジトリのマイルストーン報告に辿れる。下の数字はその報告の再掲ではない: {date} に、記録されたコミットでプロジェクト自身のスキャナ、全テストスイート、MUTATE=1 の走行を実行し直し、このページはその走行が書いたものだけを読む。
      </>
    ),
    mTests: (n: number) => <>スイート: <b>{n} テスト緑</b></>,
    mReds: (n: number) => <>MUTATE=1: <b>{n} テスト赤</b></>,
    mClaims: (n: number) => <>再導出した文書中の主張: <b>{n}</b></>,
    mCrates: (n: number) => <>クレート: <b>{n}</b></>,
    mCommit: (commit: string, href: string) => (
      <>コミット: <b><a data-address href={href}>{commit}</a></b></>
    ),
    benchH: "ベンチはパイプラインを生で走らせる",
    notHereH: "まだ無いもの",
    open1: (
      <>
        キャプチャソースの実録音ゲートは開いたまま。合成往復は閉じており、最後の一歩はファイル一つを待つ: カラーバーの実コンポジット録音だ。<a href={`${REPORTS}/capture-instructions.md`}>手順</a>は 1 ページ。
      </>
    ),
    open2: (notch: number, comb3: number, stamp: string) => (
      <>
        <Link href="/ja/ntsc/bench">ライブベンチ</Link>はこのパイプラインをページ内で走らせ、ドット面を入れてデコード済み RGBA を出し、ドリフトのカウンタを見せる。ブラウザでの実測はおよそ毎秒 5 フレーム（ノッチで {notch}、3 ラインコムで {comb3}。{stamp}）で、ベンチはそれを隠さず表示する。
      </>
    ),
    open3: (
      <>
        リアルタイムデコードは、レバーに名前の付いた最適化課題（クロマ・ローパス前のデシメーションと、行畳み込みへの明示的 SIMD）であり、意図して正しさのマイルストーンではない。
      </>
    ),
    repo: (href: string) => (
      <>
        リポジトリは公開で MIT:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a>。6502 の木と違って内部にライセンス境界はない: ダイ・データを一切埋め込まず、唯一の LGPL 部品はネイティブのテストオラクルで、出荷物には含まれない。
      </>
    ),
  },
} as const;

export default async function NtscPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("ntsc");
  const r = ntsc();
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;
  // 60.0988 is the two-frame average's leading digits; derived, not typed,
  // so the page cannot state the famous figure against the wrong quantity.
  const famous = r.rates.nes_pair_hz.slice(0, 7);

  return (
    <Shell lang={lang} die="NTSC" title={p.name}>
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
          <li>{S.open3}</li>
        </ul>

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
