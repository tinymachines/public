import Image from "next/image";
import mark from "../../../assets/halfphi-512.png";
import type { Piece } from "@/lib/pieces";

/**
 * halfphi on the front door. START-HERE.md step 6.
 *
 * It is here rather than three clicks into the docs because it is the piece an
 * outsider can actually pick up: the only one that is cleanly MIT, because it
 * embeds no die data. Everything else in the tree carries NonCommercial and
 * ShareAlike with it.
 *
 * The description is read from data/pieces.json rather than written here.
 * halfphi is one of the six and already has a sentence there; a second copy on
 * the page it is featured on would be the first one to drift.
 *
 * On the mark. The brief expected this to need a cut-out, because the asset
 * README upstream says the dark background is baked in and that a gradient
 * cannot be flood-filled out. Measured before using it: all three assets
 * already carry alpha, 67.6% of the 512 is fully transparent, and the
 * partially transparent edge pixels average a warm gold rather than the dark
 * ground, so there is no halo to remove. It composites clean on paper. See
 * assets/README.md; the upstream note is the thing that needs correcting.
 *
 * So it sits on paper, which is also what STYLE.md section 1 requires: this is
 * a page introducing a piece of software, and "never put marketing copy on a
 * panel" is the rule that keeps a dark box meaning "these values came off the
 * engine".
 */
export function Halfphi({ piece }: { piece: Piece }) {
  return (
    <section className="rail halfphi">
      <Image
        src={mark}
        alt="The halfphi mark: a wave breaking off a DIP package"
        width={180}
        height={180}
        // The one image on the site, above the fold, and the page is otherwise
        // text. Loading it eagerly costs nothing and avoids a reflow.
        priority
      />
      <div>
        <h3>halfphi</h3>
        <p>{piece.what}</p>
        <p className="halfphi-links">
          <a className="tag" href={piece.source}>
            github.com/tinymachines/halfphi
          </a>
          <span className="tag">{piece.code_licence}</span>
          <span className="tag">{piece.ships_as}</span>
        </p>
      </div>
    </section>
  );
}
