import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { localize } from "@/lib/lang";
import { shelf, shelfText, type ShelfDoc } from "@/lib/nes-shelves";

/**
 * A shelf of notebook documents on an NES part page: the group's heading,
 * its line, and each document by title with its one-line description.
 * The documents' titles and lines are English in both editions, because
 * their bodies are (docs/ja has no NES translations yet); the heading and
 * the line are the section's own and are translated.
 */
export function Shelf({ lang, group }: { lang: Lang; group: string }) {
  const g = shelf(group);
  const { heading, intro } = shelfText(g, lang);
  return (
    <section data-shelf={group}>
      <h2>{heading}</h2>
      <p>{intro}</p>
      <DocList lang={lang} docs={g.docs} />
    </section>
  );
}

export function DocList({ lang, docs }: { lang: Lang; docs: ShelfDoc[] }) {
  return (
    <ul className="nes-shelf">
      {docs.map((d) => (
        <li key={d.route}>
          <Link href={localize(lang, d.route)}>{d.title}</Link>: {d.description}
        </li>
      ))}
    </ul>
  );
}
