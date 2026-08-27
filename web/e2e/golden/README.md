# Golden screenshots

Full-page captures of the live site, kept as references, not compared by
a test: a page's height is measured by `e2e/tool-prose.spec.ts`; these are
for the eye.

| file | page | taken | what it shows |
|---|---|---|---|
| `tracer-before-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.124 | the two blocks of text: the 6,604-character caption and the 23,341-character paragraph; 18,247 CSS px tall at 390 |
| `tracer-golden-{phone,desk}.jpg` | /6502/tracer | 2026-08-27, 1.0.133 | the reference (owner's call): both set as paragraphs by pretext, the prose folded after its opening behind "Read on", the article link in the prose gutter; 6,846 CSS px tall at 390, 4,081 at 1280 |

Phone is Playwright's iPhone 13 (390 wide, 3x); desk is 1280×900.
