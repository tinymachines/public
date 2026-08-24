import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { localize } from "@/lib/i18n";
import { chipApi } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
import { MintToken } from "./MintToken";
import "./manage.css";

/**
 * The editor: a token, a page, and the ROMs on it. Moved from
 * games.tinymachines.ai/manage, the last of the games surfaces to arrive.
 *
 * It could not move with the others, and the reason was a header rather than
 * a decision: editing sends a bearer token, and the chip API's preflight
 * refused `authorization`, so a browser on this origin never got to send the
 * request at all. tinymachines/6502#12 records it; fixed there 2026-08-24,
 * and this page is what the fix was for.
 *
 * Same arrangement as the console: `manage.js`, `registry.js` and `art.js`
 * are in public/6502/games/ from tinymachines/6502, byte for byte apart from
 * registry.js's API line, which reads the chip API off this page the way
 * game.js does and says why at the line. This file is markup carrying the
 * DOM contract manage.js was written against: the ids, `#mine`, and the
 * `.err`/`.ok` pairs its `say()` toggles.
 *
 * The `/b/...` previews and play links the script writes are the registry's
 * own short addresses. They work here because the redirect map answers them:
 * /6502/b/<handle> is the builder page and /6502/b/<handle>/<slug> is the
 * console with that cartridge loaded, so the address the registry hands out
 * is an address on this site too.
 */

const CHIP_API = chipApi();

export const metadata: Metadata = {
  title: "The editor",
  description:
    "Claim a handle, edit your page, publish a ROM. The cartridge is run on the chip before it is listed.",
};

/**
 * The page's own markup speaks both languages; manage.js does not. The
 * script is byte for byte from tinymachines/6502 and its runtime messages
 * (the errors, the publish progress, the ROM rows) stay in its voice, because
 * translating them would fork a module whose whole arrangement is that it is
 * not forked. The site-wide notice on /ja already says untranslated text
 * appears in English.
 */
const PROSE = {
  en: {
    intro: (
      <>
        Your page in the registry: claim a handle, write your bio, publish a
        ROM. Everything here talks to the chip API with the token you paste
        below, and a cartridge is run on the chip before it is listed: a ROM
        that does not finish its frames is refused rather than published.
      </>
    ),
    allBuilders: "all builders",
    theConsole: "the console",
    theApiRef: "the API reference",
    token: "Token",
    whoYouAre: "Who you are",
    useIt: "use it",
    forgetIt: "forget it",
    tokenNote: (
      <>
        Kept in this browser&rsquo;s local storage and sent as a bearer
        header. It is never put in a URL: a URL ends up in history, in a
        Referer and in somebody&rsquo;s log. There is no password to reset,
        so a lost token is re-minted rather than recovered.
      </>
    ),
    firstTime: "First time",
    claimHandle: "Claim a handle",
    handle: "handle",
    handleNote: (
      <>
        This becomes your page: <b id="c-preview">/b/...</b>. Two to
        thirty-two characters, lowercase letters, digits and dashes. One
        token, one handle, and it cannot be changed later.
      </>
    ),
    displayName: "display name",
    claimIt: "claim it",
    profile: "Profile",
    yourPage: "Your page",
    bio: "bio",
    linksLabel: <>links, one per line: label &lt;space&gt; https://url</>,
    linksNote: "https only. These are printed on a page other people click.",
    photo: "photo",
    chooseImage: "choose an image",
    dither: "dither",
    photoNote: (
      <>
        Converted here, in your browser, to the die&rsquo;s four colours at
        64x64. The image itself is never uploaded: what goes up is the tile
        grid.
      </>
    ),
    save: "save",
    publish: "Publish",
    addRom: "Add a ROM",
    cartridge: "cartridge",
    chooseCart: "choose a .cart.gz",
    mintNote: (href: string) => (
      <>
        Mint one with <Link href={href}>POST /v1/cartridge</Link>. It is run
        here on the chip before it is listed: a ROM that does not finish its
        frames is refused rather than published.
      </>
    ),
    slug: "slug",
    slugNote: (
      <>
        The URL: <b id="r-preview">/b/.../...</b>. Publishing to a slug you
        already used replaces that ROM.
      </>
    ),
    title: "title",
    description: "description",
    coverArt: "cover art",
    coverNote: (
      <>
        16x12 tiles, 128x96 pixels, four colours. Leave it alone when
        replacing a ROM and the cover you already have is kept.
      </>
    ),
    publishBtn: "publish",
    yours: "Yours",
    published: "Published",
    notice: (
      <>
        A token is minted above, free, a couple per address a day. It is shown
        once and only its SHA-256 is stored.
      </>
    ),
  },
  ja: {
    intro: (
      <>
        レジストリ上のあなたのページ: ハンドルを取得し、bio を書き、ROM を公開する。ここにあるすべては、下に貼るトークンでチップ API と話す。そしてカートリッジは掲載の前にチップ上で走らされる: フレームを完了しない ROM は、公開される代わりに拒まれる。
      </>
    ),
    allBuilders: "ビルダー一覧",
    theConsole: "コンソール",
    theApiRef: "API リファレンス",
    token: "トークン",
    whoYouAre: "あなたは誰か",
    useIt: "使う",
    forgetIt: "忘れる",
    tokenNote: (
      <>
        このブラウザのローカルストレージに保存され、bearer ヘッダとして送信される。URL には決して載せない: URL は履歴に、Referer に、誰かのログに残るからだ。リセットするパスワードは無いので、失くしたトークンは復元ではなく再鋳造される。
      </>
    ),
    firstTime: "初回",
    claimHandle: "ハンドルを取得する",
    handle: "ハンドル",
    handleNote: (
      <>
        これがあなたのページになる: <b id="c-preview">/b/...</b>。2 から 32
        文字、小文字と数字とダッシュ。トークン一つにハンドル一つ、後から変更はできない。
      </>
    ),
    displayName: "表示名",
    claimIt: "取得する",
    profile: "プロフィール",
    yourPage: "あなたのページ",
    bio: "bio",
    linksLabel: <>リンク、1 行に 1 件: ラベル &lt;空白&gt; https://url</>,
    linksNote: "https のみ。他の人がクリックするページに印字される。",
    photo: "写真",
    chooseImage: "画像を選ぶ",
    dither: "ディザ",
    photoNote: (
      <>
        このブラウザの中で、ダイの 4 色、64x64 に変換される。画像そのものはアップロードされない: 上がるのはタイルのグリッドだ。
      </>
    ),
    save: "保存",
    publish: "公開",
    addRom: "ROM を追加する",
    cartridge: "カートリッジ",
    chooseCart: ".cart.gz を選ぶ",
    mintNote: (href: string) => (
      <>
        <Link href={href}>POST /v1/cartridge</Link> で鋳造する。掲載の前にここでチップ上を走らされる: フレームを完了しない ROM は、公開される代わりに拒まれる。
      </>
    ),
    slug: "スラッグ",
    slugNote: (
      <>
        URL はこうなる: <b id="r-preview">/b/.../...</b>。使用済みのスラッグに公開すると、その ROM を置き換える。
      </>
    ),
    title: "タイトル",
    description: "説明",
    coverArt: "カバーアート",
    coverNote: (
      <>
        16x12 タイル、128x96 ピクセル、4 色。ROM を置き換える時に触らなければ、いまのカバーがそのまま残る。
      </>
    ),
    publishBtn: "公開する",
    yours: "あなたの",
    published: "公開済み",
    notice: (
      <>
        トークンは上で鋳造できる。無料で、アドレスあたり一日に数個まで。
        表示は一度だけで、保存されるのはその SHA-256 だけだ。
      </>
    ),
  },
} as const;

export default async function ManagePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const S = PROSE[lang];
  return (
    <Shell lang={lang} die="ROM" title="The editor">
      <div className="manage-shell" data-chip-api={CHIP_API}>
        <p className="prose">{S.intro}</p>

        <p className="piece-links">
          <Link className="tag" href={localize(lang, "/6502/builders")}>
            {S.allBuilders}
          </Link>
          <Link className="tag" href={localize(lang, "/6502/games")}>
            {S.theConsole}
          </Link>
          <Link className="tag" href={localize(lang, "/6502/api")}>
            {S.theApiRef}
          </Link>
        </p>

        <MintToken lang={lang} />
        <section className="card">
          <p className="eyebrow">{S.token}</p>
          <h2>{S.whoYouAre}</h2>
          <div className="row">
            <input
              className="input"
              id="token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="tm6502_..."
              style={{ flex: "1 1 18rem" }}
            />
            <button id="signin" className="go" type="button">
              {S.useIt}
            </button>
            <button id="signout" className="filebtn" hidden type="button">
              {S.forgetIt}
            </button>
          </div>
          <p className="note">{S.tokenNote}</p>
          <p className="err" id="tok-err" hidden></p>
          <p className="ok" id="tok-ok" hidden></p>
        </section>

        <section className="card" id="claim" hidden>
          <p className="eyebrow">{S.firstTime}</p>
          <h2>{S.claimHandle}</h2>
          <div className="field">
            <label htmlFor="c-handle">{S.handle}</label>
            <input className="input" id="c-handle" placeholder="ada" maxLength={32} autoComplete="off" />
            <p className="note">{S.handleNote}</p>
          </div>
          <div className="field">
            <label htmlFor="c-name">{S.displayName}</label>
            <input className="input" id="c-name" placeholder="Ada" maxLength={64} autoComplete="off" />
          </div>
          <button className="go" id="c-go" type="button">
            {S.claimIt}
          </button>
          <p className="err" id="c-err" hidden></p>
        </section>

        <div id="editor" hidden>
          <section className="card">
            <p className="eyebrow">{S.profile}</p>
            <h2>
              {S.yourPage} <span className="muted" id="p-link"></span>
            </h2>
            <div className="two">
              <div>
                <div className="field">
                  <label htmlFor="p-name">{S.displayName}</label>
                  <input className="input" id="p-name" maxLength={64} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="p-bio">{S.bio}</label>
                  <textarea className="input" id="p-bio" maxLength={600} rows={5}></textarea>
                </div>
                <div className="field">
                  <label htmlFor="p-links">{S.linksLabel}</label>
                  <textarea
                    className="input"
                    id="p-links"
                    rows={3}
                    spellCheck={false}
                    placeholder="site https://example.com"
                  ></textarea>
                  <p className="note">{S.linksNote}</p>
                </div>
              </div>
              <div className="artbox">
                <label>{S.photo}</label>
                <canvas
                  id="p-art"
                  className="art"
                  width={64}
                  height={64}
                  style={{ width: 128, height: 128 }}
                ></canvas>
                <label className="filebtn" htmlFor="p-file">
                  {S.chooseImage}
                </label>
                <input id="p-file" type="file" accept="image/*" hidden />
                <span className="check">
                  <input type="checkbox" id="p-dither" defaultChecked />
                  <label className="inline" htmlFor="p-dither">
                    {S.dither}
                  </label>
                </span>
                <p className="note" style={{ maxWidth: "14rem" }}>
                  {S.photoNote}
                </p>
              </div>
            </div>
            <button className="go" id="p-save" type="button">
              {S.save}
            </button>
            <p className="err" id="p-err" hidden></p>
            <p className="ok" id="p-ok" hidden></p>
          </section>

          <section className="card">
            <p className="eyebrow">{S.publish}</p>
            <h2>{S.addRom}</h2>
            <div className="two">
              <div>
                <div className="field">
                  <label htmlFor="r-cart">{S.cartridge}</label>
                  <label className="filebtn" htmlFor="r-cart">
                    {S.chooseCart}
                  </label>
                  <input id="r-cart" type="file" accept=".gz,application/gzip" hidden />
                  <span className="muted" id="r-cart-name" style={{ marginLeft: 8 }}>
                    nothing chosen
                  </span>
                  <p className="note">{S.mintNote(localize(lang, "/6502/api#cartridges"))}</p>
                </div>
                <div className="field">
                  <label htmlFor="r-slug">{S.slug}</label>
                  <input
                    className="input"
                    id="r-slug"
                    maxLength={32}
                    autoComplete="off"
                    placeholder="die-runner"
                  />
                  <p className="note">{S.slugNote}</p>
                </div>
                <div className="field">
                  <label htmlFor="r-title">{S.title}</label>
                  <input className="input" id="r-title" maxLength={64} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="r-blurb">{S.description}</label>
                  <textarea className="input" id="r-blurb" maxLength={400} rows={3}></textarea>
                </div>
              </div>
              <div className="artbox">
                <label>{S.coverArt}</label>
                <canvas
                  id="r-art"
                  className="art"
                  width={128}
                  height={96}
                  style={{ width: 256, height: 192 }}
                ></canvas>
                <label className="filebtn" htmlFor="r-file">
                  {S.chooseImage}
                </label>
                <input id="r-file" type="file" accept="image/*" hidden />
                <span className="check">
                  <input type="checkbox" id="r-dither" defaultChecked />
                  <label className="inline" htmlFor="r-dither">
                    {S.dither}
                  </label>
                </span>
                <p className="note" style={{ maxWidth: "16rem" }}>
                  {S.coverNote}
                </p>
              </div>
            </div>
            <button className="go" id="r-go" type="button">
              {S.publishBtn}
            </button>
            <p className="err" id="r-err" hidden></p>
            <p className="ok" id="r-ok" hidden></p>
          </section>

          <section className="card plain">
            <p className="eyebrow">{S.yours}</p>
            <h2 id="mine-head">{S.published}</h2>
            <div className="mine" id="mine"></div>
          </section>
        </div>

        <p className="notice">{S.notice}</p>
      </div>

      <Script src="/6502/games/manage.js" type="module" strategy="afterInteractive" />
    </Shell>
  );
}
