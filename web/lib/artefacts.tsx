import fs from "node:fs";
import path from "node:path";
import type { MDXComponents } from "mdx/types";

/**
 * The printable links on a bench document, rendered from one record rather
 * than typed into the page.
 *
 * scripts/pull-nesdocs.mjs builds the bench's drawing packages and writes
 * public/nes/bench/artefacts.json: each package's current file, its label
 * in both languages, and which documents show which. The docs page reads
 * that record when it renders and puts the "Printable:" line under the
 * document's title, in English or Japanese; a paragraph that is exactly
 * `{{artefacts}}` (the section index, in both languages) becomes the whole
 * list.
 *
 * Why here and not in the markdown: the file a package is served as
 * changes with every revision letter, and nine Japanese translations were
 * found linking a revision the pull had withdrawn, a 404 on the live site
 * (2026-09-23). A translation had copied a fact the pull owns. Now no
 * markdown in either language carries the filename.
 *
 * Why here and not in a remark plugin: that was the first shape of this,
 * and it shipped the previous build's links. Turbopack caches a compiled
 * document by the document's own content, so a plugin reading a record
 * the bundler never sees is a plugin whose output goes stale the moment
 * the record moves and the markdown does not, which is exactly a revision
 * bump (rev C, 2026-09-23, caught by check-build). A page component reads
 * the record when the page is generated, on every build.
 */
export type Artefacts = {
  lead: Record<"en" | "ja", string>;
  artefacts: Record<string, { label: Record<"en" | "ja", string>; href: string }>;
  docs: Record<string, string[]>;
};

const RECORD = path.join(process.cwd(), "public", "nes", "bench", "artefacts.json");
const TOKEN = "{{artefacts}}";

/** The record the pull wrote, or null when the bench has not been pulled. */
export function readArtefacts(): Artefacts | null {
  if (!fs.existsSync(RECORD)) return null;
  return JSON.parse(fs.readFileSync(RECORD, "utf8")) as Artefacts;
}

function Printable({ rec, keys, lang, lead }: { rec: Artefacts; keys: string[]; lang: "en" | "ja"; lead: boolean }) {
  const sep = lang === "ja" ? "、" : "; ";
  const stop = lang === "ja" ? "。" : ".";
  return (
    <p data-printable>
      {lead ? <><strong>{rec.lead[lang]}</strong>{" "}</> : null}
      {keys.map((k, i) => {
        const a = rec.artefacts[k];
        if (!a) throw new Error(`artefacts.json names no artefact ${k}`);
        return (
          <span key={k}>
            {i ? sep : ""}
            <a href={a.href}>{a.label[lang]}</a>
          </span>
        );
      })}
      {stop}
    </p>
  );
}

/**
 * The MDX component overrides for one document: the title gets the
 * document's printable line under it, and the `{{artefacts}}` paragraph
 * becomes every package. `file` is the document's path under docs/
 * ("nes/pad-ble.md"), the key the pull wrote; `lang` is the language of
 * the BODY being rendered, so an English fallback under /ja reads English.
 */
export function artefactComponents(file: string, lang: "en" | "ja"): MDXComponents {
  const rec = readArtefacts();
  if (!rec) return {};
  const keys = rec.docs[file];
  return {
    h1: (props: React.ComponentPropsWithoutRef<"h1">) => (
      <>
        <h1 {...props} />
        {keys?.length ? <Printable rec={rec} keys={keys} lang={lang} lead /> : null}
      </>
    ),
    p: (props: React.ComponentPropsWithoutRef<"p">) =>
      // The index's own sentence introduces the list, so no lead word here.
      props.children === TOKEN ? <Printable rec={rec} keys={Object.keys(rec.artefacts)} lang={lang} lead={false} /> : <p {...props} />,
  };
}
