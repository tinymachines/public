import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { localize, t } from "@/lib/i18n";
import { shelf, shelfText, type Shelf as ShelfGroup, type ShelfDoc, type ShelfProject } from "@/lib/nes-shelves";

/**
 * A shelf of notebook documents on an NES part page: the group's heading,
 * its line, and each document by title, its milestone label beside it in
 * small type where it has one, and its one-line description.
 * A document's title and line are said in the reader's language where
 * data/ja.json has them, as /docs/kinds says them: the documents have
 * Japanese bodies now, and a part page listing them in English read as an
 * English page (the cart page fell under the floor when its sixth
 * document arrived, 2026-10-02). One with no answer yet stays English.
 */
export function Shelf({ lang, group, project = "nes" }: { lang: Lang; group: string; project?: ShelfProject }) {
  return <ShelfSection lang={lang} g={shelf(group, project)} />;
}

/** One shelf already read, for a page that draws a project's filled shelves. */
export function ShelfSection({ lang, g }: { lang: Lang; g: ShelfGroup }) {
  const { heading, intro } = shelfText(g, lang);
  return (
    <section data-shelf={g.key}>
      <h2>{heading}</h2>
      <p>{intro}</p>
      <DocList lang={lang} docs={g.docs} />
    </section>
  );
}

/** Where a document shelved by a link lives, said beside it. */
const LIVES: Record<Lang, Record<string, string>> = {
  en: { nes: "in the NES notebook" },
  ja: { nes: "NES のノートにある" },
};

export function DocList({ lang, docs }: { lang: Lang; docs: ShelfDoc[] }) {
  return (
    <ul className="nes-shelf">
      {docs.map((d) => (
        <li key={d.route}>
          <Link href={localize(lang, d.route)}>{t(lang, d.title)}</Link>
          {d.code ? <span className="shelf-code"> {d.code}</span> : null}
          {d.lives ? <span className="shelf-code" data-shelf-lives={d.lives}> {LIVES[lang][d.lives] ?? d.lives}</span> : null}: {t(lang, d.description)}
        </li>
      ))}
    </ul>
  );
}
