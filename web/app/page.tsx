import Link from "next/link";
import { allPages } from "@/lib/docs";
import { chip } from "@/lib/chip";
import { pieces } from "@/lib/pieces";
import { specimenCount } from "@/lib/zoo";
import { Masthead, SiteNav, SiteFooter } from "./components/SiteFrame";
import { PieceStatus } from "./components/PieceStatus";

/**
 * The front page. START-HERE.md step 4.
 *
 * 6502 work front and centre, which here means the six pieces rather than a
 * pitch about them. The brief's own framing is that six things exist and run
 * and do not know about each other, so the front page is the first place they
 * appear together.
 *
 * Every figure on this page is counted at build time from the thing it
 * describes: the document count from the docs tree, the specimen count from
 * zoo.html, the piece count from data/pieces.json. None of them is typed. That
 * is the rule START-HERE.md sets for prose, applied to the page most likely to
 * be written once and never checked again.
 *
 * The reachability tags are added after render by asking our own API, and the
 * page is complete without them. See components/PieceStatus.tsx.
 *
 * Composed entirely from ../../style/components.css. Nothing is drawn here.
 */

export default function Home() {
  const docs = allPages();
  const specimens = specimenCount();
  const six = pieces();
  const die = chip();
  const hosted = six.filter((p) => p.public_url);

  return (
    <main className="page">
      <Masthead
        die="6502"
        title="tinymachines"
        crumb="A transistor-level MOS 6502"
        meta={<SiteNav here="home" />}
      />

      <section className="prose">
        <p>
          There is no instruction decoder here, no addressing-mode table and no
          cycle-count lookup. There are {die.nodes} wires and{" "}
          {die.transistors} switches on a die photographed out of a physical
          chip, and the behaviour falls out of simulating them. A register
          value is read back off its own storage nodes; a cycle count is
          something that emerged rather than something that was written down.
        </p>
      </section>

      <div className="chips">
        <span className="measured">
          <b>
            {die.nodes} wires, {die.transistors} switches
          </b>{" "}
          measured from the 6502 API on {die.measured_on}
        </span>
        <span className="measured">
          <b>{six.length} pieces</b> from data/pieces.json
        </span>
        <span className="measured">
          <b>{docs.length} documents</b> counted from docs/ at build
        </span>
        <span className="measured">
          <b>{specimens} specimens</b> counted from style/zoo.html at build
        </span>
      </div>

      <h2 className="eyebrow">The six pieces</h2>

      <p className="prose">
        Each one exists and runs. {hosted.length} of the {six.length} answer on
        a public address, and the tag beside those is measured when this page
        loads rather than asserted here. The other {six.length - hosted.length}{" "}
        say why they have no address instead of pretending to be down.
      </p>

      <div className="piece-grid">
        {six.map((p) => (
          <article key={p.key} className="rail">
            <h3>
              {p.name} <PieceStatus pieceKey={p.key} />
            </h3>
            <p>{p.what}</p>
            <dl className="kv">
              <div>
                <dt>Ships as</dt>
                <dd>{p.ships_as}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{p.code_licence}</dd>
              </div>
              <div>
                <dt>Die data</dt>
                <dd>{p.data_terms}</dd>
              </div>
            </dl>
            <p className="piece-links">
              {p.public_url ? (
                <a className="tag" href={p.public_url}>
                  live
                </a>
              ) : null}
              <a className="tag" href={p.source}>
                source
              </a>
            </p>
            {p.not_hosted_because ? (
              <p className="quiet piece-note">{p.not_hosted_because}</p>
            ) : null}
          </article>
        ))}
      </div>

      <h2 className="eyebrow">Where to read</h2>

      <div className="chips">
        <Link className="tag" href="/docs">
          Documentation
        </Link>
        <Link className="tag" href="/style">
          Style guide
        </Link>
        <Link className="tag" href="/style/zoo">
          Widget zoo
        </Link>
        <a className="tag" href="/api/">
          API
        </a>
      </div>

      <p className="notice">
        NonCommercial and ShareAlike travel with everything derived from the
        visual6502 die data, which is every piece above except halfphi. Coins
        are given away and never sold, which is what keeps that question
        closed. See NOTICE.md before anything is published or priced.
      </p>

      <SiteFooter />
    </main>
  );
}
