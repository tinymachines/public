import type { Lang } from "@/lib/lang";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { localize, t } from "@/lib/i18n";
import { doors, entries } from "@/lib/doors";
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
  const rows = entries(found);

  return (
    <Shell lang={lang} die={found.short.slice(0, 3).toUpperCase()} title={t(lang, found.name)}>
      <div className="prose">
        <p className="lede">{t(lang, found.what)}</p>
      </div>

      <ol className="door-list">
        {rows.map((r) => (
          <li key={r.href} className="door-item">
            <h2>
              <Link href={localize(lang, r.href)}>{t(lang, r.title)}</Link>
            </h2>
            <p>{t(lang, r.what)}</p>
            <p className="door-where">{r.href}</p>
          </li>
        ))}
      </ol>

      <div className="prose">
        <p className="door-note">
          {t(
            lang,
            "A page can be behind two doors: an instrument is a thing to watch and a thing to build on. Every address here is the one it has always had.",
          )}
        </p>
      </div>
    </Shell>
  );
}
