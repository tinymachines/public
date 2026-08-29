import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import Script from "next/script";
import { pageMeta } from "@/lib/seo";
import { chipApi } from "@/lib/projects";
import { ConsoleV2 } from "./ConsoleV2";
import "./consolev2.css";

/**
 * Console v2: the console stripped back to basics, for experiments.
 *
 * The owner's brief (2026-08-28): the shell at /6502/games is hard to use.
 * This is a second console beside it, not a replacement yet: fullscreen,
 * black, one line around the play area, the four movement keys, a screen of
 * cartridges and a screen of settings. No kit shell, no floor strip, no
 * prose. It stays out of the sitemap and the index while it is an
 * experiment (`noindex`), so the site-wide page rules do not apply to it.
 *
 * What it does NOT change: game.js. This page carries the same DOM contract
 * /6502/games does (the sixteen ids, `[data-dir]`, `header .sub`), and the
 * module is the same byte-for-byte upstream module, loaded from the same
 * place. Everything React does here happens AROUND those elements: it never
 * unmounts them, because game.js binds them once at load.
 *
 * The cartridge screen lists more than the two built-ins. The registry has
 * every published cartridge, and the ones that draw a screen (`kind` is
 * `console`, and the chip saw the screen change) are playable here. The
 * headless programs are the explorer's and stay off the shelf. Picking a
 * registry cartridge fetches its .cart.gz and hands it to game.js's own file
 * picker (a File dropped into `#cart-file`), so the module loads it the way
 * it loads any cartridge, with no new entry point.
 */

const CHIP_API = chipApi();
const BUILDERS = "/6502";

/** The built-ins, in game.js's own order: the option's value is its index. */
const CARTS = [
  { value: "0", name: "Die Runner" },
  { value: "1", name: "Silicon Snake" },
];

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502/consolev2", {
    title: "Console v2",
    description: "The console on a transistor-level MOS 6502, stripped back to a screen, four keys and a shelf.",
    noindex: true,
  });
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return (
    <div className="cv2" data-workbench data-chip-api={CHIP_API} data-builders-base={BUILDERS}>
      <header className="cv2-head">
        <h1 className="sr-only">Console v2</h1>
        {/* game.js appends a "by <handle>" link after this when a /b/ path names a cartridge. */}
        <span className="sub" hidden />
      </header>

      <ConsoleV2 lang={lang} carts={CARTS} chipApi={CHIP_API}>
        {/* The play area: everything game.js draws into, and the keys it
            binds at load. This subtree is server markup and never remounts. */}
        <div className="cv2-play">
          <div className="screen cv2-screen">
            <canvas id="screen" width="128" height="128" aria-label="the screen: a page of the chip's memory" />
          </div>
          <div className="cv2-pad" aria-label="movement">
            <button type="button" className="cv2-key" data-dir="up" aria-label="up">&#9650;</button>
            <button type="button" className="cv2-key" data-dir="left" aria-label="left">&#9664;</button>
            <button type="button" className="cv2-key" data-dir="right" aria-label="right">&#9654;</button>
            <button type="button" className="cv2-key" data-dir="down" aria-label="down">&#9660;</button>
          </div>
          <div className="cv2-row">
            <button className="cv2-btn" id="b-power" type="button">power on</button>
            <button className="cv2-btn" id="b-pause" type="button" disabled>pause</button>
          </div>
          <p className="cv2-err" id="err" hidden />
        </div>

        {/* The rest of the contract. The readouts show on the settings
            screen; the two inputs are game.js's own, driven from the shelf. */}
        <div className="cv2-status">
          <div className="cv2-kv">
            <span>cartridge</span><b id="k-cart">--</b>
            <span>score</span><b id="k-score">0</b>
            <span>half-cycle</span><b id="k-hc">0</b>
            <span>per frame</span><b id="k-fc">--</b>
            <span>frame cost</span><b id="k-cost">--</b>
            <span>frames</span><b id="k-frames">0</b>
            <span>frames / s</span><b id="k-fps">--</b>
            <span>requests</span><b id="k-req">0</b>
          </div>
          <div className="cv2-gates" id="gates" />
          <select id="cart" aria-label="Cartridge" hidden>
            {CARTS.map((c) => <option key={c.value} value={c.value}>{c.name}</option>)}
          </select>
          <input id="cart-file" type="file" accept=".gz,application/gzip" hidden />
        </div>
      </ConsoleV2>

      {/* An ES module that resolves rom/ and art/ against its own URL, so it
          is loaded as one from where it lives, exactly as /6502/games does. */}
      <Script src="/6502/games/game.js" type="module" strategy="afterInteractive" />
    </div>
  );
}
