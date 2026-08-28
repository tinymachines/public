import Link from "next/link";
import { SiteLink } from "@/app/components/SiteLink";
import type { Lang } from "@/lib/lang";
import { localize, t } from "@/lib/i18n";
import { TRACKS } from "@/lib/tracks";

/**
 * The four tracks as the landing shows them: a name that is a link to the
 * sub-landing, a line, and the headline links. Data from lib/tracks.ts.
 */
export function TrackGrid({ lang }: { lang: Lang }) {
  const more = lang === "ja" ? "すべて見る" : "Everything in";
  return (
    <div className="track-grid">
      {TRACKS.map((tr) => (
        <section key={tr.key} className="track">
          <h2>
            <Link href={localize(lang, tr.path)}>{tr.name[lang]}</Link>
          </h2>
          <p>{tr.what[lang]}</p>
          <p className="piece-links">
            {/* A file is a file, and everything else asks the one rule
                (SiteLink -> isHardRoute). The `hard` flag in lib/tracks.ts
                was a third hand-kept copy of that rule: it named the explorer
                and the tracer and not the Lab or the console, so those two
                were reached through the client router from here. It survives
                as an override for a headline that is not a page. */}
            {tr.headline.map((h) =>
              h.href.endsWith(".md") ? (
                <a key={h.href} className="tag live" href={h.href}>
                  {h.label[lang]}
                </a>
              ) : (
                <SiteLink key={h.href} lang={lang} className="tag live" href={h.href} hard={h.hard}>
                  {h.label[lang]}
                </SiteLink>
              ),
            )}
          </p>
          <p className="track-more">
            <Link href={localize(lang, tr.path)}>
              {lang === "ja" ? `${tr.name[lang]}を${more}` : `${more} ${tr.name[lang]}`} &rarr;
            </Link>
          </p>
        </section>
      ))}
    </div>
  );
}

/** A sub-landing's opening: the track's line, in the page head's voice. */
export function TrackLede({ lang, k }: { lang: Lang; k: string }) {
  const tr = TRACKS.find((x) => x.key === k)!;
  return <p className="lede">{tr.what[lang]}</p>;
}

export { t };
