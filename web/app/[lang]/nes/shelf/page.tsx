import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { t } from "@/lib/i18n";
import { localize } from "@/lib/lang";
import { PAGES } from "@/lib/pages";
import { Shell } from "@/app/components/SiteFrame";
import { Manager } from "./Manager";
import "../nes.css";
import "./shelf.css";

/**
 * /nes/shelf: your own cartridges, kept beside your account.
 *
 * The page is a frame around a client component, because everything on it
 * depends on who is signed in and none of that is known at build time. What
 * IS known at build time is what the shelf is and is not, and that is said
 * here, in prose, to everybody: a signed-out reader who lands on this address
 * should learn what it is rather than meet a blank.
 *
 * Out of the index and out of the sitemap (lib/pages.ts, app/sitemap.ts), the
 * way /6502/manage is: a tool that belongs to an account, not a page to
 * arrive at from a search.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/shelf");
}

const PROSE = {
  en: {
    what: (
      <>
        Several pages here ask you for a cartridge: the console you can play,
        and the benches in the playground. If you have dumped cartridges you
        own, this is where you keep them, so that every one of those menus
        offers them by name and you stop picking the same file off your disk.
      </>
    ),
    whose: (
      <>
        A shelf is private to the account it belongs to. Nobody else can list
        it, and nobody else can fetch a file from it: to anybody but you, a
        cartridge on your shelf does not exist. The files are kept on our
        server beside your account and are sent only to your own signed-in
        browser. They are never part of the site, never in its repository, and
        never cached by the pages that load them.
      </>
    ),
    not: (
      <>
        What it does not do. It takes the <code>.nes</code> file and nothing
        else: a separate program and picture file pair is not a cartridge
        until it has a header saying which board it sat on, and we would
        rather refuse one than guess. It does not judge whether the console
        has the board a cartridge names; the console says that itself when the
        cartridge is loaded, and <Link href="/docs/nes/boards">the boards report</Link>{" "}
        says which it has. And it does not change a file: what comes back is
        what you put in, checked against its digest both ways.
      </>
    ),
    back: "Back to the NES console",
  },
  ja: {
    what: (
      <>
        ここにはカートリッジを求めるページがいくつかある。遊べるコンソールと、プレイグラウンドの各ベンチだ。自分が持っているカートリッジをダンプしてあるなら、ここに置いておける。そうすればどのメニューにも名前で並び、同じファイルをディスクから何度も選ばずに済む。
      </>
    ),
    whose: (
      <>
        棚は、それが属するアカウントだけのものだ。ほかの誰も一覧を見られず、ほかの誰もファイルを取り出せない。あなた以外にとって、あなたの棚のカートリッジは存在しない。ファイルは私たちのサーバ上であなたのアカウントの隣に置かれ、サインインしたあなた自身のブラウザにだけ送られる。サイトの一部になることも、リポジトリに入ることも、読み込んだページにキャッシュされることもない。
      </>
    ),
    not: (
      <>
        やらないこと。受け取るのは <code>.nes</code> ファイルだけだ。プログラムと絵を別々にした二つのファイルは、どの基板に載っていたかを言うヘッダが付くまではカートリッジではない。推測するくらいなら断る。カートリッジが名乗る基板をコンソールが持っているかどうかも、ここでは判断しない。それは読み込んだときにコンソール自身が言うことで、どの基板があるかは<Link href="/ja/docs/nes/boards">基板の報告</Link>にある。そしてファイルには手を加えない。戻ってくるのは入れたものそのままで、行きも帰りもダイジェストで確かめている。
      </>
    ),
    back: "NES コンソールへ戻る",
  },
} as const;

export default async function ShelfPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="NES" title={t(lang, PAGES["/nes/shelf"].title)}>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.whose}</p>
      </div>
      <Manager lang={lang} />
      <div className="prose">
        <p>{S.not}</p>
        <p>
          <Link href={localize(lang, "/nes")}>{S.back}</Link>
        </p>
      </div>
    </Shell>
  );
}
