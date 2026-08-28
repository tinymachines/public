import { describe, expect, test } from "bun:test";
import { delocalize, localize } from "./lang";

/**
 * The two languages, and the one thing that went wrong with them.
 *
 * English is served unprefixed and rewritten onto `app/[lang]`, so a path has
 * two spellings: the public one (`/6502/lab`) and the internal one
 * (`/en/6502/lab`), and a client component reading `usePathname()` in a
 * prerendered page is handed the second. Every English page shipped a
 * language switch pointing at `/ja/en/...` until `delocalize` was taught to
 * read it (2026-08-28).
 */

describe("delocalize", () => {
  test("a public English path is English and unchanged", () => {
    expect(delocalize("/6502/lab")).toEqual({ lang: "en", path: "/6502/lab" });
    expect(delocalize("/")).toEqual({ lang: "en", path: "/" });
  });

  test("the internal English spelling is English too, and the prefix comes off", () => {
    expect(delocalize("/en/6502/lab")).toEqual({ lang: "en", path: "/6502/lab" });
    expect(delocalize("/en")).toEqual({ lang: "en", path: "/" });
  });

  test("Japanese, both spellings of the root", () => {
    expect(delocalize("/ja/6502/lab")).toEqual({ lang: "ja", path: "/6502/lab" });
    expect(delocalize("/ja")).toEqual({ lang: "ja", path: "/" });
  });

  test("a path that merely starts with those letters is untouched", () => {
    expect(delocalize("/engine")).toEqual({ lang: "en", path: "/engine" });
    expect(delocalize("/japan/notes")).toEqual({ lang: "en", path: "/japan/notes" });
  });
});

describe("the language switch's href, which is the pair of them", () => {
  const other = (lang: "en" | "ja") => (lang === "ja" ? "en" : "ja");
  const href = (lang: "en" | "ja", here: string) => localize(other(lang), delocalize(here).path);

  test("from an English page, in either spelling, it points at the Japanese one", () => {
    expect(href("en", "/6502/lab")).toBe("/ja/6502/lab");
    expect(href("en", "/en/6502/lab")).toBe("/ja/6502/lab");
    expect(href("en", "/en")).toBe("/ja");
  });

  test("and back", () => {
    expect(href("ja", "/ja/6502/lab")).toBe("/6502/lab");
    expect(href("ja", "/ja")).toBe("/");
  });

  test("never a doubled prefix, which is the bug this file exists for", () => {
    for (const here of ["/", "/en", "/en/", "/6502/lab", "/en/6502/lab", "/ja", "/ja/6502/lab"]) {
      for (const lang of ["en", "ja"] as const) {
        expect(href(lang, here), here).not.toMatch(/\/ja\/en|\/en\/ja|\/ja\/ja/);
      }
    }
  });
});
