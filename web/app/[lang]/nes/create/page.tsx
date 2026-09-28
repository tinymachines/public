import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { SiteFooter, WorkbenchBar } from "@/app/components/SiteFrame";
import { PlayTransport } from "../play/PlayTransport";
import { Create } from "./Create";
import "../signal/ntsc.css";
import "../nes.css";

/**
 * /nes/create: the console with every tool on one desk, as windows (owner,
 * 2026-09-24: Play is for playing, Create is "full screen, moveable windows
 * and toolbars with all the functionality we have now"). The bar on top,
 * the tray of windows under it, the desk, and the play page's transport on
 * the floor. On a phone the windows stack and the section strip maps them.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/create");
}

const PROSE = {
  en: {
    title: "Create",
    aboutH: "About this page",
    what: (
      <>
        This is the console from <Link href="/nes/play">the play page</Link> with
        every tool we have for looking inside a game laid out on one desk. Each
        tool is a window: drag it by its bar, pull its bottom corner to size it,
        double-click the bar to fill the desk, and close what you are not using.
        The keys under the site&rsquo;s bar open a closed window again, and Tidy
        puts every window back where it started. Your arrangement is kept in
        this browser.
      </>
    ),
    phone: (
      <>
        On a phone there is no desk: the same tools stand one under another,
        and the strip under the bar takes you to each.
      </>
    ),
    gaps: (
      <>
        The tools are the ones the play page had until they moved here: the screen, the
        cartridge, the CPU, the memory, the palettes, the sprites on screen, the
        code with its captured blocks, and the sprite editor. Two more are this
        desk&rsquo;s own. Record keeps a run of a game, from right where you are
        or from power-on, and Flow plays it back and reads what the code did: its
        routines, its loops, the tables it chose through, what followed the pad,
        and the stretches of the run that looked alike. A run recorded from where
        you are starts from the whole console saved at that moment, kept with the
        recording. Saving and loading a moment on its own, and breakpoints, are
        not here yet; they will arrive as windows on this desk.
      </>
    ),
    back: "Back to the NES console",
  },
  ja: {
    title: "作る",
    aboutH: "このページについて",
    what: (
      <>
        <Link href="/ja/nes/play">遊ぶページ</Link>のコンソールと、ゲームの中を覗くための道具のすべてを、一つの机に並べたもの。道具はそれぞれウィンドウになっている: 上の帯をつかんで動かし、右下の角を引いて大きさを変え、帯をダブルクリックすると机いっぱいに広がる。使わないものは閉じておける。サイトの帯の下にあるキーで閉じたウィンドウをまた開け、「整える」ですべてのウィンドウが最初の位置に戻る。並べ方はこのブラウザに残る。
      </>
    ),
    phone: <>スマートフォンには机が無い: 同じ道具が縦に並び、帯からそれぞれへ飛べる。</>,
    gaps: (
      <>
        道具はここへ移るまで遊ぶページにあったものと同じ: 画面、カートリッジ、CPU、メモリ、パレット、画面上のスプライト、取り込んだブロック付きのコード、そしてスプライトのエディタ。この机だけの道具が二つある。「記録」はゲームの一回の走行を、いまの場面からか電源投入から残し、「フロー」はそれを再生してコードが何をしたかを読む: ルーチン、ループ、選んだテーブル、パッドに続いたもの、そして似ていた区間。いまの場面から記録した走行は、その瞬間に保存したコンソール全体から始まり、その保存は記録と一緒に残る。場面を単独で保存して読み込むことと、ブレークポイントはまだ無い。これらはこの机のウィンドウとして加わる。
      </>
    ),
    back: "NES コンソールへ戻る",
  },
} as const;

export default async function CreatePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  const about = (
    <section className="wb-page play-section" id="about">
      <h2 className="eyebrow">{S.aboutH}</h2>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.phone}</p>
        <p>{S.gaps}</p>
        <p>
          <Link href={localize(lang, "/nes")}>{S.back}</Link>
        </p>
      </div>
    </section>
  );
  return (
    <>
      <div className="workbench has-transport" data-workbench data-create-bench>
        <WorkbenchBar
          lang={lang}
          die="NES"
          title={S.title}
          trail={[
            { href: "/", label: "tinymachines.ai" },
            { href: "/nes", label: lang === "ja" ? "NES コンソール" : "The NES console" },
          ]}
        />
        <div className="wb-main">
          <Create
            lang={lang}
            about={about}
            more={[{ href: localize(lang, "/nes/play"), label: t(lang, surface("nes", "play").nav_label ?? "Play") }]}
          />
          <SiteFooter lang={lang} floor />
        </div>
      </div>
      <PlayTransport lang={lang} />
    </>
  );
}
