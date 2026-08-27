# Golden screenshots

Full-page captures of the live site, kept as references, not compared by
a test: a page's height is measured by `e2e/tool-prose.spec.ts`; these are
for the eye.

| file | page | taken | what it shows |
|---|---|---|---|
| `tracer-before-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.124 | the two blocks of text: the 6,604-character caption and the 23,341-character paragraph; 18,247 CSS px tall at 390 |
| `tracer-golden-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.138 | the reference (owner's call): the two-tone headline, the prose in 12 headed chunks (data/articles.json) behind ONE "Read on ›" that travels down the page, the long caption under the drawing hidden, the article link in the prose gutter; 4,321 CSS px tall at 390, 3,248 at 1280. (Earlier today: 9,586/6,468 at 1.0.135 with a Read on per chunk; 6,846/4,081 at 1.0.133 with one fold per section; 18,247 before any of it.) |

Phone is Playwright's iPhone 13 (390 wide, 3x); desk is 1280×900.
