import type { Metadata } from "next";
import { explorer } from "@/lib/explorer";
import { Shell } from "../../components/SiteFrame";
import { ChipModules } from "./ChipModules";
import "./explorer.css";

/**
 * The 6502 explorer: the die itself, lit by what it is doing.
 *
 * The largest of the five sites and the last to arrive. Read out of
 * `6502/web/index.html` at build time, its stylesheet scoped and its palette
 * remapped, its own masthead and footer dropped because the roof provides
 * both.
 *
 * ## Nothing about the chip is copied into this repository
 *
 * The modules, `layout.bin`, the measured JSON tables and the wasm bundle all
 * stay in `/var/www/6502.tinymachines.ai`, and the apex serves them from
 * there. That is licensing rather than tidiness: the geometry is traced from
 * die photographs and the wasm embeds `netlist.bin`, so all of it is
 * CC BY-NC-SA 3.0, and `NOTICE.md` records that the 6502 repo keeps
 * `extern/visual6502` as a submodule precisely so it does not redistribute
 * that data. An alias is one publisher serving one set of bytes at a second
 * address it also owns; a copy in this repo would be a second publisher.
 *
 * ## One console line, known and left alone
 *
 * Their `app.js` calls `navigator.serviceWorker.register('sw.js')`, which
 * resolves against the document and asks this site for `/6502/sw.js`. There is
 * none, so it 404s and Chrome logs it. The call is wrapped in
 * `.catch(() => {})` so nothing breaks, and the site already has its own
 * worker at `/sw.js` scoped to everything.
 *
 * Not fixed here, because fixing it means either copying their modules into
 * this repo so they can be patched, or serving something at `/6502/sw.js` that
 * would install a SECOND worker scoped to `/6502/` and take those pages away
 * from ours. Both cost more than the line is worth. It goes when the page is
 * rewritten, which is next.
 *
 * ## This is the functional pass, not the finished page
 *
 * The sections are the explorer's own and the headings are its own words. The
 * brief was to get it working and wearing the kit, with the prose to be
 * rewritten afterwards, so nothing here has been reworded or reordered.
 */

export const metadata: Metadata = {
  title: "The explorer",
  description: "A transistor-level MOS 6502, drawn from the die and lit by what it is doing.",
};

export default function ExplorerPage() {
  const { style, body } = explorer();

  return (
    // titleIsHeading is false because the explorer's hero carries the page's
    // own h1. The masthead's title looks identical either way; what changes is
    // which element the document says is its heading.
    <Shell die="DIE" title="The explorer" titleIsHeading={false}>
      {/* The explorer's own 180 KB of rules, with its :root replaced by
          explorer.css and every selector scoped to .explorer-shell. Inline
          rather than a file because, unlike the lab's, this stylesheet is
          served from the 6502 site already and duplicating it as a second
          asset here would be the copy this whole arrangement avoids. */}
      <style dangerouslySetInnerHTML={{ __html: style }} />

      <div className="explorer-shell" dangerouslySetInnerHTML={{ __html: body }} />

      <ChipModules />
    </Shell>
  );
}
