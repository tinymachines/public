import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { t } from "@/lib/i18n";
import { surface } from "@/lib/projects";
import { cartShelf } from "@/lib/nes-shelves";
import { Shell } from "@/app/components/SiteFrame";
import { DocList } from "../Shelf";

/**
 * /nes/cart: the calibration cartridge, as a part of the NES section. Its
 * documents stay at /docs/cart (their addresses are public); this page is
 * the section's door to them, with the ROM and its manifest beside.
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/nes/cart");
}

const PROSE = {
  en: {
    what: (
      <>
        One cartridge of our own, and every screen on it is built to be
        measured. We read it off a real console through the scope, the
        grabber and a camera, and off the model through the same decoder,
        with one tool reading all of them. Every screen carries a strip
        with its own name and frame number drawn into the picture, so a
        capture always says which screen and which frame it is.
      </>
    ),
    rom: (
      <>
        The ROM and its manifest are served here: <a href="/nes/cal.nes">cal.nes</a>{" "}
        and <a href="/nes/cal.json">cal.json</a>, the same bytes the checksums in
        the build tutorial name.
      </>
    ),
    docsH: "The plan, the build, the screens and the boards",
  },
  ja: {
    what: (
      <>
        私たち自身のカートリッジで、その画面はすべて測られるために作られている。実機からはスコープ、グラバー、カメラを通して、模型からは同じデコーダを通して読み、そのすべてを一つの道具が読む。どの画面にも、その名とフレーム番号を絵の中に描いた帯があるので、取り込んだ絵はいつも自分がどの画面のどのフレームかを告げる。
      </>
    ),
    rom: (
      <>
        ROM とそのマニフェストはここで配布している: <a href="/nes/cal.nes">cal.nes</a> と <a href="/nes/cal.json">cal.json</a>。製作手順のチェックサムが指すのと同じバイトだ。
      </>
    ),
    docsH: "計画、製作、画面、そして基板",
  },
} as const;

export default async function NesCartPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="NES" title={t(lang, surface("nes", "cart").name)}>
      <div className="prose">
        <p>{S.what}</p>
        <p>{S.rom}</p>
        <section data-shelf="cart">
          <h2>{S.docsH}</h2>
          <DocList lang={lang} docs={cartShelf()} />
        </section>
      </div>
    </Shell>
  );
}
