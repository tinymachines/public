import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { project } from "@/lib/projects";
import { nes } from "@/lib/nes";
import Image from "next/image";
import { Shell } from "@/app/components/SiteFrame";
import "./nes.css";

/**
 * /nes: the fourth project gets a roof.
 *
 * The console arc as a measurement report: what exists, what each gate
 * proved, and the milestones between here and a bootable console. Its
 * figures are slots filled from data/nes.json, which only
 * scripts/board-nes.py writes, and it writes only what it measured by
 * running the chip repository's own suite and MUTATE run at a pinned
 * commit. No number on this page is typed.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes");
}

const PROSE = {
  en: {
    kinship: (
      <>
        <Link href="/6502">The 6502 work</Link> simulates a chip at its
        switches; <Link href="/ntsc">ntsc-crt</Link> simulates the signal
        between a console and a tube. This project is where they stop being
        neighbours and become one machine: a working NES assembled chip by
        chip, with the contracts between the chips proven by recorded
        reference traces rather than promised by documentation.
      </>
    ),
    contractsH: "The chips share one contract, and a lie about a pin fails the tests",
    contracts: (busHref: string, ppuHref: string) => (
      <>
        <a data-address href={busHref}>nes-bus</a> holds the frame types and
        pin tables every chip crate speaks, dependency-free. These are not
        just compile checks: the PPU&rsquo;s (
        <a data-address href={ppuHref}>2c02</a>) recorded reference run now
        replays through the contract&rsquo;s pin frames, and a built-in
        sabotage that lies about one pin&rsquo;s polarity must make it
        fail.
      </>
    ),
    fifthH: "The fifth chip matches its reference exactly, with no list of exceptions",
    fifth: (r: ReturnType<typeof nes>, repoHref: string) => (
      <>
        <a data-address href={repoHref}>2a03</a> is the NES CPU: a 6502
        core, the clock divider, the audio units, all
        {" "}{r.a0.transistors} transistors over {r.a0.defined_nodes} defined
        nodes, counted identically by two independent parsers. Its recorded
        run replays against the reference simulator bit for bit across{" "}
        {r.a0.golden_states} states with no list of exceptions at all, the
        first chip in the family to
        manage it. Getting there settled a question the engine had carried
        since its first release: the 2A03 forms {r.a0.contested_groups}{" "}
        contested groups at power-on where a layout pull fights an external
        drive, the first nonzero count on any chip, and halfphi{" "}
        {r.halfphi} resolves them the way the silicon does, with the change
        proven unobservable on every other chip.
      </>
    ),
    soundH: "First sound, and the note is exactly the program's",
    sound: (r: ReturnType<typeof nes>) => (
      <>
        A small program of ours runs on the chip through a memory harness
        and makes the square channel sing. The reference&rsquo;s own run of
        the same program replays through the harness bit for bit over{" "}
        {r.first_sound.golden_states} states: the core, the audio units and
        the bus glue under one comparison. And we measured the note itself
        rather than assuming it: the channel&rsquo;s output swings in
        plateaus of exactly{" "}
        {r.first_sound.plateau_half_steps} half-steps, {r.first_sound.plateaus_measured}{" "}
        of them counted, and {r.first_sound.plateau_half_steps} comes
        straight from the program&rsquo;s own timer byte ({r.first_sound.timer_byte}).
        As sabotage, the test harness serves that byte wrong, and both
        checks fail: the replay at the byte&rsquo;s first bus crossing, and
        the plateau count at exactly the number the wrong byte predicts.
      </>
    ),
    soundAlt:
      "Two aligned traces: the square channel's 4-bit output code swinging between 0 and 15 in regular plateaus, and the same run mixed to the AD1 pin's level.",
    soundCaption: (r: ReturnType<typeof nes>) => (
      <>
        The trace we measured: sq0_out sampled every CPU half-step off the
        running chip, and the same run through the transcribed mixer as the
        AD1 pin&rsquo;s level ({r.first_sound.ad1_high} at the top).
        The mixer constants are the nesdev wiki&rsquo;s; we have not yet
        put them on the bench ourselves.
      </>
    ),
    boardedH: "Every number here comes from re-running the tests",
    boardedIntro: (date: string) => (
      <>
        The figures below come from running the chip repository&rsquo;s own
        suite again on {date}, with its netlist and reference runs
        required, plus its MUTATE=1 run, all at the recorded commit; this
        page reads only what that run wrote.
      </>
    ),
    mTests: (n: number) => <>suite: <b>{n} tests green</b></>,
    mReds: (n: number) => <>MUTATE=1: <b>{n} tests red</b></>,
    mHalfphi: (v: string) => <>halfphi: <b>{v}</b></>,
    mCommit: (commit: string, href: string) => (
      <>commit: <b><a data-address href={href}>{commit}</a></b></>
    ),
    aheadH: "The milestones between here and a bootable console",
    ahead: (sketchHref: string) => (
      <>
        The plan is written down and agreed:{" "}
        <a href={sketchHref}>the end-to-end sketch</a> in the contract
        repository, with a check per milestone. Still ahead, in order: the
        PPU&rsquo;s tricky corners (sprite-0, the vblank read race, OAM
        corruption), each pinned by a small crafted trace; the
        2A03&rsquo;s core held to
        the 6502 pin contract in lockstep; the fast per-dot PPU with its
        check stated in frame time; and then the glue, a cartridge, and both
        chips making a frame together. The signal side is already real:{" "}
        <Link href="/ntsc">the ntsc page</Link> carries frames decoded from
        a physical console.
      </>
    ),
    repo: (href: string) => (
      <>
        The repositories are public:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a> and
        its siblings. The chip crates embed die data derived from
        visual6502-family imagery, so NonCommercial and ShareAlike travel
        with them; the contract crate is MIT and embeds nothing.
      </>
    ),
  },
  ja: {
    kinship: (
      <>
        <Link href="/ja/6502">6502 の仕事</Link>はチップをスイッチのレベルで模擬し、<Link href="/ja/ntsc">ntsc-crt</Link> はコンソールとブラウン管の間の信号を模擬する。このプロジェクトは、その二つが隣人であることをやめて一台の機械になる場所だ: 動く NES をチップごとに組み上げ、チップ間の規約は文書の約束ではなく、記録済みのリファレンストレースで証明する。
      </>
    ),
    contractsH: "チップは一つの規約を共有し、ピンについての嘘はテストで落ちる",
    contracts: (busHref: string, ppuHref: string) => (
      <>
        <a data-address href={busHref}>nes-bus</a> は、すべてのチップクレートが話すフレーム型とピン表を依存ゼロで持つ。これは単なるコンパイル検査ではない: PPU（<a data-address href={ppuHref}>2c02</a>）の記録済みリファレンス走行はいま規約のピンフレームを通して再生され、一本のピンの極性について嘘をつく仕込みの妨害は、再生を失敗させなければならない。
      </>
    ),
    fifthH: "五つ目のチップは、例外リストなしにリファレンスと厳密に一致する",
    fifth: (r: ReturnType<typeof nes>, repoHref: string) => (
      <>
        <a data-address href={repoHref}>2a03</a> は NES の CPU: 6502 コア、クロック分周器、音源ユニット、合わせて {r.a0.transistors} 個のトランジスタと {r.a0.defined_nodes} 個の定義済みノードで、二つの独立したパーサが同じ数を数えた。記録済みの走行はリファレンスシミュレータに対し {r.a0.golden_states} 状態をビット単位で、例外リストを一切持たずに再生する。一族で最初のチップだ。そこへ至る途中で、エンジンが初版から抱えていた問いも決着した: 2A03 は電源投入時に、レイアウトのプルと外部駆動が争うグループを {r.a0.contested_groups} 個作る（どのチップでも初のゼロでない数）。halfphi {r.halfphi} はそれをシリコンと同じ向きに解決し、他のどのチップでも観測不能であることが証明されている。
      </>
    ),
    soundH: "最初の音。そして音程はプログラムそのもの",
    sound: (r: ReturnType<typeof nes>) => (
      <>
        うちの小さなプログラムがメモリハーネス越しにチップ上で走り、方形波チャネルを歌わせる。同じプログラムをリファレンス自身が走らせた結果は、ハーネスを通して {r.first_sound.golden_states} 状態をビット単位で再生する: コアと音源ユニットとバスの糊を、一つの比較の下で。そして音程は仮定ではなく、こちらで実測した: チャネルの出力はちょうど {r.first_sound.plateau_half_steps} ハーフステップの台地で振れ、{r.first_sound.plateaus_measured} 個を数えた。{r.first_sound.plateau_half_steps} はプログラム自身のタイマーバイト（{r.first_sound.timer_byte}）から直接来る。妨害としてテストハーネスがそのバイトを偽って供給すると、二つの検査が両方落ちる: 再生はバイトが最初にバスを渡る瞬間に、台地の数は偽のバイトが予言する数そのもので。
      </>
    ),
    soundAlt:
      "揃えた二本のトレース: 方形波チャネルの 4 ビット出力コードが 0 と 15 の間を規則的な台地で振れ、同じ走行がミキサーを通って AD1 ピンのレベルになる。",
    soundCaption: (r: ReturnType<typeof nes>) => (
      <>
        実測したトレース: 走行中のチップから CPU ハーフステップごとに読んだ sq0_out と、同じ走行を転記済みミキサーに通した AD1 ピンのレベル（上端は {r.first_sound.ad1_high}）。ミキサー定数は nesdev wiki のもので、まだ自分たちのベンチには載せていない。
      </>
    ),
    boardedH: "ここの数字は、テストを走らせ直した実測から来ている",
    boardedIntro: (date: string) => (
      <>
        下の数字は {date} に、記録されたコミットでチップリポジトリ自身のスイート（ネットリストとリファレンス走行を必須にして）と MUTATE=1 をもう一度走らせて得たもので、このページはその走行が書いたものだけを読む。
      </>
    ),
    mTests: (n: number) => <>スイート: <b>{n} テスト緑</b></>,
    mReds: (n: number) => <>MUTATE=1: <b>{n} テスト赤</b></>,
    mHalfphi: (v: string) => <>halfphi: <b>{v}</b></>,
    mCommit: (commit: string, href: string) => (
      <>コミット: <b><a data-address href={href}>{commit}</a></b></>
    ),
    aheadH: "ここから起動するコンソールまでのマイルストーン",
    ahead: (sketchHref: string) => (
      <>
        計画は書かれ、合意済みだ: 規約リポジトリの<a href={sketchHref}>エンドツーエンドのスケッチ</a>に、マイルストーンごとの検査がある。これから順に: PPU の厄介な隅（スプライト 0、vblank 読み出しレース、OAM 破損）をそれぞれ小さな専用トレースで留め、2A03 のコアを 6502 ピン規約とロックステップで、フレーム時間で検査を述べる高速なドット単位 PPU、そして糊とカートリッジ、二つのチップが一緒に作る最初のフレーム。信号の側はすでに実在する: <Link href="/ja/ntsc">ntsc のページ</Link>には実機からデコードしたフレームが載っている。
      </>
    ),
    repo: (href: string) => (
      <>
        リポジトリは公開されている:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a> とその兄弟たち。チップクレートは visual6502 系の画像に由来するダイデータを埋め込むため、NonCommercial と ShareAlike が付いて回る。規約クレートは MIT で、何も埋め込まない。
      </>
    ),
  },
} as const;

export default async function NesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const p = project("nes");
  const r = nes();
  const commitShort = r.commit.slice(0, 7);
  const commitHref = `${r.repo}/commit/${r.commit}`;

  return (
    <Shell lang={lang} die="NES" title={p.name}>
      <div className="prose">
        <p>{t(lang, p.what)}</p>

        <p>{S.kinship}</p>

        <h2>{S.contractsH}</h2>
        <p>{S.contracts(r.family.nes_bus, r.family.c2c02)}</p>

        <h2>{S.fifthH}</h2>
        <p>{S.fifth(r, r.repo)}</p>

        <h2>{S.soundH}</h2>
        <p>{S.sound(r)}</p>

        <figure className="crt-figure">
          <Image
            src="/nes/first-sound.png"
            width={1760}
            height={864}
            alt={S.soundAlt}
            // Committed bytes, per the provenance README: served as-is.
            unoptimized
          />
          <figcaption>{S.soundCaption(r)}</figcaption>
        </figure>

        <h2>{S.boardedH}</h2>
        <p>{S.boardedIntro(r.boarded_on)}</p>
        <div className="boarded" data-boarded>
          <span className="measured">{S.mTests(r.tests_green)}</span>
          <span className="measured">{S.mReds(r.mutate_red)}</span>
          <span className="measured">{S.mHalfphi(r.halfphi)}</span>
          <span className="measured">{S.mCommit(commitShort, commitHref)}</span>
        </div>

        <h2>{S.aheadH}</h2>
        <p>{S.ahead(r.family.sketch)}</p>

        <p>{S.repo(r.repo)}</p>
      </div>
    </Shell>
  );
}
