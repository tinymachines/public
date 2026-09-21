import fs from "node:fs";
import path from "node:path";
import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Shell } from "@/app/components/SiteFrame";
import { Untranslated } from "@/app/components/Untranslated";
import "./map.css";

/**
 * /style/map: the site as a visitor meets it.
 *
 * The owner could not find /nes/playground on the day it was published. It
 * was in the sitemap, in the menu and linked from the front page, and none of
 * that says where a reader would NOT meet it: the NES section it belongs to
 * never mentioned it. Nothing here could answer "how does a reader reach this
 * page", because the answer is not in the tree, it is in the pages.
 *
 * So this is a view of data/site-map.json, which scripts/crawl-site.py writes
 * by fetching every page and following only the links a reader can see. Not a
 * number on this page is typed: the counts, the depths and the findings are
 * derived below from that record, and the record carries the origin and the
 * date it was taken.
 *
 * A house page, like the style guide and the zoo: noindex, and not in the
 * sitemap. It is about the site rather than part of it.
 */

interface Page {
  title: string;
  section: string;
  words: number;
  ja: number | null;
  inbound: number;
  /** Which pages link to it, where there are few enough to name. */
  from?: string[];
  depth: number | null;
  listed: boolean;
  error?: string;
}

interface Record {
  origin: string;
  crawled: string;
  pages: Record_<string, Page>;
}
type Record_<K extends string, V> = { [key in K]: V };

const RECORD = path.join(process.cwd(), "..", "data", "site-map.json");

/** The record, or a build failure: a map of nothing is worse than no map. */
function siteMap(): Record {
  if (!fs.existsSync(RECORD)) {
    throw new Error("data/site-map.json is missing; run python3 scripts/crawl-site.py");
  }
  const parsed = JSON.parse(fs.readFileSync(RECORD, "utf8")) as Record;
  if (Object.keys(parsed.pages ?? {}).length < 20) {
    throw new Error("data/site-map.json holds almost nothing; a crawl that found no site is not a map");
  }
  return parsed;
}

/** Sections in the order a reader meets them, not alphabetically. */
const ORDER = ["front", "nes", "6502", "hotbits", "docs", "style", "other"] as const;
const SECTION_NAME: Record_<string, string> = {
  front: "The front page",
  nes: "The NES console",
  "6502": "The 6502",
  hotbits: "hotbits",
  docs: "The documents",
  style: "The house pages",
  other: "Everything else",
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMeta(lang, "/style/map", {
    title: "The visitor's map",
    description: "Every page this site serves, and how many doors lead to it.",
    noindex: true,
  });
}

export default async function MapPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const record = siteMap();
  const entries = Object.entries(record.pages);
  const pages = entries.filter(([, p]) => !p.error);

  const doorless = pages.filter(([, p]) => p.inbound === 0);
  const oneDoor = pages.filter(([, p]) => p.inbound === 1);
  const japanese = pages.filter(([, p]) => (p.ja ?? 0) >= 0.2);
  const byDepth = new Map<number | null, number>();
  for (const [, p] of pages) byDepth.set(p.depth, (byDepth.get(p.depth) ?? 0) + 1);
  const depths = [...byDepth.entries()]
    .filter(([d]) => d !== null)
    .sort((a, b) => (a[0] as number) - (b[0] as number));
  const most = Math.max(...depths.map(([, n]) => n), 1);
  const unreachable = byDepth.get(null) ?? 0;
  const docs = pages.filter(([, p]) => p.section === "docs");
  const longest = [...pages].sort((a, b) => b[1].words - a[1].words)[0];

  return (
    <Shell lang={lang} die="MAP" title="The visitor's map">
      <Untranslated lang={lang} />
      <div className="prose" lang="en">
        <p>
          Every page this site serves, and how a reader reaches it. Taken by fetching each page and
          following only the links a reader can see: the nav, the header and the footer come out
          first, because a page only the menu knows about is a page nobody finds.
        </p>
        <p className="measured">
          <b>{pages.length}</b> pages from {record.origin}, crawled {record.crawled} by{" "}
          <code>scripts/crawl-site.py</code>
        </p>
      </div>

      <section className="map-tiles" aria-label="The shape of the site">
        {[
          { n: pages.length, k: "pages served, each language counted once" },
          { n: docs.length, k: "of them documents" },
          { n: doorless.length, k: "with no link from any page", warn: true },
          { n: oneDoor.length, k: "with exactly one door in", warn: true },
          { n: japanese.length, k: "with a Japanese body" },
        ].map((t) => (
          <div className="map-tile" key={t.k}>
            <p className={t.warn ? "map-n warn" : "map-n"}>{t.n}</p>
            <p className="map-k">{t.k}</p>
          </div>
        ))}
      </section>

      <section className="map-depth-wrap">
        <h2>How deep the site runs</h2>
        <p className="map-note">Clicks from the front page, through links a reader can see.</p>
        <div className="map-depth" role="img"
          aria-label={`Pages by distance from the front page: ${depths.map(([d, n]) => `${n} at ${d}`).join(", ")}, and ${unreachable} reachable by no link at all.`}>
          {depths.map(([d, n]) => (
            <div key={String(d)} className="map-bar" style={{ height: `${Math.max(4, Math.round((n / most) * 100))}%` }}>
              <span>{n}</span>
              <b>{d}</b>
            </div>
          ))}
          {unreachable ? (
            <div className="map-bar none" style={{ height: `${Math.max(4, Math.round((unreachable / most) * 100))}%` }}>
              <span>{unreachable}</span>
              <b>none</b>
            </div>
          ) : null}
        </div>
      </section>

      <section className="map-findings">
        <h2>What the map says</h2>
        <div className="map-find">
          <p className="map-find-h">Pages with no door at all: {doorless.length}</p>
          <p>
            {doorless.map(([p], i) => (
              <span key={p}>
                {i ? ", " : ""}
                <code>{p}</code>
              </span>
            ))}
            . Nothing on the site links to them, in either language. Some of that is deliberate: a
            bench and an admin console are not pages to arrive at. The rest are finished pages that
            can only be reached by typing the address.
          </p>
        </div>
        <div className="map-find">
          <p className="map-find-h">Pages with one door: {oneDoor.length}</p>
          <p>
            One link away from nobody finding them, and the record names the door, which is where a
            second one would have to go.
          </p>
          <ul className="map-ones">
            {oneDoor.map(([href, p]) => (
              <li key={href}>
                <code>{href}</code> <span>from</span> <code>{p.from?.[0] ?? "somewhere"}</code>
              </li>
            ))}
          </ul>
          <p>
            The longest single page on the site is <code>{longest[0]}</code>, at{" "}
            {longest[1].words.toLocaleString("en")} words.
          </p>
        </div>
        <div className="map-find">
          <p className="map-find-h">
            The documents are {Math.round((docs.length / pages.length) * 100)} percent of the site
          </p>
          <p>
            {docs.length} of {pages.length} pages, nearly all of them the same distance from the
            front and reached through one index. That is the shape of a notebook, which is what they
            are, and it is not a shape that tells a newcomer which of them to read first.
          </p>
        </div>
      </section>

      <section className="map-pages">
        <h2>Every page</h2>
        <p className="map-note">
          Sorted by how many pages link to it, fewest first, so what is hardest to reach is at the
          top of each section. A row marked with a rule has one door or none.
        </p>
        {ORDER.filter((s) => pages.some(([, p]) => p.section === s)).map((s) => {
          const rows = pages
            .filter(([, p]) => p.section === s)
            .sort((a, b) => a[1].inbound - b[1].inbound || b[1].words - a[1].words);
          return (
            <div className="map-group" key={s}>
              <h3>
                {SECTION_NAME[s]} <span>{rows.length}</span>
              </h3>
              <div className="map-rows">
                {rows.map(([href, p]) => (
                  <div className={p.inbound <= 1 ? "map-row thin" : "map-row"} key={href}>
                    <span className="map-name">
                      <Link href={href}>{p.title}</Link>
                      <code>{href}</code>
                    </span>
                    <span className="map-met">
                      <b>{p.inbound}</b> in
                    </span>
                    <span className="map-met map-wide">
                      {p.depth === null ? "no path" : `${p.depth} click${p.depth === 1 ? "" : "s"}`}
                    </span>
                    <span className="map-met map-wide">{p.words.toLocaleString("en")}w</span>
                    <span className="map-ja" title={p.ja === null ? "nothing to measure" : `${Math.round(p.ja * 100)}% Japanese`}>
                      {p.ja === null ? null : (
                        <i className={p.ja < 0.2 ? "low" : undefined} style={{ width: `${Math.round(p.ja * 100)}%` }} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="prose" lang="en">
        <p className="map-note">
          Re-run <code>python3 scripts/crawl-site.py</code> after a deploy that adds or links a page.
          The style guide is <Link href="/style">here</Link>, and the kit it describes is the{" "}
          <Link href="/style/zoo">zoo</Link>.
        </p>
      </div>
    </Shell>
  );
}
