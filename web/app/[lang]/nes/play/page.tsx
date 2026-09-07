import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { localize } from "@/lib/i18n";
import { nes } from "@/lib/nes";
import { ntsc } from "@/lib/ntsc";
import { Shell } from "@/app/components/SiteFrame";
import { Play } from "./Play";
import "../../ntsc/ntsc.css";
import "../nes.css";

/**
 * /nes/play: the console in the page. Two boarded bundles in one worker:
 * the console (data/nes.json's wasm_bundle, built by board-nes.py --wasm
 * at the boarded commit, served from build output and never committed
 * because its chip tables are measured from NC-SA die data) and the
 * signal path (the ntsc bench's). The reader supplies the cartridge from
 * their own disk. The prose figures are the record's; the in-page rate is
 * measured live and printed, never promised.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/play");
}

const PROSE = {
  en: {
    what: (
      <>
        The console from the repository, running in this page: the
        fast 2A03 and the fast 2C02 on one master clock
        through the authored glue, the sound through the board&rsquo;s
        audio stage, and every frame encoded to the composite waveform
        and pulled apart by the three-line comb, exactly the signal path
        the ntsc bench runs. It is the same code the repository&rsquo;s
        suites hold, compiled to WebAssembly from the recorded commit.
      </>
    ),
    rom: (
      <>
        There is no cartridge here. Choose a .nes file from your own disk;
        it is read into a worker in this browser and goes nowhere else.
        Only NROM loads, the mapper the console has, and anything else
        is refused by name. The repository&rsquo;s own test cartridge is
        what the site&rsquo;s checks run, and its{" "}
        <a href="/nes/bars.nes">colour-bars cartridge</a> is here to
        download: nobody&rsquo;s game, the twelve hues in thirty-two-dot
        cells at one luma row, the row stepping every two seconds, the
        same file the capture comparison and the bench use.
      </>
    ),
    rate: (fps: string, x: string, stamp: string) => (
      <>
        Under node on the repository&rsquo;s bench the console with its
        sound runs at {fps} frames a second, {x} times real time ({stamp}).
        In a page the console and the signal path run on threads of their
        own, the shape the native shell settled on: the console keeps the
        source&rsquo;s rate against the wall clock and the sound with it,
        and the picture decodes the newest frame at whatever rate this
        browser manages, a frame that arrived while it was busy counted as
        run but not decoded. The readout measures all of it live and the
        drift counters print what a real display would have duplicated or
        dropped, as the pacing rules specify. Where the browser gives the
        picture thread WebGPU, the whole picture runs there: the NES
        encoder as a compute pass (the source&rsquo;s segment map, its
        transcribed levels and its wave rule, ported line for line, the
        levels and the grid taken from the encoder instance) and the comb
        decode as three more, the native shell&rsquo;s shader with the
        display gamma left off, every constant from the decoder instance.
        Before it is used the first frame goes through the bundle&rsquo;s
        own encoder and decoder as well: the readout states by how many
        volts the two encoders differed on any sample and by how many
        bytes of 255 the two decodes did, each against the tolerance it
        had to meet. Without WebGPU, or on a miss, the wasm path paints
        and the readout says so.{" "}
        <Link href="/nes">The console page</Link> has the native
        shell&rsquo;s figures.
      </>
    ),
    boarded: (commit: string, href: string, ntscCommit: string, ntscHref: string) => (
      <>
        The console bundle is built at the recorded commit{" "}
        <a data-address href={href}>{commit}</a> by the same script that
        measures this page&rsquo;s figures, the signal path&rsquo;s from{" "}
        <a data-address href={ntscHref}>{ntscCommit}</a>, and the records carry
        both bundles&rsquo; file hashes. The console&rsquo;s tables were
        measured out of the switch-level chips, whose die data is CC
        BY-NC-SA, and that reaches this page: nothing here is for sale.
      </>
    ),
    back: "Back to the console arc",
  },
  ja: {
    what: (
      <>
        リポジトリのコンソールが、このページの中で走る: 2A03 と 2C02 の高速版が書き下ろしの糊を通して一つのマスタクロックに乗り、音は基板の音声段を通り、各フレームはコンポジット波形に符号化されて 3 ラインコムで引き剥がされる。ntsc ベンチが走らせるのと同じ信号経路だ。リポジトリのスイートが押さえているのと同じコードを、記録済みコミットから WebAssembly にコンパイルしたもの。
      </>
    ),
    rom: (
      <>
        ここにカートリッジは無い。自分のディスクから .nes ファイルを選ぶ。ファイルはこのブラウザ内のワーカーに読まれ、他のどこへも行かない。読み込めるのはコンソールが持つマッパーである NROM だけで、それ以外は名指しで拒む。サイトの検査が走らせるのはリポジトリ自身のテストカートリッジで、その<a href="/nes/bars.nes">カラーバーのカートリッジ</a>はここからダウンロードできる: 誰のゲームでもなく、十二の色相を三十二ドットのセルに一つの輝度行で並べ、行は二秒ごとに進む。捕捉比較とベンチが使うのと同じファイルだ。
      </>
    ),
    rate: (fps: string, x: string, stamp: string) => (
      <>
        リポジトリのベンチの node 上では、音付きのコンソールは毎秒 {fps} フレーム、実時間の {x} 倍で走る（{stamp}）。ページではコンソールと信号経路がそれぞれ自分のスレッドで走る。ネイティブのシェルが落ち着いた形だ: コンソールは壁時計に対してソースのレートを保ち、音もそれに従う。絵はこのブラウザがこなすレートで最新のフレームを復号し、絵が忙しい間に届いたフレームは「走ったが復号されなかった」と数える。読み出しはそのすべてを生で測り、ドリフトカウンタは実際のディスプレイなら重複・欠落させたはずの分を、ペーシング規則の通りに表示する。ブラウザが絵のスレッドに WebGPU を与える場合、絵の全体がそこで走る: NES の符号化器は一つの計算パス（ソースのセグメント表、転写されたレベル、波の規則を一行ずつ移植し、レベルとグリッドは符号化器のインスタンスから取る）、コム復号はさらに三つで、ネイティブのシェルのシェーダから表示ガンマを外したもの、すべての定数は復号器のインスタンスから。使う前に最初のフレームをバンドル自身の符号化器と復号器にも通し、読み出しは二つの符号化器がどの標本でも何ボルト違ったか、二つの復号が 255 分の何バイト違ったかを、それぞれ満たすべき許容とともに述べる。WebGPU が無いか外れた場合は wasm の経路が描き、読み出しがそう告げる。ネイティブのシェルの数字は<Link href="/ja/nes">コンソールのページ</Link>に。
      </>
    ),
    boarded: (commit: string, href: string, ntscCommit: string, ntscHref: string) => (
      <>
        コンソールのバンドルは、このページの数字を測るのと同じスクリプトが記録済みコミット <a data-address href={href}>{commit}</a> からビルドし、信号経路のは <a data-address href={ntscHref}>{ntscCommit}</a> から。記録は両バンドルのファイルハッシュを持つ。コンソールの表はスイッチレベルのチップから測り出したもので、そのダイデータは CC BY-NC-SA であり、それはこのページにも及ぶ: ここには売り物が無い。
      </>
    ),
    back: "コンソールの弧へ戻る",
  },
} as const;

export default async function PlayPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = nes();
  const n = ntsc();
  const bundle = r.console.wasm_bundle;
  if (!bundle) {
    throw new Error("data/nes.json has no console wasm_bundle; run scripts/board-nes.py --wasm");
  }
  const w = r.console.shell.wasm;
  return (
    <Shell lang={lang} die="NES" title={lang === "ja" ? "コンソールを走らせる" : "Play"}>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.rom}</p>

        <Play lang={lang} />

        <p>{S.rate(w.frames_per_s, w.real_time_x, r.boarded_on)}</p>
        <p>{S.boarded(bundle.commit.slice(0, 7), `${r.console.repo}/commit/${bundle.commit}`, n.commit.slice(0, 7), `${n.repo}/commit/${n.commit}`)}</p>
        <p>
          <Link href={localize(lang, "/nes")}>{S.back}</Link>
        </p>
      </div>
    </Shell>
  );
}
