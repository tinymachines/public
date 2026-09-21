import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { doors, sections } from "@/lib/doors";
import { Shell } from "@/app/components/SiteFrame";
import "./door.css";

/**
 * /watch, /read, /build: the three doors.
 *
 * One route for the three of them, because they are the same page with a
 * different list: a door is a way in, not a section, and giving each its own
 * file would be three copies of one layout waiting to drift apart. The list
 * itself is data/doors.json (membership only) and every title on the page is
 * read from wherever that page is already named. See lib/doors.ts.
 *
 * Read cold on 2026-09-21, /read named three groups in its opening line and
 * then showed ten entries in one undifferentiated column, eight of which
 * opened another list. So a door's pages come in groups now, each with its
 * own heading, and every entry carries what the crawl measured: the words it
 * shows and the links it hands you. Two pages look alike in a list when one
 * is a read and the other a menu, and those two numbers say which.
 *
 * These paths are new and nothing moves to reach them. A page behind a door
 * keeps the address it has always had, which is what makes this arrangement
 * safe to try: if the doors are wrong, they come out and every link on the
 * site still works.
 */

export function generateStaticParams() {
  return doors().map((d) => ({ door: d.path.slice(1) }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; door: string }> }): Promise<Metadata> {
  const { lang, door: key } = await params;
  const found = doors().find((d) => d.path === `/${key}`);
  if (!found) return {};
  return pageMeta(lang, found.path, { title: found.name, description: found.what });
}

export default async function DoorPage({ params }: { params: Promise<{ lang: Lang; door: string }> }) {
  const { lang, door: key } = await params;
  const found = doors().find((d) => d.path === `/${key}`);
  if (!found) notFound();
  const groups = sections(found);
  const measured = groups.some((g) => g.rows.some((r) => r.words !== undefined));

  return (
    <Shell lang={lang} die={found.short.slice(0, 3).toUpperCase()} title={t(lang, found.name)}>
      <div className="prose">
        <p className="lede">{t(lang, found.what)}</p>
      </div>

      {groups.map((g, i) => (
        <section className="door-group" key={g.name ?? i}>
          {g.name ? (
            <>
              <h2 className="door-h">{t(lang, g.name)}</h2>
              {g.what ? <p className="door-what">{t(lang, g.what)}</p> : null}
            </>
          ) : null}
          <ol className="door-list">
            {g.rows.map((r) => (
              <li key={r.href} className="door-item">
                {g.name ? (
                  <h3>
                    <Link href={localize(lang, r.href)}>{t(lang, r.title)}</Link>
                  </h3>
                ) : (
                  <h2>
                    <Link href={localize(lang, r.href)}>{t(lang, r.title)}</Link>
                  </h2>
                )}
                <p>{t(lang, r.what)}</p>
                <p className="door-met">
                  <code>{r.href}</code>
                  {r.words === undefined ? null : (
                    <span>
                      {r.words.toLocaleString("en")} {t(lang, "words")}
                    </span>
                  )}
                  {r.out === undefined ? null : (
                    <span>
                      {r.out.toLocaleString("en")} {t(lang, r.out === 1 ? "link out" : "links out")}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <div className="prose">
        <p className="door-note">
          {measured
            ? t(
                lang,
                "The words and the links beside each page are counted off the page itself, by the crawl that keeps the site's map. A page with a lot of words and few links is something to read; one with many links is another list.",
              )
            : null}{" "}
          {t(
            lang,
            "A page can be behind two doors: an instrument is a thing to watch and a thing to build on. Every address here is the one it has always had.",
          )}
        </p>
      </div>
    </Shell>
  );
}
