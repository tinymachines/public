"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { delocalize, localize, type Lang } from "@/lib/lang";

/**
 * The language switcher: one control, linking THIS page in the other
 * language.
 *
 * A link rather than a toggle with state, deliberately. The URL is the
 * language (that was the /ja design decision), so switching is navigation and
 * nothing needs storing: a reader lands where they were, in the other
 * tongue, with an address they can share. The label names the language you
 * would be switching TO, written in that language, because a reader hunting
 * for their own language should find a word they can read.
 */
export function LangSwitch({ lang }: { lang: Lang }) {
  const here = usePathname() ?? "/";
  const { path } = delocalize(here);
  const other: Lang = lang === "ja" ? "en" : "ja";
  return (
    <Link className="tag lang-switch" href={localize(other, path)} lang={other} rel="alternate">
      {other === "ja" ? "日本語" : "English"}
    </Link>
  );
}
