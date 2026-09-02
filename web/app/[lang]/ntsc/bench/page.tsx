import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { localize } from "@/lib/i18n";
import { ntsc } from "@/lib/ntsc";
import { Shell } from "@/app/components/SiteFrame";
import { Bench } from "./Bench";
import "../ntsc.css";

/**
 * /ntsc/bench: the whole signal path, encode to decoded frame, live in the
 * page. The wasm bundle is the boarded one (data/ntsc.json records the
 * commit, the tag and the file hashes; scripts/board-ntsc.py --wasm is the
 * only thing that writes either), so what runs here is what was measured.
 * The prose figures come from the same record, like the landing's.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/ntsc/bench");
}

const PROSE = {
  en: {
    what: (
      <>
        The pipeline from the repository, running in this page: NES dot
        planes are generated here, encoded to the composite waveform,
        separated on the rung you choose, demodulated and matrixed, and the
        decoded frame is drawn. It is the same signal path the oracles hold,
        compiled to WebAssembly from the boarded commit.
      </>
    ),
    slow: (notch: number, comb3: number, stamp: string) => (
      <>
        This is a laboratory instrument that now runs near the signal&rsquo;s
        own rate: at least {notch} frames/s on the notch rung and {comb3}
        on the three-line comb in one thread ({stamp}), after the
        decimation and vectorization levers the repository&rsquo;s perf
        report records. Step advances the source one frame. Run is a real
        free-run: the source advances at its own exact rate against the
        wall clock, the page encodes what it can, and the drift counters
        print what a real display would have duplicated or dropped,
        exactly as the bridge&rsquo;s pacing policy specifies.
      </>
    ),
    patterns: (
      <>
        Three patterns, generated in-page from the documented dot layout
        (341 x 262 dots, colour and emphasis planes, parity alternating
        Even and OddShort). The hue bands are the frame the landing&rsquo;s
        tube photograph came from; the stripes put everything at dot
        frequency, which is where a comb earns its keep against the notch;
        the solid frame is DC, where the two rungs should and do agree.
      </>
    ),
    refused: (
      <>
        Two rungs are here because two are in the bridge: the notch and the
        NES-native three-line comb. The two-line comb is not, for the
        reason the <Link href="/ntsc">landing</Link> gives: on this profile
        it cannot work, and the bridge refuses what it cannot do by name
        rather than shipping a silently worse picture.
      </>
    ),
    boarded: (commit: string, href: string, tag: string) => (
      <>
        The bundle is built from{" "}
        <a data-address href={href}>{commit}</a>
        {tag ? <> (tag {tag})</> : null} by the boarding script, and the
        record carries the file hashes, so what this page runs is what the
        repository&rsquo;s suite measured.
      </>
    ),
  },
  ja: {
    what: (
      <>
        リポジトリのパイプラインが、このページの中で走る: NES のドット面をここで生成し、コンポジット波形にエンコードし、選んだラングで分離し、復調して行列を掛け、デコード済みフレームを描く。オラクルが保持しているのと同じ信号経路を、ボーディング済みコミットから WebAssembly にコンパイルしたものだ。
      </>
    ),
    slow: (notch: number, comb3: number, stamp: string) => (
      <>
        これは実験器具で、いまや信号自身のレート近くで走る: 1 スレッドでノッチ・ラングが毎秒 {notch} フレーム以上、3 ラインコムが {comb3}（{stamp}）。リポジトリの性能レポートが記録するデシメーションとベクトル化のレバーの後の数字だ。「1 フレーム進める」はソースを 1 フレーム進める。「走らせる」は本物のフリーランで、ソースは壁時計に対して自身の正確なレートで進み、ページはできる分だけエンコードし、実際のディスプレイなら重複・欠落させたはずの分をドリフトカウンタが表示する。ブリッジのペーシング方針そのままに。
      </>
    ),
    patterns: (
      <>
        パターンは三つ、文書化されたドット配置（341 x 262 ドット、色と強調の面、パリティは Even と OddShort の交互）からページ内で生成する。色相帯はランディングのブラウン管写真の元になったフレーム。ストライプはすべてをドット周波数に置き、コムがノッチに差を付ける場所。単色は DC で、二つのラングが一致するべき場所であり、実際に一致する。
      </>
    ),
    refused: (
      <>
        ラングが二つなのは、ブリッジに二つあるからだ: ノッチと、NES 本来の 3 ラインコム。2 ラインコムが無いのは<Link href="/ja/ntsc">ランディング</Link>の述べる理由による: このプロファイルでは原理的に働けず、ブリッジはできないことを黙って劣化した絵にする代わりに、名前を挙げて拒む。
      </>
    ),
    boarded: (commit: string, href: string, tag: string) => (
      <>
        バンドルはボーディングスクリプトが{" "}
        <a data-address href={href}>{commit}</a>
        {tag ? <>（タグ {tag}）</> : null} からビルドし、記録がファイルのハッシュを持つ。このページが走らせるものは、リポジトリのスイートが実測したものだ。
      </>
    ),
  },
} as const;

export default async function BenchPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = ntsc();
  const bundle = r.bundle;
  if (!bundle) {
    // The bench without its bundle would be a page of dead buttons: stop
    // the build, not the reader.
    throw new Error("data/ntsc.json has no bundle; run scripts/board-ntsc.py --wasm");
  }
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;

  return (
    <Shell lang={lang} die="NTSC" title={lang === "ja" ? "ntsc ベンチ" : "The ntsc bench"}>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.slow(r.wasm_fps.notch, r.wasm_fps.comb3, r.wasm_fps.stamp)}</p>

        <Bench lang={lang} />

        <p>{S.patterns}</p>
        <p>{S.refused}</p>
        <p>{S.boarded(commitShort, commitHref, bundle?.tags?.[0] ?? "")}</p>
        <p>
          <Link href={localize(lang, "/ntsc")}>{lang === "ja" ? "実測報告へ戻る" : "Back to the measurement report"}</Link>
        </p>
      </div>
    </Shell>
  );
}
