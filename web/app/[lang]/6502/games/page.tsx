import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import Script from "next/script";
import { localize } from "@/lib/i18n";
import { chipApi } from "@/lib/projects";
import { ConsoleDriver } from "./ConsoleDriver";
import { Shell } from "./shell/Shell";
import "./console.css";
import "./shell/shell.css";

/**
 * Die Runner, moved from games.tinymachines.ai and dressed in the kit.
 *
 * ## What moved, and what did not
 *
 * The modules did not change. `game.js`, `console.js` and `chr.js` are read
 * out of the 6502 checkout at build time (lib/console-modules.ts, written to
 * public/6502/games/ by scripts/pull-console.mjs), byte for byte apart from
 * two lines in game.js that read the chip API and the builders' base off this
 * page instead of assuming this origin. Rewriting them in React was
 * the obvious move and it is the wrong one: they are the console, they are
 * tested where they live, and a second implementation of a cartridge format is
 * how two consoles start disagreeing about what a cartridge is.
 *
 * So this file is markup. It carries the DOM contract game.js was written
 * against, which is sixteen ids, `[data-dir]`, `.legend i` and `header .sub`,
 * and it wears the kit instead of the console's old palette.
 *
 * ## The shell
 *
 * Since the console-shell pack (notes/console-shell/) the console is a
 * machine drawn around that contract: shell/Shell.tsx solves a layout for
 * the viewport and docks the kit's parts around the glass, and this page's
 * job is to put the contract's elements where the shell expects them. The
 * readouts, gates and legend are the shell's status page; the four elements
 * game.js binds handlers to at load (`#cart`, `#cart-file`, `#b-power`,
 * `#b-pause`) sit OUTSIDE the shell in a hidden block, because a React tree
 * that remounts them would drop those handlers on the floor and nothing
 * would say so.
 *
 * ## Where the two grounds fall, which is not a style choice here
 *
 * STYLE.md section 1: paper is documentation, panel is the machine talking,
 * and a dark box means the value inside it came off the engine. Applied
 * literally: the screen is a page of the chip's own memory, the readout is
 * half-cycles and request counts, and the gate list is eight real switches
 * sampled on the running die, so all three are panel. The legend and the
 * explanations are prose about the machine rather than the machine, so they
 * are paper. Putting the gates on paper would be a rule broken, not a
 * preference.
 *
 * ## The rest of the family
 *
 * `/builders` and `/b/<handle>` arrived with the listings work in
 * tinymachines/6502#11 and are at ../builders. The editor arrived last, at
 * ../manage, once tinymachines/6502#12 taught the service's preflight to
 * admit the Authorization header; until then a browser on this origin could
 * not send a bearer token to that service at all.
 */

// Where the chip API answers, read from data/projects.json rather than
// written out here. Four surfaces name the same host now that the registry
// has arrived, and four literals is three too many. See lib/projects.ts.
const CHIP_API = chipApi();

// The builder pages HAVE moved, and this is the line that says so. game.js
// builds `<base>/b/<handle>` when a cartridge was linked in with ?cart=, so
// an empty-ish base of "/6502" resolves to /6502/b/<handle>, which is the
// path the registry hands out and which redirects to where the page is
// written. It was the games subdomain until this deploy, and a page that has
// moved must not link back to where it used to be as though it were still
// there.
const BUILDERS = "/6502";

/**
 * The built-in cartridges, in the order game.js's own table has them: the
 * option's value is the index it reads. The shelf draws these and the
 * hidden select carries them, from one list.
 */
const CARTS = [
  { value: "0", name: "Die Runner" },
  { value: "1", name: "Silicon Snake" },
];

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/games")
}

/**
 * The page's markup in both voices; the machine's own voice stays as game.js
 * writes it. The readout keys, the boot errors and the cartridge names come
 * from the module that is byte for byte upstream's, so they are its contract,
 * not this page's copy.
 */
const PROSE = {
  en: {
    intro: (b: string, m: string) => (
      <>
        A console whose frames are run on a transistor-level MOS 6502. The
        screen is a page of the chip&rsquo;s own memory and nothing draws it
        but this page. The <Link href={b}>builder pages</Link> and{" "}
        <Link href={m}>the editor</Link> are here too.
      </>
    ),
    theChip: "the chip",
    measured: "measured",
    about: "this console",
    note: (
      <>
        The screen is a page of the chip&rsquo;s own memory. Nothing draws it
        but this page.
      </>
    ),
    powerOn: "power on",
    pause: "pause",
    gatesReal: "the gates are real",
    sampled: "sampled",
    gatesNote: (
      <>
        Every gate is a switch that exists on this die, and it conducts
        exactly when its own control line is high{" "}
        <b>on the chip running this game</b>. Nothing simulates a clock
        phase. The letter is the channel that is open right now.
      </>
    ),
    lg4: "poly gate: solid, fatal",
    lg7: "a channel that is not conducting",
    lg6: "one that is",
    lg15: "bond pad: the way through",
    lg2: "charge packet, worth one",
    lg14: "capacitor, worth five",
    lg10: "power rail, poly bus, diff well: scenery",
    whySlow: "Why it is slow, and what that measures",
    slow: (
      <>
        A frame costs <b id="k-cost">600</b> half-cycles, about 0.3&nbsp;ms of
        chip time. Everything else is the round trip: the whole machine
        travels to the engine and back on every frame, because the server
        keeps no sessions. The chip is not the bottleneck by three orders of
        magnitude, and the frame rate above is the round trip being measured
        rather than the die.
      </>
    ),
    cart: (api: string, b: string, m: string) => (
      <>
        A cartridge is one gzipped file carrying the ROM, its tiles and the
        contract it was written to. Mint one with{" "}
        <a data-address href={`${api}/`}>
          POST /v1/cartridge
        </a>
        , then load it here or link to it with <code>?cart=</code>. Everything
        published so far is on the <Link href={b}>builder pages</Link>, and
        publishing one happens in <Link href={m}>the editor</Link>.
      </>
    ),
  },
  ja: {
    intro: (b: string, m: string) => (
      <>
        トランジスタレベルの MOS 6502 で毎フレームを実行するコンソール。画面はチップ自身のメモリの 1 ページで、それを描くのはこのページだけ。
        <Link href={b}>ビルダーページ</Link>と<Link href={m}>エディタ</Link>
        もここにある。
      </>
    ),
    theChip: "チップ",
    measured: "実測",
    about: "このコンソール",
    note: (
      <>
        画面はチップ自身のメモリの 1 ページ。それを描くのはこのページだけだ。
      </>
    ),
    powerOn: "電源を入れる",
    pause: "一時停止",
    gatesReal: "ゲートは実物",
    sampled: "サンプル済み",
    gatesNote: (
      <>
        どのゲートもこのダイに実在するスイッチで、
        <b>このゲームを走らせている当のチップの上で</b>自分の制御線が high
        の時、正確にその時にだけ導通する。何もクロック位相をシミュレートしない。文字は、いま開いているチャネルだ。
      </>
    ),
    lg4: "ポリのゲート: 塞がっていて、致死",
    lg7: "導通していないチャネル",
    lg6: "導通しているチャネル",
    lg15: "ボンドパッド: 通り道",
    lg2: "電荷パケット、1 点",
    lg14: "コンデンサ、5 点",
    lg10: "電源レール、ポリのバス、拡散ウェル: 背景",
    whySlow: "なぜ遅いのか、そしてそれは何の測定か",
    slow: (
      <>
        1 フレームは <b id="k-cost">600</b> 半サイクル、チップ時間で
        0.3&nbsp;ms ほど。残りはすべて往復だ: サーバがセッションを持たないので、マシン全体が毎フレーム、エンジンまで行って帰ってくる。チップは三桁の差でボトルネックではなく、上のフレームレートはダイではなく往復の測定値だ。
      </>
    ),
    cart: (api: string, b: string, m: string) => (
      <>
        カートリッジは、ROM とタイルと、それが書かれた規約を運ぶ一つの gzip
        ファイルだ。
        <a data-address href={`${api}/`}>
          POST /v1/cartridge
        </a>{" "}
        で鋳造し、ここで読み込むか <code>?cart=</code> でリンクする。これまでに公開されたものは<Link href={b}>ビルダーページ</Link>にあり、公開は
        <Link href={m}>エディタ</Link>で行う。
      </>
    ),
  },
} as const;

export default async function GamesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const B = localize(lang, "/6502/builders");
  const M = localize(lang, "/6502/manage");
  return (
    /* A workbench, like the rest of the instrument suite: the console owns
       the viewport. game.js's contract is honoured twice here: the data
       attributes ride the root it queries for, and `header .sub` exists
       because the bar is wrapped in a real <header> carrying the .sub the
       script writes the cartridge blurb into. */
    /* console-full (owner's call, 2026-08-26): no bar. The console and the
       floor strip are the whole viewport; the page's name is an h1 for the
       document and screen readers, not a band. game.js's contract still
       wants `header .sub` for the cartridge blurb, so the header stays as
       an element with nothing to show. The way out is the strip's own home
       (the browser's back, or the links on the console's status page). */
    <div className="workbench has-transport console-full" data-workbench data-chip-api={CHIP_API} data-builders-base={BUILDERS}>
      <header className="con-head">
        <h1 className="sr-only">Die Runner</h1>
        <span className="sub quiet wb-sub" hidden />
      </header>

      <main className="wb-main shell-main">
        <div className="shell-stage">
          <Shell lang={lang} carts={CARTS}>
            {/* The status page: every figure here came off the engine, and
                the ids are game.js's. */}
            <h3>{S.theChip} · {S.measured}</h3>
            <div className="con-kv">
              <span>cartridge</span><b id="k-cart">--</b>
              <span>score</span><b id="k-score">0</b>
              <span>half-cycle</span><b id="k-hc">0</b>
              <span>per frame</span><b id="k-fc">--</b>
              <span>frames</span><b id="k-frames">0</b>
              <span>frames / s</span><b id="k-fps">--</b>
              <span>requests</span><b id="k-req">0</b>
            </div>
            <p className="con-note" id="note">{S.note}</p>
            <p className="con-err" id="err" hidden />
            <h3>{S.gatesReal} · {S.sampled}</h3>
            <p className="con-note">{S.gatesNote}</p>
            <div className="gates" id="gates" />
            {/* Painted by game.js from the tiles the screen actually draws
                from, as data: URLs, so a key cannot show something the
                screen does not. The `t<N>` class is read by
                className.slice(1) and must be the only class on the <i>. */}
            <div className="legend">
              <span><i className="t4" />{S.lg4}</span>
              <span><i className="t7" />{S.lg7}</span>
              <span><i className="t6" />{S.lg6}</span>
              <span><i className="t15" />{S.lg15}</span>
              <span><i className="t2" />{S.lg2}</span>
              <span><i className="t14" />{S.lg14}</span>
              <span><i className="t10" />{S.lg10}</span>
            </div>
            {/* The page's prose lives on the status page too. Under the
                stage it made the console page scroll, and on a phone the
                first line showed between the console and the strip
                (stash IMG_5445, 2026-08-26): a console that is the whole
                viewport has no floor for prose to sit on. */}
            <h3>{S.about}</h3>
            <p className="con-note">{S.intro(B, M)}</p>
            <h3>{S.whySlow}</h3>
            <p className="con-note">{S.slow}</p>
            <p className="con-note">{S.cart(CHIP_API, B, M)}</p>
          </Shell>
        </div>

        {/* The console's own controls, which game.js binds at load and paints
            its state into. Hidden: the shell's rocker, pills and shelf press
            them, and the floor strip drives them through ConsoleDriver. They
            live outside the shell so nothing ever remounts them. */}
        <div className="con-own-transport" hidden>
          <select className="input data" id="cart" aria-label="Cartridge">
            {CARTS.map((c) => <option key={c.value} value={c.value}>{c.name}</option>)}
          </select>
          <input id="cart-file" type="file" accept=".gz,application/gzip" hidden />
          <button className="btn btn-primary" id="b-power" type="button">{S.powerOn}</button>
          <button className="btn btn-ghost" id="b-pause" type="button" disabled>{S.pause}</button>
        </div>
      </main>

      {/* type="module" and afterInteractive: game.js is an ES module that reads
          its own URL to resolve rom/ and art/, so it has to be loaded as one
          and it has to be at /6502/games/ for those relative fetches to land.
          A plain <script> tag here would be hoisted by Next and lose both. */}
      <Script src="/6502/games/game.js" type="module" strategy="afterInteractive" />

      {/* The console on the one chip store. The strip that drives it is the
          project's, mounted once in the 6502 layout; what it offers here is
          what the driver declares (power, start, play: whole frames over a
          round trip have no half-step). */}
      <ConsoleDriver />

    </div>
  );
}
