import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { autopsy } from "@/lib/autopsy";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /autopsy/method: how a game is taken apart, step by step, what each
 * step cannot see, and what stays on our own machine. The format itself
 * is written down beside the tool (wasm/listing/FORMAT.md); this page
 * says it to a reader.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/autopsy/method");
}

const FORMAT = "/blob/main/wasm/listing/FORMAT.md";

const PROSE = {
  en: {
    what: "Four small tools, each checked against cartridges of our own before it touched anybody else's.",
    listingH: "The listing is the record",
    listing: (
      <>
        A cartridge holds a program and its pictures. The listing writes both
        as text an assembler could take: labels, instructions, and plain bytes
        for everything not known to be code. Whatever we learn goes into the
        comments as marks, and each mark says who found it: the walk from the
        address the console starts at, a run of the game, a rule, or a
        person. There is one check, and it is strict: the file assembles back
        to the cartridge byte for byte. A wrong guess about what is code
        shows up as a failure, not as a plausible page.
      </>
    ),
    format: (href: string) => (
      <>
        The format is written down where the tool lives:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a>.
      </>
    ),
    crawlH: "The crawl plays the game for us",
    crawl: (
      <>
        Reading a cartridge from its starting address finds only what that
        address leads to, and most of a game is reached through tables the
        reading cannot follow. So a program plays it. From a saved position
        it holds each combination of buttons for a moment, watches which
        instructions ran, and keeps the position if any of them had never run
        before. When nothing new runs, it prefers positions where memory took
        values it had not held, because a level has to be walked through
        before its next routine runs. Every position it keeps comes with the
        button presses that reach it, so any finding can be played again.
        Three plain recordings ride along with each crawl: one that touches
        nothing, so the game&rsquo;s own demonstration plays; one that presses
        Start and waits; and one that taps through the menus and then holds
        Right.
      </>
    ),
    runH: "A run says what each routine did",
    run: (
      <>
        Each path the crawl kept is played once more with the console
        recording every access the processor made. From that we know where
        each routine was entered and how, the memory and the hardware it
        touched, where the beam was on the screen when it touched them, and
        which calls chose their destination from a table. We also follow
        every value from the byte of memory it was loaded from, through
        whatever the game copies it into, so we can say which bytes end up
        as a position on the screen, where two of them are compared, what
        gets added into a position, and which byte picked the way through
        a jump table.
      </>
    ),
    rulesH: "The rules read what ran",
    rules: (patterns: React.ReactNode) => (
      <>
        A rule names a routine by what it did, never by what its bytes look
        like. No evidence, no name. Each name carries the numbers the rule
        saw, so a reader can disagree with it. {patterns}
      </>
    ),
    patterns: "The patterns, and how each is told.",
    modelH: "The model is the listing, read back",
    model: (
      <>
        Everything on these pages comes from one file for each game that
        holds the listing&rsquo;s marks and none of its bytes: the routines with
        their names, the tables, the memory they share, and how much of the
        program ran.
      </>
    ),
    staysH: "The bytes stay on our machine",
    stays: (
      <>
        The cartridges are ours, read from carts we own, and their bytes do
        not leave the machine they are on: not the listings, and not the
        recordings of the runs. What is published is shape.
      </>
    ),
    notH: "What it cannot see yet",
    nots: [
      "A short crawl from power-on reaches a small part of a big game. Longer crawls, started past the title screen, are what move the numbers.",
      "Code a game copies into memory and runs there has no place in a listing of the cartridge, so it is left out.",
      "A routine reached by returning to an address the game put on the stack itself is followed as a return, not as a jump through a table.",
      "We name the routine where two positions are compared, but not what the comparison is for. A test for two things touching, an enemy asking which side the player is on and a sort by depth all look the same to the rule.",
    ],
    yoursH: "The desk does this to a run of your own",
    yours: (create: React.ReactNode) => (
      <>
        On the desk at {create}, record a run of a game from your own disk,
        read it, and open the Listing window. It writes that cartridge&rsquo;s
        listing in your browser and shows what these pages show. Nothing is
        sent anywhere.
      </>
    ),
    steps: (steps: string) => <>The survey on these pages used <b>{steps}</b> steps of crawling for each game.</>,
  },
  ja: {
    what: "小さな道具が四つ。どれも、ほかの誰かのものに触れる前に、私たち自身のカートリッジで確かめてある。",
    listingH: "リスティングが記録だ",
    listing: (
      <>
        カートリッジにはプログラムとその絵が入っている。リスティングはその両方を、アセンブラが受け取れるテキストとして書く: ラベル、命令、そしてコードだと分かっていないものはすべて素のバイト。学んだことは何でも、コメントの中の印として入り、どの印も誰が見つけたかを言う: コンソールが動き出すアドレスからの読み進み、ゲームの走行、規則、または人。検査は一つで、厳しい: そのファイルは、一バイトも違わずカートリッジへ組み立て直せる。何がコードかについての間違った推測は、もっともらしいページとしてではなく、失敗として現れる。
      </>
    ),
    format: (href: string) => (
      <>
        形式は、道具のある場所に書いてある:{" "}
        <a data-address href={href}>{href.replace("https://", "")}</a>。
      </>
    ),
    crawlH: "クロールが私たちの代わりにゲームを遊ぶ",
    crawl: (
      <>
        カートリッジを開始アドレスから読むと、そのアドレスが導く先しか見つからない。そしてゲームの大部分は、読むだけでは追えないテーブルを通って届く。だからプログラムが遊ぶ。保存した場面から、ボタンの組み合わせを一つずつ少しの間押し、どの命令が走ったかを見て、まだ一度も走っていなかったものがあればその場面を残す。新しいものが何も走らないときは、メモリがそれまで持ったことのない値を取った場面を選ぶ。面は、次のルーチンが走る前に歩き通さなければならないからだ。残した場面にはどれも、そこへ届くボタン操作が付いているので、どの発見ももう一度再生できる。クロールにはそれぞれ、素朴な記録が三つ付いて行く: 何も触らないもの (ゲーム自身のデモが流れる)、スタートを押して待つもの、メニューを連打で抜けてから右を押し続けるもの。
      </>
    ),
    runH: "走行が、それぞれのルーチンのしたことを語る",
    run: (
      <>
        クロールが残した道筋はどれも、プロセッサのすべてのアクセスをコンソールが記録する状態で、もう一度再生する。そこから分かるのは、それぞれのルーチンがどこでどう入られたか、触れたメモリとハードウェア、触れたときに画面のどこをビームが走っていたか、そしてどの呼び出しが行き先をテーブルから選んだかだ。さらに、すべての値を、読み込まれた元のメモリのバイトから、ゲームが写していく先々を通して追う。だから、どのバイトが画面上の位置になり、そのうちの二つがどこで比べられ、何が位置に足し込まれ、どのバイトがジャンプのテーブルの行き先を選んだかを言える。
      </>
    ),
    rulesH: "規則は、走ったものを読む",
    rules: (patterns: React.ReactNode) => (
      <>
        規則は、ルーチンをしたことで名付ける。バイトがどう見えるかでは決して名付けない。証拠が無ければ、名前も無い。どの名前にも規則が見た数が付いているので、読む人は異を唱えられる。{patterns}
      </>
    ),
    patterns: "パターンと、それぞれの見分け方。",
    modelH: "モデルは、読み戻したリスティングだ",
    model: (
      <>
        これらのページにあるものはすべて、ゲームごとに一つのファイルから来る。そのファイルはリスティングの印を持ち、バイトは一つも持たない: 名前の付いたルーチン、テーブル、共有するメモリ、そしてプログラムのどれだけが走ったか。
      </>
    ),
    staysH: "バイトは私たちの機械に留まる",
    stays: (
      <>
        カートリッジは私たちのもので、私たちが持っているカートから読んだ。そのバイトは、置いてある機械から出ない: リスティングも、走行の記録も出ない。公開するのは形だ。
      </>
    ),
    notH: "まだ見えないもの",
    nots: [
      "電源投入からの短いクロールが届くのは、大きなゲームのごく一部だ。数を動かすのは、タイトル画面の先から始める、もっと長いクロールだ。",
      "ゲームがメモリへ写してそこで走らせるコードは、カートリッジのリスティングの中に居場所が無いので、入れていない。",
      "ゲームが自分でスタックに置いたアドレスへ戻ることで届くルーチンは、テーブル経由のジャンプではなく、戻りとして扱う。",
      "二つの位置を比べるルーチンは名付けるが、その比較が何のためかは名付けない。二つのものが触れたかどうかの判定も、敵がプレイヤーはどちら側かを尋ねるのも、奥行きの順に並べるのも、この規則には同じに見える。",
    ],
    yoursH: "机は、あなた自身の走行にも同じことをする",
    yours: (create: React.ReactNode) => (
      <>
        {create} の机で、自分のディスクにあるゲームの走行を記録し、それを読み、リスティングのウィンドウを開く。ウィンドウはそのカートリッジのリスティングをあなたのブラウザの中で書き、これらのページが見せるものを見せる。どこにも何も送られない。
      </>
    ),
    steps: (steps: string) => <>これらのページの調査は、ゲームごとに <b>{steps}</b> 歩のクロールを使った。</>,
  },
} as const;

export default async function AutopsyMethodPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const r = autopsy();
  // One figure, or the least and the most when games had different budgets.
  const steps =
    typeof r.steps === "number"
      ? r.steps.toLocaleString(lang)
      : `${Math.min(...r.steps).toLocaleString(lang)}${lang === "ja" ? " から " : " to "}${Math.max(...r.steps).toLocaleString(lang)}`;
  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("autopsy", "method").name)}>
      <div className="prose">
        <p>{S.what}</p>

        <h2>{S.listingH}</h2>
        <p>{S.listing}</p>
        <p>{S.format(r.repo + FORMAT)}</p>

        <h2 id="crawl">{S.crawlH}</h2>
        <p>{S.crawl}</p>
        <p>{S.steps(steps)}</p>

        <h2>{S.runH}</h2>
        <p>{S.run}</p>

        <h2>{S.rulesH}</h2>
        <p>{S.rules(<Link href={localize(lang, "/autopsy/patterns")}>{S.patterns}</Link>)}</p>

        <h2>{S.modelH}</h2>
        <p>{S.model}</p>

        <h2>{S.staysH}</h2>
        <p>{S.stays}</p>

        <h2>{S.notH}</h2>
        <ul>
          {S.nots.map((x) => <li key={x}>{x}</li>)}
        </ul>

        <h2>{S.yoursH}</h2>
        <p>{S.yours(<Link href={localize(lang, "/nes/create")}>{t(lang, surface("nes", "create").name)}</Link>)}</p>
      </div>
    </Shell>
  );
}
