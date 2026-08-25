import type { Metadata } from "next";
import { isLang, localize, type Lang, LANGS } from "./lang";
import { t } from "./i18n";
import { surface } from "./projects";

/**
 * What a page tells a search engine, built in one place.
 *
 * Every page used to export a static `metadata` with an English title and an
 * English description, which meant every /ja page described itself in the
 * wrong language and no page said where its canonical URL was or that a
 * twin in the other language existed. This is the one function that says all
 * of it, so a page states its title and its description once and the rest
 * follows:
 *
 *   title         translated through the same overlay as the page's copy
 *   description   the same
 *   canonical     the page's own address, absolute, unprefixed for English
 *   hreflang      both languages plus x-default, so a search in Japanese
 *                 lands on /ja and a search in English never does
 *   Open Graph    the same words, the site's name, the locale
 *
 * The origin is read from the manifest rather than typed here: it is the
 * address the site surface serves at, and the site has one.
 */

export const ORIGIN = new URL(surface("roof", "site").serves_today).origin;

export const SITE_NAME = "tinymachines";

/** The site in one sentence, English; translated where it is used. */
export const SITE_DESCRIPTION =
  "A transistor-level MOS 6502 and the things built on it, and true random bytes from radioactive decay. Everything measured, nothing asserted.";

/** Absolute, and the root without its slash, which is how Next writes the
 * canonical: two spellings of one address would be two addresses. */
export function abs(path: string): string {
  return new URL(path, ORIGIN).toString().replace(/\/$/, "");
}

const LOCALE: Record<Lang, string> = { en: "en_US", ja: "ja_JP" };

export interface PageMeta {
  /** English, as the page names itself; translated on the way out. */
  title: string;
  /** English, one sentence; translated on the way out. */
  description: string;
  /** Keep out of the index (a working reference, an editor, an admin). */
  noindex?: boolean;
  /** An image for the unfurl, site-absolute. Absent means the site's own. */
  image?: string;
  /** Open Graph type. Articles are documentation; everything else is a site. */
  type?: "website" | "article";
}

/**
 * The metadata for one page in one language. `path` is the English path
 * (`/6502/games`), which is the canonical shape of every address here.
 */
export function pageMeta(langIn: string, path: string, m: PageMeta): Metadata {
  const lang: Lang = isLang(langIn) ? langIn : "en";
  const title = t(lang, m.title);
  const description = t(lang, m.description);
  const url = abs(localize(lang, path));
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = abs(localize(l, path));
  languages["x-default"] = abs(path);
  // Until a card is drawn per page (the social stream), the unfurl shows the
  // site's own icon: a square, and a real file, rather than a 1200x630 that
  // does not exist.
  const image = m.image ?? "/icons/icon-512.png";
  const size = m.image ? { width: 1200, height: 630 } : { width: 512, height: 512 };
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: LOCALE[lang],
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => LOCALE[l]),
      type: m.type ?? "website",
      images: [{ url: abs(image), ...size, alt: title }],
    },
    twitter: { card: m.image ? "summary_large_image" : "summary", title, description, images: [abs(image)] },
    ...(m.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
