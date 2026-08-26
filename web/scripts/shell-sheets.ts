/**
 * The paper sheets for the console shell: the annotated master geometry for
 * the pack's test matrix (M1) and a parts sheet (M2), as SVG, drawn from the
 * same solver the page runs. Nothing here is typed in: every dimension on a
 * sheet is read off `solve()` and every colour off style/tokens.static.css.
 *
 *     bun scripts/shell-sheets.ts            writes out/shell/*.svg
 *
 * Paper ground, house paper (ISSUES #12): the pack's drafting-blue field is
 * replaced by the site's own paper and ink, because a sheet about this
 * console is documentation and documentation here is paper. The BP-3 line
 * language is kept exactly: hatch is the playfield, dash is action safe,
 * cross-hatch is text safe, solid is the mask, dash-dot is a guide.
 *
 * Output is generated and not committed (.gitignore: web/out/).
 */
import fs from "node:fs";
import path from "node:path";
import { lint, points, rectPoly, type Rect } from "../lib/shell/geom";
import { FRAME_U, lintSolved, solve } from "../lib/shell/solve";

const OUT = path.join(import.meta.dirname, "..", "out", "shell");
fs.mkdirSync(OUT, { recursive: true });

// One copy of the palette: the generated :root block the zoo reads.
const tokens = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "style", "tokens.static.css"), "utf8");
const tok = (name: string): string => {
  const m = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`tokens.static.css: no ${name}`);
  const v = m[1].trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? tok(ref[1]) : v;
};
const PAPER = tok("--color-paper"), INK = tok("--color-ink"), MUTED = tok("--color-ink-muted"), FAINT = tok("--color-ink-faint");
const ACCENT = tok("--color-burnt-ink"), DATA = tok("--color-ocean-ink"), OK = tok("--color-forest-ink");

const MATRIX: [string, number, number][] = [
  ["9:19.5", 390, 844], ["9:16", 1080, 1920], ["3:4", 768, 1024], ["1:1", 1000, 1000],
  ["4:3", 1024, 768], ["16:9", 1920, 1080], ["21:9", 2520, 1080],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const mono = `font-family="IBM Plex Mono, ui-monospace, monospace"`;

function defs() {
  return `<defs>
  <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${DATA}" stroke-width="0.6" opacity="0.5"/></pattern>
  <pattern id="xhatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M6 0L0 6" stroke="${ACCENT}" stroke-width="0.5" opacity="0.5"/></pattern>
  <pattern id="grid8" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="${FAINT}" stroke-width="0.25"/></pattern>
</defs>`;
}

function legend(x: number, y: number) {
  const rows: [string, string][] = [
    [`<rect x="0" y="0" width="28" height="8" fill="url(#hatch)" stroke="${INK}" stroke-width="0.4"/>`, "playfield: the whole native screen, 128 x 128"],
    [`<rect x="0" y="0" width="28" height="8" fill="none" stroke="${INK}" stroke-width="0.6" stroke-dasharray="3 2"/>`, "action safe: 5 percent of S in from the mask"],
    [`<rect x="0" y="0" width="28" height="8" fill="url(#xhatch)" stroke="${INK}" stroke-width="0.4"/>`, "text safe: 10 percent, never the corners"],
    [`<rect x="0" y="0" width="28" height="8" fill="none" stroke="${INK}" stroke-width="1"/>`, "mask: the chamfered octagon, c = S/9"],
    [`<rect x="0" y="0" width="28" height="8" fill="none" stroke="${MUTED}" stroke-width="0.6" stroke-dasharray="5 2 1 2"/>`, "guide: not rendered"],
    [`<rect x="0" y="0" width="28" height="8" fill="none" stroke="${OK}" stroke-width="0.8"/>`, "dock: a part's box, local origin at its centre"],
  ];
  return `<g transform="translate(${x} ${y})" ${mono} font-size="6" fill="${INK}">
  <text y="-4" font-size="7" font-weight="600" letter-spacing="0.5">LEGEND</text>
  ${rows.map(([swatch, word], i) => `<g transform="translate(0 ${i * 13})">${swatch}<text x="34" y="6.5">${esc(word)}</text></g>`).join("\n  ")}
</g>`;
}

function dim(x1: number, y1: number, x2: number, y2: number, label: string, side = 6) {
  const horizontal = y1 === y2;
  const tx = (x1 + x2) / 2, ty = (y1 + y2) / 2;
  const tick = horizontal ? `M${x1} ${y1 - 3}V${y1 + 3}M${x2} ${y2 - 3}V${y2 + 3}` : `M${x1 - 3} ${y1}H${x1 + 3}M${x2 - 3} ${y2}H${x2 + 3}`;
  return `<g stroke="${MUTED}" stroke-width="0.5" fill="none"><path d="M${x1} ${y1}L${x2} ${y2}${tick}"/></g>
<text x="${horizontal ? tx : x1 - side}" y="${horizontal ? ty - side : ty}" ${mono} font-size="5.5" fill="${MUTED}" text-anchor="${horizontal ? "middle" : "end"}" dominant-baseline="${horizontal ? "auto" : "middle"}">${esc(label)}</text>`;
}

/** One ratio's master sheet: the shell in units, annotated. */
function master(name: string, W: number, H: number): string {
  const s = solve(W, H, 0);
  const faults = lintSolved(s);
  if (faults.length) throw new Error(`${name}: ${faults.length} lint faults, first: ${faults[0].why}`);
  const Hu = s.Hu;
  const pad = 40, legendW = 200;
  const sheetW = FRAME_U + pad * 2 + legendW, sheetH = Math.max(Hu, 170) + pad * 2 + 30;
  const a = s.screenPx / s.ppu; // native square in units
  const win: Rect = { x: s.mask.x + (s.S - a) / 2, y: s.mask.y + (s.S - a) / 2, w: a, h: a };
  const inset = (p: number) => ({ x: s.mask.x + s.S * p, y: s.mask.y + s.S * p, w: s.S * (1 - 2 * p), h: s.S * (1 - 2 * p) });
  const act = inset(0.05), txt = inset(0.10);
  const g: string[] = [];
  g.push(`<rect x="0" y="0" width="${FRAME_U}" height="${Hu}" fill="url(#grid8)" stroke="${INK}" stroke-width="0.6"/>`);
  for (const [id, z] of Object.entries(s.zones)) {
    g.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="none" stroke="${MUTED}" stroke-width="0.6" stroke-dasharray="5 2 1 2"/>`);
    g.push(`<text x="${z.x + 3}" y="${z.y + 7}" ${mono} font-size="5" fill="${MUTED}">${id}</text>`);
  }
  for (const f of s.facets) g.push(`<polygon points="${points(f.poly)}" fill="${f.tone === "lit" ? FAINT : MUTED}" fill-opacity="${f.family === "bezel" ? 0.35 : 0.18}" stroke="${MUTED}" stroke-width="0.25"/>`);
  g.push(`<rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" fill="url(#hatch)" stroke="${INK}" stroke-width="0.4"/>`);
  g.push(`<rect x="${act.x}" y="${act.y}" width="${act.w}" height="${act.h}" fill="none" stroke="${INK}" stroke-width="0.5" stroke-dasharray="3 2"/>`);
  g.push(`<polygon points="${points(rectPoly(txt))}" fill="url(#xhatch)" stroke="${INK}" stroke-width="0.4"/>`);
  g.push(`<polygon points="${points(s.mask.poly)}" fill="none" stroke="${INK}" stroke-width="1"/>`);
  for (const d of s.docks) {
    const b = d.box;
    g.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${OK}" stroke-width="0.8" ${d.ghost ? 'stroke-dasharray="2 1"' : ""}/>`);
    g.push(`<path d="M${b.x + b.w / 2 - 2} ${b.y + b.h / 2}h4M${b.x + b.w / 2} ${b.y + b.h / 2 - 2}v4" stroke="${OK}" stroke-width="0.5"/>`);
    g.push(`<text x="${b.x + 1.5}" y="${b.y + 5.5}" ${mono} font-size="4.5" fill="${OK}">${d.id}${d.variant === "stack" ? "/s" : ""}${d.ghost ? " ghost" : ""}</text>`);
  }
  // Dimensions: S, c, m, the window, and the frame.
  const sy = s.zones.header ? -10 : s.mask.y - s.m - 10; // above the header strip when there is one
  g.push(dim(s.mask.x, sy, s.mask.x + s.S, sy, `S = ${s.S}u`));
  g.push(dim(s.mask.x - s.m - 10, s.mask.y, s.mask.x - s.m - 10, s.mask.y + s.c, `c = ${s.c}u`, 2));
  g.push(dim(s.mask.x - s.m, s.mask.y + s.S + s.m + 6, s.mask.x, s.mask.y + s.S + s.m + 6, `m = ${s.m}u`, 2));
  g.push(dim(win.x, win.y + win.h + 4, win.x + win.w, win.y + win.h + 4, `${s.screenPx}px = 128 x ${s.k}`, -6));
  g.push(dim(0, Hu + 12, FRAME_U, Hu + 12, `${FRAME_U}u = ${W}px`));
  g.push(dim(FRAME_U + 12, 0, FRAME_U + 12, Hu, `${+Hu.toFixed(1)}u = ${H}px`, -2));

  const notes = [
    `ratio ${name}, ${W} x ${H} px, 1u = ${+s.ppu.toFixed(4)} px`,
    `mask S = ${s.S}u (${Math.round(s.S * s.ppu)} px), chamfer c = ${s.c}u, bezel m = ${s.m}u`,
    `native 128 x 128 at k = ${s.k}: ${s.screenPx} px, box ${s.boxPx} px (game.js inset 18)`,
    `guaranteed visible: 128 of 128 (ISSUES #1)`,
    `zones: ${Object.keys(s.zones).join(", ") || "none (square band: ghost overlay)"}`,
    `docked: ${s.docks.map((d) => d.id).join(" ")}`,
    `facets: ${s.facets.length} (${s.facets.filter((f) => f.family === "bezel").length} bezel, ${s.facets.filter((f) => f.family === "fill").length} fill), seed 0`,
    `touch floor 88 px = ${s.touchU}u on the grid`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW * 4}" height="${sheetH * 4}">
${defs()}
<rect width="100%" height="100%" fill="${PAPER}"/>
<g transform="translate(${pad} ${pad})">
${g.join("\n")}
</g>
<g transform="translate(${FRAME_U + pad + 36} ${pad})" ${mono} fill="${INK}">
  <text font-size="9" font-weight="600" letter-spacing="0.6">CONSOLE SHELL, MASTER GEOMETRY</text>
  <text y="12" font-size="6" fill="${MUTED}">tinymachines.ai/6502/games, solved by web/lib/shell/solve.ts</text>
  ${notes.map((n, i) => `<text y="${28 + i * 9}" font-size="5.5">${esc(n)}</text>`).join("\n  ")}
  ${legend(0, 120)}
</g>
<text x="${pad}" y="${sheetH - 8}" ${mono} font-size="5" fill="${MUTED}">${esc(s.params)}  |  grid 8u, angles 0/45/90, lint clean  |  generated by scripts/shell-sheets.ts</text>
</svg>
`;
}

for (const [name, W, H] of MATRIX) {
  const file = path.join(OUT, `master-${name.replace(/[:.]/g, "_")}.svg`);
  fs.writeFileSync(file, master(name, W, H));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

// A lint over the kit's own polygons is in lib/shell/kit.test.tsx; the parts
// sheet is the live page's kit at /6502/games, which the e2e suite shoots.
const total = MATRIX.length;
if (total < 7) throw new Error("the matrix lost a ratio");
void lint;
