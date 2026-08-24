import type { Metadata } from "next";
import { project, measuredOn } from "@/lib/projects";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /6502: what the project's surfaces are, and where each one answers today.
 *
 * This is a landing page for a move that has not happened. Every surface below
 * is still served from its own subdomain, and this page says so rather than
 * implying otherwise: the `serves_today` column is a link to the thing that
 * actually answers, and the status column says nothing has started.
 *
 * Nothing here is typed. The rows come from data/projects.json, which is the
 * same file PROJECTS.md points at and api/pieces.py is checked against, so
 * "which surfaces this project has" has exactly one answer. Adding a surface
 * to the manifest adds a row here; deleting one removes it. The alternative
 * was a hand-maintained list, which is how ten navs in the 6502 repo drifted
 * three ways before anybody noticed.
 *
 * The proposed landing paths are marked as proposals, because they are. Moving
 * a public path is a redirect map, and writing "/6502/games" here as though it
 * were settled would make it read as decided the next time somebody looks.
 */

export const metadata: Metadata = {
  title: "6502",
  description: "A transistor-level MOS 6502, and the four surfaces built on it.",
};

export default function ProjectPage() {
  const p = project("6502");
  const settled = p.surfaces.filter((s) => s.lands_at_settled).length;
  // Counted, not stated. This page carried the sentence "Nothing has moved
  // yet" for as long as it took five surfaces to move, and the table beside it
  // said "here" on every one of them. A page disagreeing with its own table is
  // the exact failure the rest of this repository is arranged to prevent, and
  // it happened because that sentence was typed.
  const here = p.surfaces.filter((s) => s.status === "here");

  return (
    <Shell die="6502" title={p.name}>
      <main className="prose">
        <div className="chips">
          <span className="measured">
            <b>{p.surfaces.length} surfaces</b> read from data/projects.json, probed {measuredOn()}
          </span>
          <span className={p.status === "serving" ? "tag live" : "tag warn"}>{p.status}</span>
        </div>

        <p>{p.what}</p>

        <p className="notice">
          <b>
            {here.length} of {p.surfaces.length} surfaces are here.
          </b>{" "}
          Every one of them still answers at its own subdomain as well, because
          nothing has been switched off. This page is the plan and the current
          addresses, not a redirect.
        </p>

        <h2>The surfaces</h2>
        <div className="ledger">
          <div className="scroller" tabIndex={0} role="region" aria-label="6502 surfaces">
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
                      {/* data-address marks a link that IS the address rather
                          than a way to read the thing. This column's whole job
                          is to say where each surface answers today, including
                          the ones that have also arrived here, so check-build
                          skips it: an opt-out that names itself, rather than
                          the check quietly not covering this page. */}
                      <a data-address href={s.serves_today}>
                        {s.serves_today.replace("https://", "")}
                      </a>
                    </td>
                    <td>
                      {s.lands_at}{" "}
                      {s.lands_at_settled ? null : (
                        <span className="tag warn">proposed</span>
                      )}
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
            <span>
              {settled} of {p.surfaces.length} landing paths settled
            </span>
            <span>A public path that moves is a redirect map. See PROJECTS.md.</span>
          </div>
        </div>

        <h2>Why this page looks like the rest of the site</h2>
        <p>
          It is the same kit. Projects are siloed by scoping a short list of
          identity tokens to <code>[data-project]</code>, not by forking
          anything: same components, same type scale, same spacing. The 6502
          silo overrides nothing, because the house palette was sampled for this
          work in the first place.
        </p>
        <p>
          What a silo may not touch is the part that carries meaning. Blue is
          ACTIVE, orange is ATTENTION, red is ASSERTION FAILED, and the drive
          ramp is halfphi&rsquo;s <code>Drive</code> enum given colour. A project
          that could redefine those would not have its own accent; it would have
          a failed assertion that looks fine.
        </p>
      </main>
    </Shell>
  );
}
