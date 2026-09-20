import { expect, test, type APIRequestContext } from "@playwright/test";
import { BASE, DESK, en, JA_FLOOR, jaShare, noticeSentence, open, servedBody, twinOf } from "./lib";

/**
 * A page whose body is English says so, and a page whose body is Japanese
 * does not.
 *
 * The owner's report on 2026-08-28 was "the menu changes and the page does
 * not". Half of that is coverage, which data/check-i18n.py counts and nothing
 * in here should assert away. The other half is honesty, and it is this spec:
 * a document served under /ja that has no Japanese yet prints the sentence in
 * app/components/Untranslated.tsx, because a 404 would punish a reader for our
 * backlog and machine translation would put words in the owner's mouth.
 *
 * Both directions are checked, because the fault inverts. A page that serves
 * English and says nothing is the original complaint; a page that keeps the
 * notice after somebody translates it is the same lie the other way round, and
 * it is the one that arrives later. A site-wide version of this notice once
 * did exactly that: it showed on the translated pages and missed the
 * untranslated ones.
 *
 * Nothing here holds a list of which pages are translated. The claim is read
 * off the server and compared with the body the same server sends, so a page
 * translated tomorrow is checked tomorrow, in the other direction, with no
 * edit here.
 */

/**
 * Pages the sitemap leaves out on purpose (app/sitemap.ts says why) that carry
 * the notice. They are addresses a reader can be handed, and being out of the
 * sitemap is what kept /hotbits/space silent from the day it arrived: the only
 * counter walked the sitemap. data/check-i18n.py --live now walks the tree's
 * static routes as well, and these two are the ones this rule bites on.
 */
const UNLISTED = ["/hotbits/space", "/admin"];

const SENTENCE = noticeSentence();

/** The pages, and the twin of each, fetched a handful at a time. */
async function measure(request: APIRequestContext, paths: string[]) {
  const rows: { path: string; share: number; said: boolean; saidInEnglish: boolean }[] = [];
  for (let i = 0; i < paths.length; i += 8) {
    const batch = paths.slice(i, i + 8);
    rows.push(
      ...(await Promise.all(
        batch.map(async (p) => {
          const [enRes, jaRes] = await Promise.all([request.get(BASE + p), request.get(BASE + twinOf(p))]);
          if (!enRes.ok() || !jaRes.ok()) throw new Error(`${p}: HTTP ${enRes.status()} and ${jaRes.status()} at ${twinOf(p)}`);
          const enHtml = await enRes.text();
          const jaHtml = await jaRes.text();
          return {
            path: p,
            share: jaShare(servedBody(jaHtml)),
            said: jaHtml.includes(SENTENCE),
            saidInEnglish: enHtml.includes(SENTENCE),
          };
        }),
      )),
    );
  }
  return rows;
}

test("every page's notice agrees with the body it serves", async ({ request }) => {
  // Two requests a page over the whole site, so it is the site that is
  // measured and not a sample of it.
  test.setTimeout(600_000);
  const rows = await measure(request, [...en(), ...UNLISTED]);

  const english = rows.filter((r) => r.share < JA_FLOOR);
  const japanese = rows.filter((r) => r.share >= JA_FLOOR);
  // A check that can pass on nothing is not a check, and this one needs both
  // kinds of page to be a check at all: with no English bodies it asserts
  // nothing about the notice, and with no Japanese ones it asserts nothing
  // about its absence.
  expect(english.length, "pages serving an English body under /ja").toBeGreaterThan(20);
  expect(japanese.length, "pages serving a Japanese body").toBeGreaterThan(50);

  const silent = english.filter((r) => !r.said).map((r) => `${r.path} serves ${Math.round(r.share * 100)}% Japanese and says nothing`);
  const stale = japanese.filter((r) => r.said).map((r) => `${r.path} is ${Math.round(r.share * 100)}% Japanese and still prints the notice`);
  // The English spelling of a page is never the one making an excuse: the
  // notice speaks to a reader who asked for Japanese.
  const wrongSide = rows.filter((r) => r.saidInEnglish).map((r) => r.path);

  expect(silent, "an English body under /ja, with nothing on the page to say so").toEqual([]);
  expect(stale, "a Japanese body still apologising for being English").toEqual([]);
  expect(wrongSide, "the notice on the English spelling of a page").toEqual([]);
});

test("the notice is on the ported page a reader sees, above the English body", async ({ page }) => {
  await page.setViewportSize(DESK);
  await open(page, "/ja/6502/primer", 1500);
  const notice = page.locator("p.notice.untranslated");
  await expect(notice).toHaveCount(1);
  await expect(notice).toBeVisible();
  // textContent, not innerText: nothing here is CSS-transformed, but the rest
  // of the suite reads text this way for a reason and one rule is enough.
  expect((await notice.textContent())?.trim()).toBe(SENTENCE);
  expect(await notice.getAttribute("lang"), "the sentence is Japanese and says so").toBe("ja");

  // Above the document it is about, and before it: a notice a reader meets
  // after the page it explains is a footnote.
  const body = page.locator(".explorer-shell").first();
  const first = await page.evaluate(() => {
    const n = document.querySelector("p.notice.untranslated");
    const b = document.querySelector(".explorer-shell");
    return !!(n && b && n.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(first, "the notice comes first").toBe(true);
  const nb = (await notice.boundingBox())!;
  const bb = (await body.boundingBox())!;
  expect(nb.y + nb.height, "and sits above it").toBeLessThanOrEqual(bb.y + 1);
  // The body of a ported page is that tool's own English document, and says so
  // to a screen reader whatever the shell around it declares.
  expect(await body.getAttribute("lang")).toBe("en");

  // The same page in English explains nothing, because there is nothing to
  // explain.
  await open(page, "/6502/primer", 1500);
  await expect(page.locator("p.notice.untranslated")).toHaveCount(0);
});

test("a document's inLanguage is the language of its body", async ({ request }) => {
  // Two documents, one with a Japanese shadow in docs/ja and one without,
  // picked by measuring rather than by being listed: the page states the
  // language of its BODY, so the claim and the count cannot disagree. The
  // docs route decides both next to the import that makes the body English
  // (app/[lang]/docs/[[...slug]]/page.tsx).
  const paths = ["/ja/docs/6502/two-ways-in", "/ja/docs/6502/the-api"];
  const seen: string[] = [];
  for (const p of paths) {
    const html = await (await request.get(BASE + p)).text();
    const declared = [...new Set([...html.matchAll(/"inLanguage":"([a-z]{2})"/g)].map((m) => m[1]))];
    expect(declared.length, `${p}: one document, one language claimed`).toBe(1);
    const japanese = jaShare(servedBody(html)) >= JA_FLOOR;
    expect(declared[0], `${p}: the body is ${japanese ? "Japanese" : "English"}`).toBe(japanese ? "ja" : "en");
    expect(html.includes(SENTENCE), `${p}: the notice matches the body`).toBe(!japanese);
    seen.push(declared[0]);
  }
  // One of each, or this test has stopped covering the pair it was written for.
  expect([...seen].sort(), "a translated document and an untranslated one").toEqual(["en", "ja"]);
});
