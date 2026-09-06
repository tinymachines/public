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
        2A03&rsquo;s and the 2C02&rsquo;s fast rungs on one master clock
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
        what the site&rsquo;s checks run.
      </>
    ),
    rate: (fps: string, x: string, stamp: string) => (
      <>
        Under node on the repository&rsquo;s bench the console with its
        sound runs at {fps} frames a second, {x} times real time ({stamp}).
        In a page the worker also runs the signal path, which is the
        larger half of a frame, so what this browser manages is measured
        live in the readout and the drift counters print what a real
        display would have duplicated or dropped, as the pacing rules
        specify. The native shell moves that half to the GPU;{" "}
        <Link href="/nes">the console page</Link> has its figures.
      </>
    ),
    boarded: (commit: string, href: string, ntscCommit: string, ntscHref: string) => (
      <>
        The console bundle is built from <a data-address href={href}>{commit}</a> by
        our own boarding script, the signal path&rsquo;s from{" "}
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
        リポジトリのコンソールが、このページの中で走る: 2A03 と 2C02 の高速ラングが書き下ろしの糊を通して一つのマスタクロックに乗り、音は基板の音声段を通り、各フレームはコンポジット波形に符号化されて 3 ラインコムで引き剥がされる。ntsc ベンチが走らせるのと同じ信号経路だ。リポジトリのスイートが押さえているのと同じコードを、記録済みコミットから WebAssembly にコンパイルしたもの。
      </>
    ),
    rom: (
      <>
        ここにカートリッジは無い。自分のディスクから .nes ファイルを選ぶ。ファイルはこのブラウザ内のワーカーに読まれ、他のどこへも行かない。読み込めるのはコンソールが持つマッパーである NROM だけで、それ以外は名指しで拒む。サイトの検査が走らせるのはリポジトリ自身のテストカートリッジだ。
      </>
    ),
    rate: (fps: string, x: string, stamp: string) => (
      <>
        リポジトリのベンチの node 上では、音付きのコンソールは毎秒 {fps} フレーム、実時間の {x} 倍で走る（{stamp}）。ページではワーカーが信号経路も走らせ、それがフレームの大きい方の半分なので、このブラウザがこなす分は読み出しで生で測り、ドリフトカウンタは実際のディスプレイなら重複・欠落させたはずの分を、ペーシング規則の通りに表示する。ネイティブのシェルはその半分を GPU に移す。数字は<Link href="/ja/nes">コンソールのページ</Link>に。
      </>
    ),
    boarded: (commit: string, href: string, ntscCommit: string, ntscHref: string) => (
      <>
        コンソールのバンドルはうちの搭載スクリプトが <a data-address href={href}>{commit}</a> からビルドし、信号経路のは <a data-address href={ntscHref}>{ntscCommit}</a> から。記録は両バンドルのファイルハッシュを持つ。コンソールの表はスイッチレベルのチップから測り出したもので、そのダイデータは CC BY-NC-SA であり、それはこのページにも及ぶ: ここには売り物が無い。
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
