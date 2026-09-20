import { describe, expect, test } from "bun:test";
import { bodyLang } from "./i18n";

/**
 * The measured half of the untranslated notice.
 *
 * A page whose copy goes through the overlay cannot tell from the route what
 * language it is about to render: `t()` hands back the English wherever
 * data/ja.json has no answer, silently and correctly. /hotbits/space rendered
 * entirely in English under Japanese chrome for as long as it existed for
 * exactly that reason. So the page measures what it got and decides the notice
 * from the measurement, which also means the notice withdraws itself the day
 * the overlay learns the sentences: nothing has to be remembered.
 */

const JA = "この文書はまだ翻訳されていません。";
const EN = "Four ways of looking at the same radioactive decay.";

describe("bodyLang", () => {
  test("English asks nothing: the route is the answer", () => {
    expect(bodyLang("en", [EN])).toBe("en");
    expect(bodyLang("en", [JA])).toBe("en");
  });

  test("Japanese copy under /ja is Japanese", () => {
    expect(bodyLang("ja", [JA, JA])).toBe("ja");
  });

  test("English copy under /ja is English, whatever the route says", () => {
    expect(bodyLang("ja", [EN, EN])).toBe("en");
  });

  test("Japanese prose carrying identifiers is still Japanese", () => {
    // The floor is a floor, not a grade: a translated page that names
    // `openapi.json` and 2A03 twenty times has not stopped being translated.
    expect(bodyLang("ja", [`${JA} openapi.json 2A03 RP2A03 NTSC ${JA}`])).toBe("ja");
  });

  test("one Japanese word in an English page does not carry it", () => {
    expect(bodyLang("ja", [`${EN} ${EN} ${EN} 文書`])).toBe("en");
  });

  test("copy with no letters makes no claim, so the route stands", () => {
    expect(bodyLang("ja", [])).toBe("ja");
    expect(bodyLang("ja", ["1234", " "])).toBe("ja");
  });
});
