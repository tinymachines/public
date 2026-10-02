import type { Lang } from "@/lib/lang";
import type { AutopsyGame } from "@/lib/autopsy";

/**
 * An object table, drawn: each array the routines step through together
 * is a column at its address, each slot a row, so one thing on the screen
 * is one row across all of them. What the rules could say about a column
 * is drawn into it: a position (and the slots seen compared, darker),
 * what is added into the positions, what chose a jump, what only counts
 * down. The rest are outlines, travelling with them and not yet named.
 *
 * Structure only, in the page's own ink: every stroke and fill is
 * currentColor, the roles are told apart by form (solid, hatch, dots,
 * lines) and by a letter, and the frame is the ledger's. The seams for a
 * style are the class names on the figure and the groups.
 */

type Table = AutopsyGame["object_list"][number];

const WORDS = {
  en: {
    caption: (arrays: string, slots: string, routines: string) =>
      `${arrays} arrays of up to ${slots} slots that ${routines} routines step through together. Each column is an array at its address and each row a slot, so one thing on the screen is one row across all of them.`,
    cut: (shown: string, slots: string) => ` The first ${shown} of ${slots} slots are drawn.`,
    key: "X and Y are positions, and the darker squares are the slots a rule saw compared. + is added into a position, which is what a speed does. → chose a jump, which is what a state or a kind does. ↓ is only ever counted down, which is what a timer does. A plain outline travels with them and is not named yet.",
    label: (arrays: string, slots: string) => `An object table drawn as ${arrays} columns of up to ${slots} slots`,
  },
  ja: {
    caption: (arrays: string, slots: string, routines: string) =>
      `${routines} 個のルーチンが一緒にたどる、最大 ${slots} 枠の配列 ${arrays} 本。列はそれぞれのアドレスにある配列、行は枠で、画面上のもの一つが、すべての列を横切る一行になる。`,
    cut: (shown: string, slots: string) => ` ${slots} 枠のうち最初の ${shown} 枠を描いてある。`,
    key: "X と Y は位置で、濃い四角は規則が比較を見た枠。+ は位置に足し込まれる配列で、速度がすることだ。→ はジャンプを選んだ配列で、状態や種類がすることだ。↓ は減らされる一方の配列で、タイマーがすることだ。輪郭だけの列は一緒に動くが、まだ名付けていない。",
    label: (arrays: string, slots: string) => `最大 ${slots} 枠の列 ${arrays} 本として描いた物体の表`,
  },
} as const;

const num = (base: string) => parseInt(base.slice(1), 16);

/** The most rows drawn: a table longer than this is cut, and says so. */
const ROWS = 32;

export function ObjectTable({ lang, g, table, id }: { lang: Lang; g: AutopsyGame; table: Table; id: string }) {
  const S = WORDS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const bases = [...new Set([...table.x, ...table.y, ...table.with])].sort((a, b) => num(a) - num(b));
  const slotsOf = new Map(g.array_list.map((a) => [a.base, a.slots]));
  // The bytes a rule saw compared, from the evidence of every routine that compared positions.
  const compared = new Set<number>();
  for (const r of g.routine_list) {
    for (const i of r.is) {
      if (i.pattern !== "position-compare") continue;
      for (const axis of ["x", "y"]) {
        for (const cell of String(i.evidence[axis] ?? "").split(",")) if (cell) compared.add(num(cell));
      }
    }
  }
  const has = (list: string[] | undefined, b: string) => (list ?? []).includes(b);
  const most = Math.max(table.slots, ...bases.map((b) => slotsOf.get(b) ?? 0));
  const rows = Math.min(most, ROWS);

  const CW = 24;
  const RH = 14;
  const LEFT = 30;
  const TOP = 66;
  const W = LEFT + bases.length * CW + 8;
  const H = TOP + rows * RH + (most > rows ? 18 : 6);
  const every = rows <= 16 ? 1 : 4;

  return (
    <figure className="diagram autopsy-object-table" data-autopsy-object-drawing={bases.length}>
      <div className="ledger">
        <div className="scroller">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={S.label(n(bases.length), n(most))} style={{ display: "block", maxWidth: "none", color: "inherit" }}>
            <defs>
              <pattern id={`${id}-adds`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" strokeWidth="1.4" />
              </pattern>
              <pattern id={`${id}-chooses`} width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2.5" cy="2.5" r="1" fill="currentColor" />
              </pattern>
              <pattern id={`${id}-down`} width="4" height="4" patternUnits="userSpaceOnUse">
                <line x1="0" y1="2" x2="4" y2="2" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <g className="autopsy-object-slots" fontSize="9" fill="currentColor" textAnchor="end">
              {Array.from({ length: rows }, (_, r) => r)
                .filter((r) => r % every === 0)
                .map((r) => (
                  <text key={r} x={LEFT - 6} y={TOP + r * RH + RH - 4}>
                    {r}
                  </text>
                ))}
            </g>
            {bases.map((b, i) => {
              const x = LEFT + i * CW;
              const position = has(table.x, b) || has(table.y, b);
              const marks = [has(table.x, b) && "X", has(table.y, b) && "Y", has(table.adds, b) && "+", has(table.chooses, b) && "→", has(table.down, b) && "↓"].filter(Boolean).join("");
              const fill = position ? "currentColor" : has(table.adds, b) ? `url(#${id}-adds)` : has(table.chooses, b) ? `url(#${id}-chooses)` : has(table.down, b) ? `url(#${id}-down)` : "none";
              const slots = slotsOf.get(b) ?? table.slots;
              const drawn = Math.min(slots, rows);
              return (
                <g key={b} className="autopsy-object-array" data-autopsy-array={b} data-autopsy-marks={marks}>
                  <text x={x + CW / 2 + 3} y={TOP - 20} fontSize="10" fill="currentColor" transform={`rotate(-90 ${x + CW / 2 + 3} ${TOP - 20})`}>
                    {b}
                  </text>
                  <text x={x + (CW - 2) / 2} y={TOP - 5} fontSize="10" fontWeight="700" fill="currentColor" textAnchor="middle">
                    {marks}
                  </text>
                  {Array.from({ length: drawn }, (_, r) => (
                    <rect
                      key={r}
                      x={x}
                      y={TOP + r * RH}
                      width={CW - 2}
                      height={RH - 2}
                      fill={fill}
                      fillOpacity={position ? (compared.has(num(b) + r) ? 0.7 : 0.16) : 1}
                      stroke="currentColor"
                      strokeOpacity="0.45"
                      strokeWidth="1"
                    />
                  ))}
                  {slots > drawn ? (
                    <text x={x + (CW - 2) / 2} y={TOP + rows * RH + 11} fontSize="9" fill="currentColor" textAnchor="middle">
                      +{slots - drawn}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <figcaption>
        {S.caption(n(bases.length), n(most), n(table.routines))}
        {most > rows ? S.cut(n(rows), n(most)) : ""} {S.key}
      </figcaption>
    </figure>
  );
}
