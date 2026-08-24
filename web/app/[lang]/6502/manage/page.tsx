import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { chipApi } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";
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

export default async function ManagePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  return (
    <Shell lang={lang} die="ROM" title="The editor">
      <div className="manage-shell" data-chip-api={CHIP_API}>
        <p className="prose">
          Your page in the registry: claim a handle, write your bio, publish a
          ROM. Everything here talks to the chip API with the token you paste
          below, and a cartridge is run on the chip before it is listed: a ROM
          that does not finish its frames is refused rather than published.
        </p>

        <p className="piece-links">
          <Link className="tag" href="/6502/builders">
            all builders
          </Link>
          <Link className="tag" href="/6502/games">
            the console
          </Link>
          <Link className="tag" href="/6502/api">
            the API reference
          </Link>
        </p>

        <section className="card">
          <p className="eyebrow">Token</p>
          <h2>Who you are</h2>
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
              use it
            </button>
            <button id="signout" className="filebtn" hidden type="button">
              forget it
            </button>
          </div>
          <p className="note">
            Kept in this browser&rsquo;s local storage and sent as a bearer
            header. It is never put in a URL: a URL ends up in history, in a
            Referer and in somebody&rsquo;s log. There is no password to reset,
            so a lost token is re-minted rather than recovered.
          </p>
          <p className="err" id="tok-err" hidden></p>
          <p className="ok" id="tok-ok" hidden></p>
        </section>

        <section className="card" id="claim" hidden>
          <p className="eyebrow">First time</p>
          <h2>Claim a handle</h2>
          <div className="field">
            <label htmlFor="c-handle">handle</label>
            <input className="input" id="c-handle" placeholder="ada" maxLength={32} autoComplete="off" />
            <p className="note">
              This becomes your page: <b id="c-preview">/b/...</b>. Two to
              thirty-two characters, lowercase letters, digits and dashes. One
              token, one handle, and it cannot be changed later.
            </p>
          </div>
          <div className="field">
            <label htmlFor="c-name">display name</label>
            <input className="input" id="c-name" placeholder="Ada" maxLength={64} autoComplete="off" />
          </div>
          <button className="go" id="c-go" type="button">
            claim it
          </button>
          <p className="err" id="c-err" hidden></p>
        </section>

        <div id="editor" hidden>
          <section className="card">
            <p className="eyebrow">Profile</p>
            <h2>
              Your page <span className="muted" id="p-link"></span>
            </h2>
            <div className="two">
              <div>
                <div className="field">
                  <label htmlFor="p-name">display name</label>
                  <input className="input" id="p-name" maxLength={64} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="p-bio">bio</label>
                  <textarea className="input" id="p-bio" maxLength={600} rows={5}></textarea>
                </div>
                <div className="field">
                  <label htmlFor="p-links">
                    links, one per line: label &lt;space&gt; https://url
                  </label>
                  <textarea
                    className="input"
                    id="p-links"
                    rows={3}
                    spellCheck={false}
                    placeholder="site https://example.com"
                  ></textarea>
                  <p className="note">
                    https only. These are printed on a page other people click.
                  </p>
                </div>
              </div>
              <div className="artbox">
                <label>photo</label>
                <canvas
                  id="p-art"
                  className="art"
                  width={64}
                  height={64}
                  style={{ width: 128, height: 128 }}
                ></canvas>
                <label className="filebtn" htmlFor="p-file">
                  choose an image
                </label>
                <input id="p-file" type="file" accept="image/*" hidden />
                <span className="check">
                  <input type="checkbox" id="p-dither" defaultChecked />
                  <label className="inline" htmlFor="p-dither">
                    dither
                  </label>
                </span>
                <p className="note" style={{ maxWidth: "14rem" }}>
                  Converted here, in your browser, to the die&rsquo;s four
                  colours at 64x64. The image itself is never uploaded: what
                  goes up is the tile grid.
                </p>
              </div>
            </div>
            <button className="go" id="p-save" type="button">
              save
            </button>
            <p className="err" id="p-err" hidden></p>
            <p className="ok" id="p-ok" hidden></p>
          </section>

          <section className="card">
            <p className="eyebrow">Publish</p>
            <h2>Add a ROM</h2>
            <div className="two">
              <div>
                <div className="field">
                  <label htmlFor="r-cart">cartridge</label>
                  <label className="filebtn" htmlFor="r-cart">
                    choose a .cart.gz
                  </label>
                  <input id="r-cart" type="file" accept=".gz,application/gzip" hidden />
                  <span className="muted" id="r-cart-name" style={{ marginLeft: 8 }}>
                    nothing chosen
                  </span>
                  <p className="note">
                    Mint one with{" "}
                    <Link href="/6502/api#cartridges">POST /v1/cartridge</Link>.
                    It is run here on the chip before it is listed: a ROM that
                    does not finish its frames is refused rather than
                    published.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="r-slug">slug</label>
                  <input
                    className="input"
                    id="r-slug"
                    maxLength={32}
                    autoComplete="off"
                    placeholder="die-runner"
                  />
                  <p className="note">
                    The URL: <b id="r-preview">/b/.../...</b>. Publishing to a
                    slug you already used replaces that ROM.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="r-title">title</label>
                  <input className="input" id="r-title" maxLength={64} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="r-blurb">description</label>
                  <textarea className="input" id="r-blurb" maxLength={400} rows={3}></textarea>
                </div>
              </div>
              <div className="artbox">
                <label>cover art</label>
                <canvas
                  id="r-art"
                  className="art"
                  width={128}
                  height={96}
                  style={{ width: 256, height: 192 }}
                ></canvas>
                <label className="filebtn" htmlFor="r-file">
                  choose an image
                </label>
                <input id="r-file" type="file" accept="image/*" hidden />
                <span className="check">
                  <input type="checkbox" id="r-dither" defaultChecked />
                  <label className="inline" htmlFor="r-dither">
                    dither
                  </label>
                </span>
                <p className="note" style={{ maxWidth: "16rem" }}>
                  16x12 tiles, 128x96 pixels, four colours. Leave it alone when
                  replacing a ROM and the cover you already have is kept.
                </p>
              </div>
            </div>
            <button className="go" id="r-go" type="button">
              publish
            </button>
            <p className="err" id="r-err" hidden></p>
            <p className="ok" id="r-ok" hidden></p>
          </section>

          <section className="card plain">
            <p className="eyebrow">Yours</p>
            <h2 id="mine-head">Published</h2>
            <div className="mine" id="mine"></div>
          </section>
        </div>

        <p className="notice">
          Tokens are handed out by hand for now, and that is a limitation
          rather than a design. What it does get right: a token is shown once
          and only its SHA-256 is stored, so a copy of the registry is not a
          copy of everybody&rsquo;s credentials.
        </p>
      </div>

      <Script src="/6502/games/manage.js" type="module" strategy="afterInteractive" />
    </Shell>
  );
}
