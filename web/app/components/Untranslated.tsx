import type { Lang } from "@/lib/lang";

/**
 * The sentence a Japanese page prints when its body is still English.
 *
 * It existed once already, written inline in the docs template, and it was
 * right there: a document with no Japanese yet serves its English body under
 * the Japanese chrome and SAYS so, because a 404 would punish the reader for
 * our backlog and machine translation would put words in the owner's mouth.
 *
 * It is a component now because the same fallback happens on 38 more pages
 * and said nothing at all. Measured on the served site, 2026-08-28
 * (`data/check-i18n.py --live`): 25 of 68 pages have a Japanese body, and of
 * the rest, the eighteen ported explorer documents, their article twins, the
 * Lab, the API reference and the style guide all served an English document
 * under a Japanese menu with nothing on the page to say which of the two had
 * failed the reader. The owner's report was "the menu changes and the page
 * does not", which is exactly what that looks like from outside.
 *
 * One copy of the sentence, so the day it is reworded it is reworded once.
 * Renders nothing outside Japanese, so a caller may place it unconditionally
 * on a page that is only ever English.
 */
export function Untranslated({ lang }: { lang: Lang }) {
  if (lang !== "ja") return null;
  return (
    <p className="notice untranslated" lang="ja">
      この文書はまだ翻訳されていません。本文は英語のまま表示されています。
    </p>
  );
}
