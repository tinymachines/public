import { expect, test, type Page } from "@playwright/test";
import { BASE, DESK, open } from "./lib";

/**
 * The flag lands on the twin, and the twin arrives in its own language.
 *
 * The owner's report on 2026-08-28 was "the menu changes and the page does
 * not", which has two possible causes and they need separating. One is a
 * routing fault: the client router keeps the document it has and re-renders
 * the chrome around stale content. The other is coverage: the page has no
 * Japanese body, so the chrome is the only thing that CAN change. Measured,
 * it was the second (data/check-i18n.py --live counts it), and this spec is
 * what keeps the first from ever being the answer.
 *
 * The claim is read off the server rather than off a list. Both spellings of
 * the page are fetched, and a leg is only asserted where those two actually
 * differ in language: then whatever the server serves at the destination is
 * what the click has to produce. A page translated tomorrow is covered
 * tomorrow, and a page with no translation is not asserted to have one.
 */

const KANA_CJK = /[぀-ヿ㐀-鿿]/g;
const LATIN = /[A-Za-z]/g;

/** The share of the letters here that are Japanese. */
function share(text: string): number {
  const ja = (text.match(KANA_CJK) ?? []).length;
  const la = (text.match(LATIN) ?? []).length;
  return ja + la === 0 ? 0 : ja / (ja + la);
}

/**
 * The page's own document. <main> where there is one, the whole document
 * where there is not: the Lab is a full-bleed instrument and ships no <main>,
 * and a locator waiting for one there is a four minute hang, which is how
 * this spec failed the first time it ran.
 */
function servedBody(html: string): string {
  const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
  return (m ? m[1] : html)
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function arrivedBody(page: Page): Promise<string> {
  const main = page.locator("main");
  return (await main.count()) ? main.first().innerText() : page.locator("body").innerText();
}

/** An ordinary page, a track, a docs page, and both module pages. */
const SAMPLE = ["/", "/6502", "/6502/tools", "/docs/6502/the-api", "/6502/games", "/6502/lab"];
const twinOf = (p: string) => (p.startsWith("/ja") ? p.slice(3) || "/" : p === "/" ? "/ja" : `/ja${p}`);

for (const dir of ["English to Japanese", "Japanese to English"] as const) {
  test(`the flag lands on the twin, ${dir}`, async ({ page, request }) => {
    test.slow();
    await page.setViewportSize(DESK);
    let asserted = 0;
    const wrong: string[] = [];

    for (const base of SAMPLE) {
      const from = dir === "English to Japanese" ? base : twinOf(base);
      const to = twinOf(from);

      await open(page, from, 900);
      const flag = page.locator("a.lang-switch").first();
      expect(await flag.count(), `${from}: one flag`).toBe(1);
      expect(await flag.getAttribute("href"), `${from}: the flag points at the twin`).toBe(to);

      await flag.click();
      await page.waitForURL(`**${to}`, { timeout: 30_000 });
      await page.waitForTimeout(1200);
      expect(new URL(page.url()).pathname, `${from}: landed`).toBe(to);
      expect(await page.getAttribute("html", "lang"), `${to}: declares its language`).toBe(to.startsWith("/ja") ? "ja" : "en");

      const here = share(servedBody(await (await request.get(BASE + from)).text()));
      const there = share(servedBody(await (await request.get(BASE + to)).text()));
      // Only where the two spellings differ in language is there a flip to
      // observe. Where they do not, the page has no Japanese body: a coverage
      // gap that check-i18n counts, and asserting on it here would be
      // asserting on the gap.
      if (Math.abs(there - here) < 0.2) continue;

      const arrived = share(await arrivedBody(page));
      if (Math.abs(arrived - there) > 0.15) {
        wrong.push(`${from} -> ${to}: the server serves ${Math.round(there * 100)}% Japanese there, the click produced ${Math.round(arrived * 100)}%`);
      }
      asserted++;
    }

    // A check that can pass on nothing is not a check.
    expect(asserted, "pages with a language to arrive in").toBeGreaterThan(2);
    expect(wrong, "the click re-rendered the chrome and kept the body").toEqual([]);
  });
}
