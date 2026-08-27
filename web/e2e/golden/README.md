# Golden screenshots

Full-page captures of the live site, kept as references, not compared by
a test: a page's height is measured by `e2e/tool-prose.spec.ts`; these are
for the eye.

| file | page | taken | what it shows |
|---|---|---|---|
| `tracer-before-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.124 | the two blocks of text: the 6,604-character caption and the 23,341-character paragraph; 18,247 CSS px tall at 390 |
| `tracer-golden-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.141 | the reference (owner's call): the two-tone headline, the full-screen key on the strip's key row, the prose in 12 headed chunks (data/articles.json) behind ONE "Read on ›" that travels down the page and disappears once opened, the long caption under the drawing hidden, the article button in its own colour at the summary's size; about 4,326 CSS px tall at 390, 3,253 at 1280. (Earlier today: 9,586/6,468 at 1.0.135 with a Read on per chunk; 6,846/4,081 at 1.0.133 with one fold per section; 18,247 before any of it.) |

Phone is Playwright's iPhone 13 (390 wide, 3x); desk is 1280×900.
