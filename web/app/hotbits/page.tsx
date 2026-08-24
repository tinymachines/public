import type { Metadata } from "next";
import Link from "next/link";
import { project, measuredOn, serviceOrigin } from "@/lib/projects";
import { Shell } from "../components/SiteFrame";
import { Pool } from "./Pool";
import "./hotbits.css";

/**
 * /hotbits: the second project gets a roof.
 *
 * Structure, not identity. CLAUDE.md is explicit that the style guide, the CSS
 * and the design language are the owner's, and PROJECTS.md says the same thing
 * about this project specifically: style/projects/hotbits.css lists every
 * lever commented out with no values, so that designing hotbits is filling in
 * values rather than working out which values a project is allowed to have.
 *
 * So this page is the house kit with nothing invented. No palette, no display
 * face, no mark. The day that file is filled in, this page changes with it and
 * nothing here is edited, which is the whole point of the silo.
 *
 * What IS here is the part a page can honestly do now: what the thing is, what
 * it has measured in the last second, and where each surface answers. The
 * figures are read from the running instrument rather than typed, for the
 * reason every figure on this site is.
 */

export const metadata: Metadata = {
  title: "hotbits",
  description:
    "True random bytes from radioactive decay: a Geiger counter on a Pi, with bits taken from the timing between events.",
};

export default function HotbitsPage() {
  const p = project("hotbits");
  // Read from the manifest rather than written here: three files would have
  // named the same host otherwise, and the manifest is the one that records
  // the day it moves.
  const api = serviceOrigin("hotbits", "trng");

  return (
    <Shell die="TRNG" title={p.name}>
      <main className="prose">
        <p>{p.what}</p>

        <p>
          Nothing here generates a number. A radioactive source decays, a Geiger
          counter reports each event, and a bit is taken from comparing one
          gap between events with the next: if the first is shorter the bit is
          one, if the second is shorter it is zero, and equal gaps are thrown
          away. The bias cancels by symmetry rather than by correction, which is
          why the raw stream is worth measuring at all.
        </p>

        <Pool api={api} />

        <h2>The surfaces</h2>
        <div className="ledger">
          <div className="scroller" tabIndex={0} role="region" aria-label="hotbits surfaces">
            <table>
              <thead>
                <tr>
                  <th>Surface</th>
                  <th>What it is</th>
                  <th>Answers today</th>
                  <th>Lands at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {p.surfaces.map((s) => (
                  <tr key={s.key}>
                    <td className="name">{s.name}</td>
                    <td style={{ whiteSpace: "normal", minWidth: "18rem" }}>{s.what}</td>
                    <td>
                      <a data-address href={s.serves_today}>
                        {s.serves_today.replace("https://", "")}
                      </a>
                    </td>
                    <td>
                      {s.lands_at}{" "}
                      {s.lands_at_settled ? null : <span className="tag warn">proposed</span>}
                    </td>
                    <td>
                      <span className={s.status === "here" ? "tag live" : "tag"}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tbl-foot">
            <span>read from data/projects.json, probed {measuredOn()}</span>
            <span>A public path that moves is a redirect map. See PROJECTS.md.</span>
          </div>
        </div>

        <h2>The reference</h2>
        <p>
          <Link href="/hotbits/api">The API reference</Link> is generated from
          the instrument&rsquo;s own <code>openapi.json</code> in your browser,
          so it is what the service says about itself right now rather than what
          it said at the last deploy. It also asks what it describes whether it
          is still there, which is how it can report that some of the documented
          endpoints have been retired behind a key and that the ones replacing
          them are not in the schema at all.
        </p>

        <h2>This page has no design yet, and that is deliberate</h2>
        <p>
          It is the house kit with nothing overridden. The palette, the display
          face and the mark for this project are the owner&rsquo;s to make, and{" "}
          <code>style/projects/hotbits.css</code> is waiting with every lever it
          is allowed to pull listed and empty. What a project may not touch is
          the part that carries meaning: blue is ACTIVE, orange is ATTENTION and
          red is ASSERTION FAILED on every project here, and a build check fails
          if a silo reaches past its own tokens.
        </p>
      </main>
    </Shell>
  );
}
