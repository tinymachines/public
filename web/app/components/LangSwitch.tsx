"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { delocalize, localize, type Lang } from "@/lib/lang";

/**
 * The language switcher: both flags, the current one lit, linking THIS page
 * in the other language.
 *
 * A link rather than a toggle with state: the URL is the language, so
 * switching is navigation and nothing needs storing. The flags are inline
 * SVG rather than emoji because emoji flags render as letters on some
 * platforms, and a control that sometimes reads "JP" in a box is not the
 * control that was designed. The stripes and the disc are drawn at flag
 * proportions but simplified: these are controls, not vexillology.
 */

function FlagUS({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 22 15" aria-hidden="true" className={off ? "flag-off" : undefined}>
      <rect width="22" height="15" fill="#F4F2EC" />
      {[1, 3, 5, 7, 9, 11, 13].map((y) => (
        <rect key={y} y={y} width="22" height="1.1" fill="#B0281B" />
      ))}
      <rect width="9.5" height="8" fill="#0F3FB8" />
    </svg>
  );
}

function FlagJP({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 22 15" aria-hidden="true" className={off ? "flag-off" : undefined}>
      <rect width="22" height="15" fill="#FFFFFF" />
      <circle cx="11" cy="7.5" r="4" fill="#B0281B" />
    </svg>
  );
}

export function LangSwitch({ lang, hard = false }: { lang: Lang; hard?: boolean }) {
  const here = usePathname() ?? "/";
  const { path } = delocalize(here);
  const other: Lang = lang === "ja" ? "en" : "ja";
  const props = {
    className: "lang-switch",
    href: localize(other, path),
    lang: other,
    rel: "alternate",
    "aria-label": other === "ja" ? "日本語版を開く" : "Switch to English",
    title: other === "ja" ? "日本語" : "English",
  };
  const flags = (
    <>
      <FlagUS off={lang !== "en"} />
      <FlagJP off={lang !== "ja"} />
    </>
  );
  // A plain anchor on a page whose module must not survive the navigation
  // (see MenuItem.hard). Same target, same markup, a fresh document.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return hard ? <a {...props}>{flags}</a> : <Link {...props}>{flags}</Link>;
}
