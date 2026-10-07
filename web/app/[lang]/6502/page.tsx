import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { arrivedSurfaces, project } from "@/lib/projects";
import { SiteLink } from "@/app/components/SiteLink";
import { LESSON } from "./lesson";
import { TrackGrid } from "./Tracks";
import Link from "next/link";
import { Shell } from "@/app/components/SiteFrame";

/**
 * /6502: the door to the project, and the lesson behind it.
 *
 * Rebuilt 2026-08-25 from a move ledger into a landing. The order is the
 * order a visitor actually takes: get a token, build a cartridge (with the
 * tools you already use, which is what the MCP server is for), publish it
 * and watch the chip measure it, then read the walk to see how one
 * instruction goes through the silicon. Below that, the instruments, grouped
 * the way the explorer's own menu groups them, and the reading.
 *
 * Nothing listed is typed here: the instrument clusters are the explorer's
 * menu, the reading is the docs tree, and the parts table at the foot is the
 * manifest. What IS written is the lesson's copy, in both languages.
 *
 * "Mint a free token" is a real verb since 2026-08-25: the roof API's public
 * mint (POST /api/v1/tokens) hands out the registry's own token, and the
 * editor carries the button.
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

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/6502")
}

export default async function ProjectPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const T = LESSON[lang];
  const p = project("6502");
  const arrived = new Set(arrivedSurfaces(p).map((s) => s.lands_at));

  return (
    <Shell lang={lang} die="6502" title={p.name}>
      <section className="hero">
        <p className="lede">{T.lede}</p>
        <div className="hero-ctas">
          <Link className="btn btn-primary" href={localize(lang, "/6502/manage#mint")}>{T.ctaToken}</Link>
          <Link className="btn btn-ghost" href={localize(lang, "/docs/6502/build-your-first-cart")}>{T.ctaBuild}</Link>
          <Link className="btn btn-ghost" href={localize(lang, "/docs/6502/walk-snake")}>{T.ctaWalk}</Link>
        </div>
      </section>

      {/* The four tracks. Each is a door with its own floor behind it. */}
      <TrackGrid lang={lang} />

      <h2 className="eyebrow">{T.parts}</h2>
      <div className="ledger">
        <div className="scroller" tabIndex={0} role="region" aria-label="6502 parts">
          <table>
            <thead>
              <tr>
                <th>{T.thPart}</th>
                <th>{T.thWhat}</th>
                <th>{T.thToday}</th>
                <th>{T.thLands}</th>
                <th>{T.thStatus}</th>
              </tr>
            </thead>
            <tbody>
              {p.surfaces.map((s) => (
                <tr key={s.key}>
                  <td className="name">{t(lang, s.nav_label ?? s.name)}</td>
                  <td style={{ whiteSpace: "normal", minWidth: "18rem" }}>{t(lang, s.what)}</td>
                  <td>
                    <a data-address href={s.serves_today}>{s.serves_today.replace("https://", "")}</a>
                  </td>
                  <td>
                    {/* A part that has arrived is linked by its path: with
                        the menu down to the site and the projects (owner,
                        2026-09-22) this ledger is the index of the 6502's
                        parts, and an index that prints a path as text is a
                        list, not a way there. e2e/menu.spec.ts checks every
                        arrived surface is linked from here. */}
                    {arrived.has(s.lands_at) ? (
                      <SiteLink lang={lang} href={s.lands_at} hard={s.prerendered === false}>{s.lands_at}</SiteLink>
                    ) : (
                      s.lands_at
                    )}{" "}
                    {s.lands_at_settled ? null : <span className="tag warn">{T.proposed}</span>}
                  </td>
                  <td>
                    <span className={s.status === "here" ? "tag live" : "tag"}>{t(lang, s.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
