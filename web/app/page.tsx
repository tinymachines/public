import Link from "next/link";
import { allPages } from "@/lib/docs";
import { chip } from "@/lib/chip";
import { pieces } from "@/lib/pieces";
import { arrivedSurfaces, projects } from "@/lib/projects";
import { whereToRead } from "@/lib/nav";
import { specimenCount } from "@/lib/zoo";
import { Shell } from "./components/SiteFrame";
import { PieceStatus } from "./components/PieceStatus";
import { Halfphi } from "./components/Halfphi";

/**
 * The front page. START-HERE.md step 4.
 *
 * 6502 work front and centre, which here means the chip opens the page and
 * its six pieces close it. Between them sits the projects section, decided
 * 2026-08-24: the roof holds more than one project now, and the front page is
 * where a visitor learns that. The projects come from data/projects.json and
 * the pieces from data/pieces.json, and the two lists are different facts: a
 * project is a thing with surfaces on this site, a piece is a part of the
 * 6502 work whether or not it has an address.
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

  // The projects under the roof, from the same manifest the navigation and
  // the API read. The roof itself is not a project a visitor chooses between.
  const under = projects().filter((p) => p.key !== "roof" && p.landing);
  const surfacesHere = under.reduce((n, p) => n + arrivedSurfaces(p).length, 0);

  // START-HERE.md step 6. Read from the list rather than hardcoded, so a key
  // rename is a build failure here instead of a section that quietly vanishes.
  const halfphi = six.find((p) => p.key === "halfphi");
  if (!halfphi) {
    throw new Error(
      'data/pieces.json has no piece keyed "halfphi". The front page features it ' +
        "by name, so this is a build failure rather than a missing section.",
    );
  }

  return (
    <Shell die="6502" title="tinymachines">

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
          <b>
            {under.length} projects, {surfacesHere} surfaces
          </b>{" "}
          from data/projects.json
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

      <h2 className="eyebrow">The projects</h2>

      <p className="prose">
        {under.length} projects live under this roof, with {surfacesHere}{" "}
        surfaces between them. The list and every link below come from the same
        manifest the navigation and the API read, so a project cannot appear
        here and be missing there.
      </p>

      <div className="piece-grid">
        {under.map((p) => {
          // The landing is a surface of its own for some projects; listing it
          // as the overview AND as a surface would be the same door twice.
          const doors = arrivedSurfaces(p).filter((s) => s.lands_at !== p.landing);
          return (
            <article key={p.key} className="rail">
              <h3>{p.name}</h3>
              <p>{p.what}</p>
              <p className="piece-links">
                <Link className="tag live" href={p.landing as string}>
                  overview
                </Link>
                {doors.map((s) =>
                  // Anything this site does not prerender gets a plain anchor,
                  // for the reason the menu gives: the client router cannot
                  // navigate to a route the build never made.
                  s.prerendered === false ? (
                    <a key={s.key} className="tag" href={s.lands_at}>
                      {s.nav_label ?? s.name}
                    </a>
                  ) : (
                    <Link key={s.key} className="tag" href={s.lands_at}>
                      {s.nav_label ?? s.name}
                    </Link>
                  ),
                )}
              </p>
            </article>
          );
        })}
      </div>

      <h2 className="eyebrow">Start here if you build things</h2>

      <Halfphi piece={halfphi} />

      <h2 className="eyebrow">The 6502 work, piece by piece</h2>

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
              {/* Where to READ it, which stopped being the same question as
                  where it has always answered. Two surfaces have moved onto
                  this site and this page was still sending people to their
                  subdomains. See lib/nav.ts. */}
              {(() => {
                const { href, onSite } = whereToRead(p.key, p.public_url);
                if (!href) return null;
                return onSite ? (
                  <Link className="tag live" href={href}>
                    read it here
                  </Link>
                ) : (
                  <a className="tag" href={href}>
                    live
                  </a>
                );
              })()}
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

    </Shell>
  );
}
