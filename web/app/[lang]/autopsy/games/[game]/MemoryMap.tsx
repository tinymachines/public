import type { Lang } from "@/lib/lang";
import type { AutopsyGame } from "@/lib/autopsy";

/**
 * Where the object tables sit: the console's own memory as rows of 256
 * bytes, with each table's columns laid at their addresses. The drawings
 * under it show a table's shape; this shows its place, and what else of
 * the record has an address: the positions a rule saw compared and the
 * busiest shared bytes.
 *
 * A table whose columns do not overlap is parallel arrays, and each
 * column is a span of its own, filled as ObjectTable fills it. A table
 * whose columns overlap cannot be that: the things lie one after another,
 * each with all its properties, so it is one outline with a mark where
 * each property starts.
 *
 * Reaches through an index that belong to no table are left out on
 * purpose. The loops that clear memory reach nearly every byte, and a map
 * tinted end to end says nothing.
 *
 * Structure only, as ObjectTable: currentColor, roles by form and letter,
 * the ledger's frame. The seams are the class names and data attributes.
 */

const PAGE = 256;
const PAGES = 8;
const RAM = PAGE * PAGES;

const WORDS = {
  en: {
    label: (bytes: string, tables: string) => `The console's ${bytes} bytes of memory with ${tables} object tables at their addresses`,
    caption: (bytes: string, page: string) => `The console's ${bytes} bytes of memory, one row for each ${page}.`,
    tables:
      " A numbered span is a column of one of the object tables drawn below, counted in the same order, as long as the table and filled as it is there. Where a table's columns overlap, its things lie one after another, each with all its properties, so the table is one outline with a mark where each property starts.",
    compared: " A dark square is a position a rule saw compared.",
    busy: (kept: string) => ` A tick under a row is one of the ${kept} busiest shared bytes.`,
    outside: (count: string) => ` ${count} of those are in memory on the cartridge and are not on this map.`,
    stack: " The second row is the page the processor keeps its stack in.",
    rest: " Reaches through an index that belong to no table are not drawn: the loops that clear memory reach nearly every byte.",
    crowded: (count: string) => ` ${count} labels are left out where columns sit too close to name each one; the drawings below name them all.`,
  },
  ja: {
    label: (bytes: string, tables: string) => `コンソールのメモリ ${bytes} バイトと、それぞれのアドレスに置いた ${tables} 個の物体の表`,
    caption: (bytes: string, page: string) => `コンソールのメモリ ${bytes} バイト。一行が ${page} バイト。`,
    tables:
      " 番号の付いた帯は、下に描いた物体の表の列の一つで、番号は下の並び順と同じ。長さは表と同じで、塗り方も下の図と同じだ。表の列どうしが重なる所では、ものが一つずつ、それぞれの性質をすべて持って順に並んでいるので、表は一つの輪郭として描き、性質が始まる所ごとに印を付けてある。",
    compared: " 濃い四角は、規則が比較を見た位置。",
    busy: (kept: string) => ` 行の下の印は、最も忙しい共有バイト ${kept} 個のうちの一つ。`,
    outside: (count: string) => ` そのうち ${count} 個はカートリッジ側のメモリにあり、この図には無い。`,
    stack: " 二行目は、プロセッサがスタックを置くページだ。",
    rest: " 添字で届いた範囲のうち、どの表にも属さないものは描いていない: メモリを消すループは、ほとんどすべてのバイトに届くからだ。",
    crowded: (count: string) => ` 列が近すぎて一つずつ名前を書けない所では、ラベルを ${count} 個省いた。下の図にはすべての名前がある。`,
  },
} as const;

const num = (base: string) => parseInt(base.slice(1), 16);
const hex4 = (v: number) => `$${v.toString(16).toUpperCase().padStart(4, "0")}`;

type Span = { table: number; from: number; to: number; marks: string; fill: string; opacity: number; outline: boolean };
type Mark = { table: number; at: number; marks: string };

/** One span, cut where it crosses a row and where the console's memory ends. */
function rows(from: number, to: number): { page: number; x0: number; x1: number }[] {
  const out = [];
  for (let a = from; a < Math.min(to, RAM); ) {
    const page = Math.floor(a / PAGE);
    const end = Math.min(to, (page + 1) * PAGE, RAM);
    out.push({ page, x0: a - page * PAGE, x1: end - page * PAGE });
    a = end;
  }
  return out;
}

export function MemoryMap({ lang, g }: { lang: Lang; g: AutopsyGame }) {
  const S = WORDS[lang];
  const n = (v: number) => v.toLocaleString(lang);
  const id = "memory-map";

  const spans: Span[] = [];
  const marks: Mark[] = [];
  // What is written over a span's first byte: the tables that start a
  // column there and what the rules said of it. Two tables can share a
  // column, so the labels are gathered by address before any is drawn.
  const named = new Map<number, { tables: Set<number>; marks: string }>();
  const name = (at: number, table: number, role: string) => {
    const l = named.get(at) ?? { tables: new Set<number>(), marks: "" };
    l.tables.add(table + 1);
    for (const c of role) if (!l.marks.includes(c)) l.marks += c;
    named.set(at, l);
  };
  g.object_list.forEach((t, k) => {
    const has = (list: string[] | undefined, b: string) => (list ?? []).includes(b);
    const role = (b: string) => [has(t.x, b) && "X", has(t.y, b) && "Y", has(t.adds, b) && "+", has(t.chooses, b) && "→", has(t.down, b) && "↓"].filter(Boolean).join("");
    const bases = [...new Set([...t.x, ...t.y, ...t.with])].sort((a, b) => num(a) - num(b)).filter((b) => num(b) < RAM);
    if (!bases.length) return;
    const overlapping = bases.some((b, i) => i + 1 < bases.length && num(b) + t.slots > num(bases[i + 1]));
    if (overlapping) {
      spans.push({ table: k, from: num(bases[0]), to: num(bases[bases.length - 1]) + t.slots, marks: "", fill: "none", opacity: 1, outline: true });
      for (const b of bases) marks.push({ table: k, at: num(b), marks: role(b) });
      // Its properties start a byte or two apart, so they are named once, in address order, at its start.
      name(num(bases[0]), k, bases.map(role).join(""));
      return;
    }
    bases.forEach((b) => {
      const position = has(t.x, b) || has(t.y, b);
      const fill = position ? "currentColor" : has(t.adds, b) ? `url(#${id}-adds)` : has(t.chooses, b) ? `url(#${id}-chooses)` : has(t.down, b) ? `url(#${id}-down)` : "none";
      spans.push({ table: k, from: num(b), to: num(b) + t.slots, marks: role(b), fill, opacity: position ? 0.16 : 1, outline: false });
      name(num(b), k, role(b));
    });
  });

  // The bytes a rule saw compared, from the evidence of every routine that compared positions.
  const compared = new Set<number>();
  for (const r of g.routine_list) {
    for (const i of r.is) {
      if (i.pattern !== "position-compare") continue;
      for (const axis of ["x", "y"]) {
        for (const cell of String(i.evidence[axis] ?? "").split(",")) if (cell && num(cell) < RAM) compared.add(num(cell));
      }
    }
  }
  const busy = g.variable_list.map((v) => num(v.addr)).filter((a) => a < RAM);
  if (!spans.length && !compared.size && !busy.length) return null;

  const BW = 2; // one byte
  const LEFT = 46;
  const TOP = 20;
  const PITCH = 46;
  const BAND = 14; // the labels over a row
  const SH = 16; // the strip
  const W = LEFT + PAGE * BW + 10;
  const H = TOP + PAGES * PITCH;
  const y = (page: number) => TOP + page * PITCH + BAND;
  const x = (offset: number) => LEFT + offset * BW;

  // Left to right along each row, a label is kept only where the one before it has ended.
  const CHAR = 6.5;
  const labels: { at: number; text: string }[] = [];
  let crowded = 0;
  let edge = { page: -1, x: 0 };
  for (const [at, l] of [...named].sort((a, b) => a[0] - b[0])) {
    const page = Math.floor(at / PAGE);
    const text = `${[...l.tables].sort((a, b) => a - b).join(",")}${l.marks}`;
    const at0 = x(at - page * PAGE);
    if (edge.page === page && at0 < edge.x) {
      crowded += 1;
      continue;
    }
    labels.push({ at, text });
    edge = { page, x: at0 + text.length * CHAR + 3 };
  }

  return (
    <figure className="diagram autopsy-memory-map" data-autopsy-memory-map={g.object_list.length}>
      <div className="ledger">
        <div className="scroller">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={S.label(n(RAM), n(g.object_list.length))} style={{ display: "block", maxWidth: "none", color: "inherit" }}>
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
            <g className="autopsy-map-ruler" fontSize="9" fill="currentColor" fillOpacity="0.7" textAnchor="middle">
              {[0, 64, 128, 192].map((o) => (
                <text key={o} x={x(o)} y={TOP - 8}>
                  {o.toString(16).toUpperCase().padStart(2, "0")}
                </text>
              ))}
            </g>
            {Array.from({ length: PAGES }, (_, page) => (
              <g key={page} className="autopsy-map-page" data-autopsy-map-page={hex4(page * PAGE)}>
                <text x={LEFT - 6} y={y(page) + SH - 4} fontSize="10" fill="currentColor" textAnchor="end">
                  {hex4(page * PAGE)}
                </text>
                <rect x={LEFT} y={y(page)} width={PAGE * BW} height={SH} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
                {[64, 128, 192].map((o) => (
                  <line key={o} x1={x(o)} y1={y(page) + SH} x2={x(o)} y2={y(page) + SH + 3} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
                ))}
              </g>
            ))}
            {spans.map((s, i) => (
              <g key={i} className="autopsy-map-span" data-autopsy-map-table={s.table + 1} data-autopsy-map-from={hex4(s.from)} data-autopsy-marks={s.marks}>
                {rows(s.from, s.to).map((r) => {
                  const w = (r.x1 - r.x0) * BW;
                  return (
                    <g key={r.page}>
                      <rect
                        x={x(r.x0)}
                        y={y(r.page) + 1}
                        width={w}
                        height={SH - 2}
                        fill={s.fill}
                        fillOpacity={s.opacity}
                        stroke="currentColor"
                        strokeOpacity={s.outline ? 0.9 : 0.55}
                        strokeWidth={s.outline ? 1.5 : 1}
                        strokeDasharray={s.outline ? "4 2" : undefined}
                      />
                    </g>
                  );
                })}
              </g>
            ))}
            <g className="autopsy-map-marks">
              {marks.map((m) => {
                const page = Math.floor(m.at / PAGE);
                const o = m.at - page * PAGE;
                return (
                  <g key={`${m.table}-${m.at}`} data-autopsy-map-mark={hex4(m.at)}>
                    <line x1={x(o) + BW / 2} y1={y(page) - 2} x2={x(o) + BW / 2} y2={y(page) + SH} stroke="currentColor" strokeWidth="1" />
                  </g>
                );
              })}
            </g>
            <g className="autopsy-map-labels" fontSize="10" fontWeight="700" fill="currentColor">
              {labels.map((l) => {
                const page = Math.floor(l.at / PAGE);
                return (
                  <text key={l.at} data-autopsy-map-label={hex4(l.at)} x={x(l.at - page * PAGE)} y={y(page) - 3}>
                    {l.text}
                  </text>
                );
              })}
            </g>
            <g className="autopsy-map-compared">
              {[...compared].sort((a, b) => a - b).map((a) => {
                const page = Math.floor(a / PAGE);
                return <rect key={a} data-autopsy-map-compared={hex4(a)} x={x(a - page * PAGE)} y={y(page) + 1} width={BW} height={SH - 2} fill="currentColor" fillOpacity="0.75" />;
              })}
            </g>
            <g className="autopsy-map-busy">
              {busy.map((a) => {
                const page = Math.floor(a / PAGE);
                const cx = x(a - page * PAGE) + BW / 2;
                const ty = y(page) + SH + 2;
                return <path key={a} data-autopsy-map-busy={hex4(a)} d={`M ${cx} ${ty} l -3 6 h 6 z`} fill="currentColor" />;
              })}
            </g>
          </svg>
        </div>
      </div>
      <figcaption>
        {S.caption(n(RAM), n(PAGE))}
        {spans.length ? S.tables : ""}
        {compared.size ? S.compared : ""}
        {busy.length ? S.busy(n(g.variable_list.length)) : ""}
        {busy.length && busy.length < g.variable_list.length ? S.outside(n(g.variable_list.length - busy.length)) : ""}
        {S.stack}
        {S.rest}
        {crowded ? S.crowded(n(crowded)) : ""}
      </figcaption>
    </figure>
  );
}
