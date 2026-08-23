import type { Metadata } from "next";
import Script from "next/script";
import { Shell } from "../../components/SiteFrame";
import "./console.css";

/**
 * Die Runner, moved from games.tinymachines.ai and dressed in the kit.
 *
 * ## What moved, and what did not
 *
 * The modules did not change. `game.js`, `console.js` and `chr.js` are in
 * public/6502/games/ byte for byte from `tinymachines/6502`, apart from one
 * line in game.js that reads the chip API off this page instead of assuming
 * it is at this origin. It says why at the line. Rewriting them in React was
 * the obvious move and it is the wrong one: they are the console, they are
 * tested where they live, and a second implementation of a cartridge format is
 * how two consoles start disagreeing about what a cartridge is.
 *
 * So this file is markup. It carries the DOM contract game.js was written
 * against, which is sixteen ids, `[data-dir]`, `.legend i` and `header .sub`,
 * and it wears the kit instead of the console's old palette.
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
 * ## Not moved
 *
 * `/builders`, `/b/<handle>` and `/manage` are still on the subdomain. They
 * are the registry's surfaces and they read live data, so moving them is the
 * work tinymachines/6502#9 is about, not a restyle. The links below point at
 * where they actually are, which is the honest thing for a page to do while a
 * move is half done.
 */

const CHIP_API = "https://6502.tinymachines.ai/api";
// The builder pages have not moved. A cartridge linked in with ?cart=
// credits its builder, and that link has to point where they actually
// are rather than at a /b/ this site does not serve.
const BUILDERS = "https://games.tinymachines.ai";

export const metadata: Metadata = {
  title: "Die Runner",
  description: "A console on a transistor-level MOS 6502. Every frame is run on the real die.",
};

export default function GamesPage() {
  return (
    <Shell
      die="RUN"
      title="Die Runner"
      data-chip-api={CHIP_API}
      data-builders-base={BUILDERS}
      /* game.js writes the loaded cartridge's blurb into `header .sub`. The
         selector is its contract, so the element is in the header even though
         the masthead already carries a crumb. */
      navExtra={<span className="sub quiet" />}
    >

      <main className="prose">
        <p>
          A console whose frames are run on a transistor-level MOS 6502. The
          screen is a page of the chip&rsquo;s own memory and nothing draws it
          but this page. The{" "}
          <a href="https://games.tinymachines.ai/builders">builder pages</a> and
          the cartridge editor have not moved and are still on
          games.tinymachines.ai.
        </p>

        <div className="con-stage">
          {/* The screen. Panel, because it is chip memory. */}
          <div className="panel">
            <div className="panel-bar">
              <span>screen</span>
              <span>$0400, 16 x 16</span>
            </div>
            {/* `screen` is a hook, not a style: game.js measures $('.screen')
                to size the canvas to its container. It styles nothing here,
                and renaming it away is exactly what broke the first deploy of
                this page: the console reported "could not boot: Cannot read
                properties of null" and it read as a broken cartridge. */}
            <div className="panel-face con-screen screen">
              <canvas id="screen" width={256} height={256} />
            </div>
          </div>

          <div className="con-side">
            {/* Panel: every figure here came off the engine. */}
            <div className="panel">
              <div className="panel-bar">
                <span>the chip</span>
                <span>measured</span>
              </div>
              <div className="panel-face">
                <div className="con-kv">
                  <span>cartridge</span><b id="k-cart">--</b>
                  <span>score</span><b id="k-score">0</b>
                  <span>half-cycle</span><b id="k-hc">0</b>
                  <span>per frame</span><b id="k-fc">--</b>
                  <span>frames</span><b id="k-frames">0</b>
                  <span>frames / s</span><b id="k-fps">--</b>
                  <span>requests</span><b id="k-req">0</b>
                </div>
                <p className="con-note" id="note">
                  The screen is a page of the chip&rsquo;s own memory. Nothing
                  draws it but this page.
                </p>
                <div className="con-bar">
                  <select className="input data" id="cart" aria-label="Cartridge">
                    <option value="0">Die Runner</option>
                    <option value="1">Silicon Snake</option>
                  </select>
                </div>
                <div className="con-bar">
                  <label className="btn btn-ghost" htmlFor="cart-file">
                    load a .cart.gz
                  </label>
                  <input id="cart-file" type="file" accept=".gz,application/gzip" hidden />
                </div>
                <div className="con-bar">
                  <button className="btn btn-primary" id="b-power" type="button">
                    power on
                  </button>
                  <button className="btn btn-ghost" id="b-pause" type="button" disabled>
                    pause
                  </button>
                </div>
                <p className="con-err" id="err" hidden />
              </div>
            </div>

            {/* Paper: a control surface, not a readout. */}
            <aside className="rail">
              <h3>Controller</h3>
              <div className="pad">
                <button className="btn btn-ghost u" data-dir="up" type="button" aria-label="Up">&uarr;</button>
                <button className="btn btn-ghost l" data-dir="left" type="button" aria-label="Left">&larr;</button>
                <button className="btn btn-ghost d" data-dir="down" type="button" aria-label="Down">&darr;</button>
                <button className="btn btn-ghost r" data-dir="right" type="button" aria-label="Right">&rarr;</button>
              </div>
              <p className="quiet" style={{ fontSize: "0.75rem", marginTop: "0.75rem" }}>
                Arrow keys or WASD. One byte, written into the chip&rsquo;s
                memory between two steps.
              </p>
            </aside>

            {/* Panel: eight switches, sampled on the die that is running. */}
            <div className="panel">
              <div className="panel-bar">
                <span>the gates are real</span>
                <span>sampled</span>
              </div>
              <div className="panel-face">
                <p className="con-note" style={{ marginTop: 0 }}>
                  Every gate is a switch that exists on this die, and it
                  conducts exactly when its own control line is high{" "}
                  <b>on the chip running this game</b>. Nothing simulates a
                  clock phase. The letter is the channel that is open right now.
                </p>
                <div className="gates" id="gates" />
                {/* Painted by game.js from the tiles the screen actually draws
                    from, as data: URLs, so a key cannot show something the
                    screen does not. The `t<N>` class is read by
                    className.slice(1) and must be the only class on the <i>. */}
                <div className="legend">
                  <span><i className="t4" />poly gate: solid, fatal</span>
                  <span><i className="t7" />a channel that is not conducting</span>
                  <span><i className="t6" />one that is</span>
                  <span><i className="t15" />bond pad: the way through</span>
                  <span><i className="t2" />charge packet, worth one</span>
                  <span><i className="t14" />capacitor, worth five</span>
                  <span><i className="t10" />power rail, poly bus, diff well: scenery</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <h2>Why it is slow, and what that measures</h2>
        <p>
          A frame costs <b id="k-cost">600</b> half-cycles, about 0.3&nbsp;ms of
          chip time. Everything else is the round trip: the whole machine
          travels to the engine and back on every frame, because the server
          keeps no sessions. The chip is not the bottleneck by three orders of
          magnitude, and the frame rate above is the round trip being measured
          rather than the die.
        </p>
        <p>
          A cartridge is one gzipped file carrying the ROM, its tiles and the
          contract it was written to. Mint one with{" "}
          <a href="https://6502.tinymachines.ai/api/">POST /v1/cartridge</a>,
          then load it here or link to it with <code>?cart=</code>. The builder
          pages and the editor are still at{" "}
          <a href="https://games.tinymachines.ai/builders">games.tinymachines.ai/builders</a>.
        </p>
      </main>

      {/* type="module" and afterInteractive: game.js is an ES module that reads
          its own URL to resolve rom/ and art/, so it has to be loaded as one
          and it has to be at /6502/games/ for those relative fetches to land.
          A plain <script> tag here would be hoisted by Next and lose both. */}
      <Script src="/6502/games/game.js" type="module" strategy="afterInteractive" />

    </Shell>
  );
}
