# Golden screenshots

Full-page captures of the live site, kept as references, not compared by
a test: a page's height is measured by `e2e/tool-prose.spec.ts`; these are
for the eye.

| file | page | taken | what it shows |
|---|---|---|---|
| `tracer-before-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.124 | the two blocks of text: the 6,604-character caption and the 23,341-character paragraph; 18,247 CSS px tall at 390 |
| `tracer-golden-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.135 | the reference (owner's call): both set as paragraphs by pretext, the prose in 12 headed chunks (data/articles.json), each folded behind a faded peek and "Read on ›", the article link in the prose gutter; 9,586 CSS px tall at 390, 6,468 at 1280. (At 1.0.134 with 23 chunks: 11,468 and 8,268; at 1.0.133, one fold per section: 6,846 and 4,081.) |

Phone is Playwright's iPhone 13 (390 wide, 3x); desk is 1280×900.
